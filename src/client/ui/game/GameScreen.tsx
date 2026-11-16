import { useEffect, useMemo, useState } from 'react';
import type { SheetResponse } from '../../../shared/protocol/api.ts';
import { LESSONS } from '../../../shared/puzzle/tutorial.ts';
import type { SoundBank } from '../../audio/sound.ts';
import type { Feedback, GameView, HintKind } from '../../game/controller.ts';
import type { Platform } from '../../platform/platform.ts';
import { blotLine, COPY } from '../copy.ts';
import { CloseIcon } from '../icons.tsx';
import { useStore } from '../hooks/use-store.ts';
import { LensButton, MessageLine, Plaque, SealRow, SoundToggle, TearMeter } from './Chrome.tsx';
import { ResultCard } from './ResultCard.tsx';
import { SheetStage } from './SheetStage.tsx';
import { NOWHERE, useGame } from './use-game.ts';
import './game-screen.css';

type Props = {
  readonly platform: Platform;
  readonly response: SheetResponse;
  readonly sound: SoundBank;
  readonly muted: boolean;
  readonly onToggleMute: () => void;
};

type Message = { text: string; tone: 'quiet' | 'alert' | 'gilt' };

/** Pause on a finished lesson before the next one appears. */
const LESSON_PAUSE_MS = 900;

const HINT_COPY: Record<HintKind, string> = { round: COPY.hintRound, seam: COPY.hintSeam, lens: COPY.hintLens };

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

/** The full game: three short lessons for newcomers, then the sheet. */
export const GameScreen = ({ platform, response, sound, muted, onToggleMute }: Props) => {
  const [lesson, setLesson] = useState<number | null>(() =>
    platform.needsLessons() && response.player.log.length === 0 ? 0 : null,
  );
  const [lessonAttempt, setLessonAttempt] = useState(0);
  const { sheet } = response;
  const currentLesson = lesson === null ? null : LESSONS[lesson];

  const setup = useMemo(
    () =>
      currentLesson
        ? { key: `lesson:${currentLesson.id}:${lessonAttempt}`, spec: currentLesson.spec, log: [], sink: NOWHERE, hints: false }
        : { key: sheet.id, spec: sheet.spec, log: response.player.log, sink: platform.sinkFor(sheet.id), hints: true },
    [currentLesson, lessonAttempt, sheet, response.player.log, platform],
  );
  const controller = useGame(setup, sound);
  const view = useStore(controller.view);

  // Lessons advance on a clean sheet and retry on a torn one.
  useEffect(() => {
    if (lesson === null || !view.settled) return;
    const timer = window.setTimeout(() => {
      if (view.status === 'torn') {
        setLessonAttempt((n) => n + 1);
      } else if (lesson + 1 < LESSONS.length) {
        setLesson(lesson + 1);
      } else {
        platform.markLessonsDone();
        setLesson(null);
      }
    }, LESSON_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [lesson, view.settled, view.status, platform]);

  const skipLessons = (): void => {
    platform.markLessonsDone();
    setLesson(null);
  };

  const fallback = currentLesson?.prompt ?? (view.remaining === view.total ? COPY.dailyPrompt : '');
  const message = messageFor(view, fallback);
  const showResult = lesson === null && view.settled;

  return (
    <main className="game" data-phase={showResult ? 'result' : 'play'}>
      <header className="game__header">
        {currentLesson ? (
          <Plaque
            number={null}
            weekday="First sheets"
            stars={1}
            paletteName={COPY.lessonOf((lesson ?? 0) + 1, LESSONS.length)}
            eyebrow={COPY.wordmark}
          />
        ) : (
          <Plaque number={sheet.number} weekday={sheet.weekday} stars={sheet.spec.stars} paletteName={sheet.name ?? sheet.paletteName} />
        )}
        <div className="game__tools">
          <SoundToggle muted={muted} onToggle={onToggleMute} />
          {platform.kind === 'reddit' ? (
            <button type="button" className="icon-button" onClick={(event) => platform.closeGame(event.nativeEvent)} aria-label={COPY.close}>
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </header>

      {showResult ? null : <MessageLine text={message.text} tone={message.tone} />}

      <SheetStage controller={controller} label={`Marbled sheet, ${view.remaining} moves left`} />

      {showResult ? (
        <ResultCard
          sheet={sheet}
          state={controller.state}
          standing={view.standing}
          signedIn={response.player.signedIn}
          onSubscribe={() => platform.subscribe()}
          onLogin={() => platform.promptLogin()}
        />
      ) : (
        <footer className="game__footer">
          <LensButton left={view.lensLeft} disabled={view.busy || view.status !== 'playing'} onUse={() => controller.magnify()} />
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
