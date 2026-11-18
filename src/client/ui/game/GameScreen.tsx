import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ONBOARDING, TIMING } from '../../../shared/config.ts';
import type { BookEntry, ScarMap, SheetDescriptor, SheetResponse } from '../../../shared/protocol/api.ts';
import { lessonsFor } from '../../../shared/puzzle/tutorial.ts';
import type { SoundBank } from '../../audio/sound.ts';
import { NOWHERE } from '../../game/attempt-sink.ts';
import type { Feedback, GameView, HintKind } from '../../game/controller.ts';
import type { PracticeChoice } from '../../game/practice-shelf.ts';
import type { StageMood } from '../../game/stage.ts';
import { assertNever } from '../../lib/assert-never.ts';
import { localPrefs } from '../../lib/local-prefs.ts';
import type { Platform } from '../../platform/platform.ts';
import { blotLine, COPY } from '../copy.ts';
import { BookIcon, CloseIcon, GuideIcon } from '../icons.tsx';
import { useStore } from '../hooks/use-store.ts';
import { LensButton, LessonDots, MessageLine, Plaque, SealRow, SheetPlaque, SoundToggle, TearMeter } from './Chrome.tsx';
import { ReadingGuide } from './ReadingGuide.tsx';
import { trapToSpring } from './next-steps.ts';
import { ResultCard } from './ResultCard.tsx';
import { SheetStage } from './SheetStage.tsx';
import { useGame } from './use-game.ts';
import './game-screen.css';

export type GameNavigation = {
  readonly openBook: () => void;
  /** The Book, open on its traps shelf. */
  readonly openTraps: () => void;
  readonly compose: () => void;
  readonly play: (sheetId: string) => void;
  /** Today's daily sheet. */
  readonly today: () => void;
  /** The practice picker. */
  readonly pickPractice: () => void;
  /** Marbles a practice sheet for `choice` (the warm-up's). */
  readonly practise: (choice: PracticeChoice) => void;
  /** Another practice sheet like the one on screen; "any" skips its recipe. */
  readonly anotherPractice: () => void;
  /** Marbles that next practice sheet ahead, in idle time. */
  readonly prefetchAnother: () => void;
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
/** Sheets at or above this many stars suggest a warm-up to newcomers; at or below the other, they make one. */
const WARM_UP = { hardFrom: 4, easyUpTo: 2 } as const;
/** With no easy sheet left in the Book, the warm-up is a practice sheet of the easiest kind. */
const WARM_UP_PRACTICE: PracticeChoice = { stars: 1, recipeId: null };
/**
 * Every finished practice sheet is remembered under this one id: practice counts
 * once toward no longer being a newcomer, and never crowds real sheets out.
 */
const PRACTICE_FINISHED_ID = 'p-any';

/** The most recent easy daily sheet this player has not finished, to warm up on. */
const easySheetIn = (dailies: readonly BookEntry[], today: string): SheetDescriptor | null =>
  dailies.find(
    (entry) =>
      entry.sheet.id !== today &&
      entry.sheet.spec.stars <= WARM_UP.easyUpTo &&
      (entry.status === 'unplayed' || entry.status === 'playing'),
  )?.sheet ?? null;

/** What a newcomer warms up on: an easy sheet from the Book, else a practice sheet. */
type WarmUp = { readonly kind: 'sheet'; readonly sheet: SheetDescriptor } | { readonly kind: 'practice' };

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

/** Floating while played; the ending's motion while it plays; then held out clean, or resting torn. */
const moodOf = ({ ending, settled, status }: GameView): StageMood => {
  if (ending === 'rising' || ending === 'sinking') return ending;
  if (ending === null && !settled) return 'floating';
  return status === 'clean' ? 'lifted' : status === 'torn' ? 'torn' : 'floating';
};

/**
 * The line under the plaque: an earlier daily sheet points to today's; a
 * practice sheet says it counts for nothing, and where the real one is.
 */
const Banner = ({
  sheet,
  todayId,
  navigation,
}: {
  readonly sheet: SheetDescriptor;
  readonly todayId: string;
  readonly navigation: GameNavigation;
}) => {
  const note = (text: string, onToday: () => void) => (
    <p className="game__banner">
      {text}{' '}
      <button type="button" className="game__banner-link" onClick={onToday}>
        {COPY.goToToday}
      </button>
    </p>
  );
  switch (sheet.kind) {
    case 'daily':
      return sheet.id === todayId ? null : note(COPY.oldSheet, () => navigation.play(todayId));
    case 'practice':
      return note(COPY.practice.banner, navigation.today);
    case 'trap':
      return null;
    default:
      return assertNever(sheet.kind);
  }
};

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

  // Practice sheets are recorded nowhere: no server, no resume.
  const sink = useMemo(() => {
    switch (sheet.kind) {
      case 'practice':
        return NOWHERE;
      case 'daily':
      case 'trap':
        return platform.sinkFor(sheet.id, response.player.log.length);
      default:
        return assertNever(sheet.kind);
    }
  }, [platform, sheet.kind, sheet.id, response.player.log.length]);
  const setup = useMemo(
    () =>
      currentLesson
        ? {
            key: `lesson:${currentLesson.id}:${lessonAttempt}`,
            spec: currentLesson.spec,
            log: [],
            sink: NOWHERE,
            hints: false,
            demonstrate: true,
            standing: null,
          }
        : {
            key: sheet.id,
            spec: sheet.spec,
            log: response.player.log,
            sink,
            hints: true,
            demonstrate: false,
            standing: response.standing,
          },
    [currentLesson, lessonAttempt, sheet, response.player.log, response.standing, sink],
  );
  const controller = useGame(setup, sound);
  const view = useStore(controller.view);

  // A lesson is left the same way whether it was finished or skipped: seen for good, and on to the next.
  const leaveLesson = useCallback(
    (index: number): void => {
      const lesson = lessons[index];
      if (lesson) localPrefs.markLessonSeen(lesson.id);
      setLessonIndex(index + 1);
    },
    [lessons],
  );

  // Lessons advance on a clean sheet and retry on a torn one.
  useEffect(() => {
    if (!currentLesson || !view.settled) return;
    const timer = window.setTimeout(() => {
      if (view.status === 'torn') setLessonAttempt((n) => n + 1);
      else leaveLesson(lessonIndex);
    }, LESSON_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [currentLesson, lessonIndex, leaveLesson, view.settled, view.status]);

  // The attempt changed elsewhere (another device or tab): show the truth.
  useEffect(() => {
    if (view.desynced) onReload();
  }, [view.desynced, onReload]);

  // Once finished: where everyone tore it, and a trap to try next. A practice sheet has neither.
  const finished = currentLesson === null && view.settled;
  const yourTrapId = response.yourTrap?.sheetId ?? null;
  const [nextTrap, setNextTrap] = useState<SheetDescriptor | null>(null);
  const [scars, setScars] = useState<ScarMap | null>(null);
  useEffect(() => {
    if (!finished) return;
    switch (sheet.kind) {
      case 'practice':
        localPrefs.markFinished(PRACTICE_FINISHED_ID);
        return;
      case 'daily':
      case 'trap':
        localPrefs.markFinished(sheet.id);
        break;
      default:
        return assertNever(sheet.kind);
    }
    let cancelled = false;
    void platform.fetchScars(sheet.id).then((map) => {
      if (cancelled || !map) return;
      controller.showCommunityScars(map);
      setScars(map);
    });
    platform
      .loadBook()
      .then((book) => {
        if (cancelled) return;
        setNextTrap(trapToSpring(book.traps, sheet.id, yourTrapId));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [finished, platform, sheet.kind, sheet.id, yourTrapId, controller]);

  // A newcomer facing a hard sheet is offered an easier one from the Book first.
  const untouched = response.player.log.length === 0 && view.remaining === view.total && view.blots === 0;
  const wantsWarmUp =
    currentLesson === null &&
    untouched &&
    sheet.kind === 'daily' &&
    sheet.id === response.todayId &&
    sheet.spec.stars >= WARM_UP.hardFrom &&
    localPrefs.finishedCount() < ONBOARDING.newcomerSheets;
  const [warmUp, setWarmUp] = useState<WarmUp | null>(null);
  const [warmUpDismissed, setWarmUpDismissed] = useState(false);
  useEffect(() => {
    if (!wantsWarmUp) return;
    let cancelled = false;
    const offer = (easy: SheetDescriptor | null) => {
      if (!cancelled) setWarmUp(easy ? { kind: 'sheet', sheet: easy } : { kind: 'practice' });
    };
    platform
      .loadBook()
      .then((book) => offer(easySheetIn(book.dailies, response.todayId)))
      .catch(() => offer(null));
    return () => {
      cancelled = true;
    };
  }, [wantsWarmUp, platform, response.todayId]);
  const offerWarmUp = wantsWarmUp && !warmUpDismissed ? warmUp : null;

  // The reading guide opens only while the clock has nothing to answer for: before the first move, or once done.
  // (An untouched sheet is never busy: every animation follows a recorded move.)
  const guideAvailable = finished || (view.untouched && view.status === 'playing');
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideNoted, setGuideNoted] = useState(false);
  const guideButton = useRef<HTMLButtonElement>(null);
  // While the guide covers an untouched sheet, its clock and hints wait too.
  useEffect(() => (guideOpen ? controller.holdClock() : undefined), [guideOpen, controller]);
  useEffect(() => {
    if (!guideNoted) return;
    const timer = window.setTimeout(() => setGuideNoted(false), TIMING.guideNoteMs);
    return () => window.clearTimeout(timer);
  }, [guideNoted]);
  const onGuide = (): void => {
    if (guideAvailable) setGuideOpen(true);
    else setGuideNoted(true);
  };
  const closeGuide = (): void => {
    setGuideOpen(false);
    guideButton.current?.focus();
  };
  const namingThread = sheet.kind === 'daily' && response.thread?.naming ? response.thread : null;

  const special = sheet.recipe?.special ? sheet.recipe : null;
  const opening = special ? COPY.specialPrompt(special.title, special.promise) : COPY.dailyPrompt;
  const fallback = currentLesson?.prompt ?? (view.remaining === view.total ? opening : '');
  const message: Message = guideNoted ? { text: COPY.guide.unavailable, tone: 'quiet' } : messageFor(view, fallback);

  return (
    <main className="game" data-phase={finished ? 'result' : 'play'}>
      <header className="game__header">
        {currentLesson ? (
          <Plaque
            number={null}
            weekday={COPY.lessonsTitle}
            stars={1}
            detail={<LessonDots index={lessonIndex} total={lessons.length} />}
            eyebrow={COPY.wordmark}
          />
        ) : (
          <SheetPlaque sheet={sheet} />
        )}
        <div className="game__tools">
          <button type="button" className="game__book" onClick={navigation.openBook} aria-label={COPY.book.open}>
            <BookIcon size={18} />
            <span>{COPY.book.label}</span>
          </button>
          <button
            ref={guideButton}
            type="button"
            className="icon-button game__guide"
            onClick={onGuide}
            aria-label={COPY.guide.open}
            aria-haspopup="dialog"
            aria-disabled={guideAvailable ? undefined : true}
            title={guideAvailable ? COPY.guide.open : COPY.guide.unavailable}
          >
            <GuideIcon />
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

      {currentLesson === null ? <Banner sheet={sheet} todayId={response.todayId} navigation={navigation} /> : null}

      {finished ? null : <MessageLine text={message.text} tone={message.tone} />}

      <SheetStage
        controller={controller}
        label={`Marbled sheet, ${view.remaining} moves left`}
        mood={moodOf(view)}
        jolt={view.feedback?.kind === 'blot' ? view.feedback.id : null}
      >
        {offerWarmUp ? (
          // Over the sheet, never beside it: arriving or leaving, it never moves the sheet under a finger.
          <div className="game__warm-up" role="note">
            <p>{COPY.warmUp.note(sheet.spec.stars)}</p>
            <div className="actions">
              {offerWarmUp.kind === 'sheet' ? (
                <button type="button" className="button button--primary" onClick={() => navigation.play(offerWarmUp.sheet.id)}>
                  {COPY.warmUp.action(offerWarmUp.sheet.weekday)}
                </button>
              ) : (
                <button type="button" className="button button--primary" onClick={() => navigation.practise(WARM_UP_PRACTICE)}>
                  {COPY.practice.warmUp}
                </button>
              )}
              <button type="button" className="button" onClick={() => setWarmUpDismissed(true)}>
                {COPY.warmUp.dismiss}
              </button>
            </div>
          </div>
        ) : null}
      </SheetStage>

      {finished ? (
        <ResultCard
          sheet={sheet}
          state={controller.state}
          standing={view.standing}
          player={response.player}
          scars={scars}
          apprentice={controller.apprentice}
          thread={response.thread}
          yourTrap={response.yourTrap}
          nextTrap={nextTrap}
          nextSheetAt={response.nextSheetAt}
          tomorrow={response.tomorrow}
          community={platform.community}
          onPlay={navigation.play}
          onCompose={navigation.compose}
          onOpenBook={navigation.openBook}
          practice={navigation}
          onShare={(text, postId) => platform.share(text, postId)}
          onOpenThread={(url) => platform.openPost(url)}
          onJoin={() => platform.openCommunity()}
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
            <button
              type="button"
              className="game__skip"
              onClick={() => leaveLesson(lessonIndex)}
              aria-label={COPY.skipLessonLabel(lessonIndex + 1, lessons.length)}
            >
              {COPY.skipLesson}
            </button>
          ) : (
            <TearMeter blots={view.blots} />
          )}
        </footer>
      )}
      {guideOpen ? (
        <ReadingGuide
          actions={navigation}
          namingThread={namingThread}
          onOpenThread={(url) => platform.openPost(url)}
          onClose={closeGuide}
        />
      ) : null}
    </main>
  );
};
