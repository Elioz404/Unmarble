import { useEffect, useMemo, useState } from 'react';
import type { SheetResponse } from '../../../shared/protocol/api.ts';
import { LESSONS } from '../../../shared/puzzle/tutorial.ts';
import type { SoundBank } from '../../audio/sound.ts';
import type { Feedback, GameController, GameView } from '../../game/controller.ts';
import { localPrefs } from '../../lib/local-prefs.ts';
import type { Platform } from '../../platform/platform.ts';
import { blotLine, COPY } from '../copy.ts';
import { CloseIcon } from '../icons.tsx';
import { useStore } from '../hooks/use-store.ts';
import { LensButton, MessageLine, Plaque, SealRow, SoundToggle, TearMeter } from './Chrome.tsx';
import { ResultCard } from './ResultCard.tsx';
import { SheetStage } from './SheetStage.tsx';
import { NOWHERE, useGame } from './use-game.ts';
import './game-screen.css';

/** How long feedback stays before hints may take the line again. */
const FEEDBACK_MS = 2800;
/** Idle time before a contextual hint is offered (once per device). */
const HINT_AFTER_MS = 22_000;
const LESSON_PAUSE_MS = 900;

type Props = {
  readonly platform: Platform;
  readonly response: SheetResponse;
  readonly sound: SoundBank;
  readonly muted: boolean;
  readonly onToggleMute: () => void;
};

type Message = { text: string; tone: 'quiet' | 'alert' | 'gilt' };

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

/** The latest feedback, cleared after a moment (blots linger longer to be read). */
const useFeedback = (feedback: Feedback | null): Message | null => {
  const [message, setMessage] = useState<Message | null>(null);
  useEffect(() => {
    if (!feedback) return;
    setMessage(feedbackMessage(feedback));
    const timer = window.setTimeout(
      () => setMessage(null),
      feedback.kind === 'blot' ? FEEDBACK_MS * 1.6 : FEEDBACK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [feedback]);
  return message;
};

/** A contextual hint after a long pause, each kind offered once per device. */
const useHint = (controller: GameController, view: GameView, enabled: boolean): Message | null => {
  const [hint, setHint] = useState<Message | null>(null);
  const { idleSince, status, remaining, blots, lensLeft } = view;
  useEffect(() => {
    setHint(null);
    if (!enabled || status !== 'playing') return;
    const timer = window.setTimeout(() => {
      const top = controller.spec.moves[remaining - 1];
      const kind = blots >= 2 && lensLeft > 0 ? 'lens' : top?.kind === 'stroke' ? 'seam' : 'round';
      if (localPrefs.hasSeen(kind)) return;
      localPrefs.markSeen(kind);
      setHint({ text: kind === 'lens' ? COPY.hintLens : kind === 'seam' ? COPY.hintSeam : COPY.hintRound, tone: 'quiet' });
    }, HINT_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [controller, enabled, idleSince, status, remaining, blots, lensLeft]);
  return hint;
};

/** Chooses the one line shown above the sheet. */
const useMessage = (controller: GameController, view: GameView, fallback: string, hints: boolean): Message => {
  const feedback = useFeedback(view.feedback);
  const hint = useHint(controller, view, hints);
  if (view.replayStep !== null) return { text: COPY.replayStep(view.replayStep + 1, view.total), tone: 'quiet' };
  return feedback ?? hint ?? { text: fallback, tone: 'quiet' };
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
        ? { key: `lesson:${currentLesson.id}:${lessonAttempt}`, spec: currentLesson.spec, log: [], sink: NOWHERE }
        : { key: sheet.id, spec: sheet.spec, log: response.player.log, sink: platform.sinkFor(sheet.id) },
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
  const message = useMessage(controller, view, fallback, currentLesson === null);
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
            <button type="button" className="icon-button" onClick={() => platform.closeGame()} aria-label={COPY.close}>
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
