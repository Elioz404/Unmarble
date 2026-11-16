import { useEffect, useMemo, useState } from 'react';
import type { BookEntry, SheetResponse } from '../../../shared/protocol/api.ts';
import { lessonsFor } from '../../../shared/puzzle/tutorial.ts';
import type { SoundBank } from '../../audio/sound.ts';
import { NOWHERE } from '../../game/attempt-sink.ts';
import type { Feedback, GameView, HintKind } from '../../game/controller.ts';
import type { StageMood } from '../../game/stage.ts';
import { localPrefs } from '../../lib/local-prefs.ts';
import type { Platform } from '../../platform/platform.ts';
import { blotLine, COPY } from '../copy.ts';
import { BookIcon, CloseIcon } from '../icons.tsx';
import { useStore } from '../hooks/use-store.ts';
import { LensButton, MessageLine, Plaque, SealRow, SheetPlaque, SoundToggle, TearMeter } from './Chrome.tsx';
import { ResultCard } from './ResultCard.tsx';
import { SheetStage } from './SheetStage.tsx';
import { useGame } from './use-game.ts';
import './game-screen.css';

export type GameNavigation = {
  readonly openBook: () => void;
  readonly compose: () => void;
  readonly play: (sheetId: string) => void;
};

type Props = {
  readonly platform: Platform;
  readonly response: SheetResponse;
  readonly sound: SoundBank;
  readonly muted: boolean;
  readonly onToggleMute: () => void;
  /** Reloads the sheet from the platform (after the attempt diverged). */
  readonly onReload: () => void;
  readonly navigation: GameNavigation;
};

type Message = { text: string; tone: 'quiet' | 'alert' | 'gilt' };

/** Pause on a finished lesson before the next one appears. */
const LESSON_PAUSE_MS = 900;

const HINT_COPY: Record<HintKind, string> = {
  round: COPY.hintRound,
  seam: COPY.hintSeam,
  swirl: COPY.hintSwirl,
  lens: COPY.hintLens,
};

const feedbackMessage = (feedback: Feedback): Message => {
  switch (feedback.kind) {
    case 'blot':
      return { text: blotLine(feedback.explanation?.reason ?? null), tone: 'alert' };
    case 'miss':
      return { text: COPY.miss, tone: 'quiet' };
    case 'correct':
      return { text: COPY.correct[feedback.id % COPY.correct.length] ?? '', tone: 'gilt' };
  }
};

/** The one line above the sheet: replay step, then feedback, then hint, then the standing prompt. */
const messageFor = (view: GameView, fallback: string): Message => {
  if (view.replayStep !== null) return { text: COPY.replayStep(view.replayStep + 1, view.total), tone: 'quiet' };
  if (view.feedback) return feedbackMessage(view.feedback);
  if (view.hint) return { text: HINT_COPY[view.hint], tone: 'quiet' };
  return { text: fallback, tone: 'quiet' };
};

const moodOf = (view: GameView): StageMood =>
  !view.settled ? 'floating' : view.status === 'clean' ? 'lifted' : view.status === 'torn' ? 'torn' : 'floating';

/** The full game: a lesson for each form the player has not met yet, then the sheet. */
export const GameScreen = ({ platform, response, sound, muted, onToggleMute, onReload, navigation }: Props) => {
  const { sheet } = response;
  // Lessons are decided once, when the sheet opens; a resumed attempt skips them.
  const [lessons] = useState(() =>
    response.player.log.length === 0 ? lessonsFor(sheet.spec, localPrefs.lessonSeen) : [],
  );
  const [lessonIndex, setLessonIndex] = useState(0);
  const [lessonAttempt, setLessonAttempt] = useState(0);
  const currentLesson = lessons[lessonIndex] ?? null;

  const setup = useMemo(
    () =>
      currentLesson
        ? {
            key: `lesson:${currentLesson.id}:${lessonAttempt}`,
            spec: currentLesson.spec,
            log: [],
            sink: NOWHERE,
            hints: false,
            standing: null,
          }
        : {
            key: sheet.id,
            spec: sheet.spec,
            log: response.player.log,
            sink: platform.sinkFor(sheet.id, response.player.log.length),
            hints: true,
            standing: response.standing,
          },
    [currentLesson, lessonAttempt, sheet, response.player.log, response.standing, platform],
  );
  const controller = useGame(setup, sound);
  const view = useStore(controller.view);

  // Lessons advance on a clean sheet and retry on a torn one.
  useEffect(() => {
    if (!currentLesson || !view.settled) return;
    const timer = window.setTimeout(() => {
      if (view.status === 'torn') {
        setLessonAttempt((n) => n + 1);
        return;
      }
      localPrefs.markLessonSeen(currentLesson.id);
      setLessonIndex((i) => i + 1);
    }, LESSON_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [currentLesson, view.settled, view.status]);

  const skipLessons = (): void => {
    lessons.forEach((lesson) => localPrefs.markLessonSeen(lesson.id));
    setLessonIndex(lessons.length);
  };

  // The attempt changed elsewhere (another device or tab): show the truth.
  useEffect(() => {
    if (view.desynced) onReload();
  }, [view.desynced, onReload]);

  // Once finished: where everyone tore it, and a trap to try next.
  const finished = currentLesson === null && view.settled;
  const [nextTrap, setNextTrap] = useState<BookEntry | null>(null);
  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    void platform.fetchScars(sheet.id).then((map) => {
      if (!cancelled && map) controller.showCommunityScars(map.points);
    });
    platform
      .loadBook()
      .then((book) => {
        if (cancelled) return;
        setNextTrap(book.traps.find((entry) => entry.status === 'unplayed' && entry.sheet.id !== sheet.id) ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [finished, platform, sheet.id, controller]);

  const fallback = currentLesson?.prompt ?? (view.remaining === view.total ? COPY.dailyPrompt : '');
  const message = messageFor(view, fallback);

  return (
    <main className="game" data-phase={finished ? 'result' : 'play'}>
      <header className="game__header">
        {currentLesson ? (
          <Plaque
            number={null}
            weekday="First sheets"
            stars={1}
            paletteName={COPY.lessonOf(lessonIndex + 1, lessons.length)}
            eyebrow={COPY.wordmark}
          />
        ) : (
          <SheetPlaque sheet={sheet} />
        )}
        <div className="game__tools">
          <button type="button" className="icon-button" onClick={navigation.openBook} aria-label={COPY.book.open}>
            <BookIcon />
          </button>
          <SoundToggle muted={muted} onToggle={onToggleMute} />
          {platform.kind === 'reddit' ? (
            <button
              type="button"
              className="icon-button"
              onClick={(event) => platform.closeGame(event.nativeEvent)}
              aria-label={COPY.close}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </header>

      {finished ? null : <MessageLine text={message.text} tone={message.tone} />}

      <SheetStage
        controller={controller}
        label={`Marbled sheet, ${view.remaining} moves left`}
        mood={moodOf(view)}
        jolt={view.feedback?.kind === 'blot' ? view.feedback.id : null}
      />

      {finished ? (
        <ResultCard
          sheet={sheet}
          state={controller.state}
          standing={view.standing}
          player={response.player}
          nextTrap={nextTrap?.sheet ?? null}
          nextSheetAt={response.nextSheetAt}
          onPlay={navigation.play}
          onCompose={navigation.compose}
          onSubscribe={() => platform.subscribe()}
          onLogin={() => platform.promptLogin()}
          onFlair={(enabled) => platform.setFlair(enabled)}
        />
      ) : (
        <footer className="game__footer">
          <LensButton
            left={view.lensLeft}
            disabled={view.busy || view.status !== 'playing'}
            onUse={() => controller.magnify()}
          />
          <SealRow total={view.total} remaining={view.remaining} />
          {currentLesson ? (
            <button type="button" className="game__skip" onClick={skipLessons}>
              {COPY.skipLessons}
            </button>
          ) : (
            <TearMeter blots={view.blots} />
          )}
        </footer>
      )}
    </main>
  );
};
