import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRACTICE } from '../../shared/config.ts';
import type { DayPreview, SheetDescriptor, SheetResponse } from '../../shared/protocol/api.ts';
import { msUntilNextDay } from '../../shared/time/calendar.ts';
import { SoundBank } from '../audio/sound.ts';
import { practiceShelf, type PracticeChoice } from '../game/practice-shelf.ts';
import { assertNever } from '../lib/assert-never.ts';
import { localPrefs } from '../lib/local-prefs.ts';
import type { Platform } from '../platform/platform.ts';
import { BookScreen, type BookShelf } from './book/BookScreen.tsx';
import { COPY } from './copy.ts';
import { ComposerScreen } from './compose/ComposerScreen.tsx';
import { GameScreen, type GameNavigation } from './game/GameScreen.tsx';
import { PracticePicker } from './practice/PracticePicker.tsx';
import { StatusScreen } from './StatusScreen.tsx';

/** Where the player is inside the expanded game. */
type Route =
  /** A sheet: the post's own (null) or one picked from the Book. */
  | { readonly screen: 'sheet'; readonly sheetId: string | null }
  | { readonly screen: 'book'; readonly shelf: BookShelf }
  /** Setting a trap on today's paper. */
  | { readonly screen: 'compose' }
  /** Choosing a practice sheet, opened on a choice (the last one) or on the player's usual difficulty. */
  | { readonly screen: 'practice-pick'; readonly initial: PracticeChoice | null }
  /**
   * A practice sheet for `choice`: marbled on this device, then played. `avoid`
   * is the recipe just played, which "any" skips; `seed` asks for one sheet.
   */
  | {
      readonly screen: 'practice';
      readonly choice: PracticeChoice;
      readonly avoid: string | null;
      readonly seed: string | null;
    };

type Load = { kind: 'loading' } | { kind: 'ready'; response: SheetResponse } | { kind: 'failed' };

/** What a practice sheet borrows from the last daily load: where today's sheet is and what tomorrow asks. */
type DailyMeta = { readonly todayId: string; readonly tomorrow: DayPreview | null };

/**
 * Loads one sheet (by id, or the post's own) and reloads when `generation`
 * changes. Results are tagged with the request they answer, so a stale answer
 * simply reads as "still loading" for the new request. Every visit to a screen
 * is a new generation, so coming back always shows the attempt as it is now.
 */
const useSheet = (
  platform: Platform,
  sheetId: string | null | undefined,
  generation: number,
  onLoaded: (response: SheetResponse) => void,
): Load => {
  const request = sheetId === undefined ? null : `${sheetId ?? 'post'}:${generation}`;
  const [answer, setAnswer] = useState<{ request: string; load: Load } | null>(null);
  useEffect(() => {
    if (request === null) return;
    let cancelled = false;
    platform
      .loadSheet(sheetId ?? undefined)
      .then((response) => {
        if (cancelled) return;
        onLoaded(response);
        setAnswer({ request, load: { kind: 'ready', response } });
      })
      .catch((error: unknown) => {
        console.error('Failed to load the sheet', error);
        if (!cancelled) setAnswer({ request, load: { kind: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
  }, [platform, sheetId, request, onLoaded]);
  return answer && answer.request === request ? answer.load : { kind: 'loading' };
};

type Practice =
  | { readonly kind: 'marbling'; readonly noticed: boolean }
  | { readonly kind: 'ready'; readonly sheet: SheetDescriptor }
  | { readonly kind: 'failed' };

/**
 * Marbles the practice sheet a route asks for, on this device. A job left
 * unfinished (the player went elsewhere) goes back on the shelf, so coming
 * straight back picks it up again. The "marbling" notice only shows once the
 * wait is long enough to notice.
 */
const usePractice = (route: Route, generation: number): Practice | null => {
  const [state, setState] = useState<{ generation: number; practice: Practice } | null>(null);
  useEffect(() => {
    if (route.screen !== 'practice') return;
    let cancelled = false;
    const job = practiceShelf.take(route.choice, route.avoid, route.seed);
    const noticed: Practice = { kind: 'marbling', noticed: true };
    const notice = window.setTimeout(
      () => setState((s) => (s?.generation === generation && s.practice.kind !== 'marbling' ? s : { generation, practice: noticed })),
      PRACTICE.noticeMs,
    );
    job.sheet
      .then(({ sheet }) => {
        if (!cancelled) setState({ generation, practice: { kind: 'ready', sheet } });
      })
      .catch((error: unknown) => {
        console.error('Failed to marble a practice sheet', error);
        if (!cancelled) setState({ generation, practice: { kind: 'failed' } });
      });
    return () => {
      cancelled = true;
      window.clearTimeout(notice);
      practiceShelf.release(job);
    };
  }, [route, generation]);
  if (route.screen !== 'practice') return null;
  return state?.generation === generation ? state.practice : { kind: 'marbling', noticed: false };
};

/**
 * A practice sheet as the game screen takes a sheet: nothing comes from a
 * server, no attempt to resume, no standing; today's sheet and tomorrow's
 * preview as the last daily load told them (none yet: no teaser).
 */
const practiceResponse = (sheet: SheetDescriptor, meta: DailyMeta | null): SheetResponse => {
  const now = Date.now();
  return {
    sheet,
    player: { signedIn: false, log: [], streak: 0, flair: false },
    standing: null,
    stats: { hands: 0, cleans: 0, caught: 0 },
    nextSheetAt: now + msUntilNextDay(now),
    // Unknown until a daily sheet has loaded; a practice sheet never reads it.
    todayId: meta?.todayId ?? '',
    thread: null,
    yourTrap: null,
    tomorrow: meta?.tomorrow ?? null,
  };
};

/** A practice sheet to open straight on (lab links); a seed, when given, makes that very sheet. */
export type PracticeLink = { readonly choice: PracticeChoice; readonly seed: string | null };

type Props = {
  readonly platform: Platform;
  readonly practice?: PracticeLink | null;
};

const initialRoute = (practice: PracticeLink | null): Route =>
  practice ? { screen: 'practice', choice: practice.choice, avoid: null, seed: practice.seed } : { screen: 'sheet', sheetId: null };

/** Hosts the expanded game: the sheet, the Book, the trap editor and practice sheets, with shared sound. */
export const GameApp = ({ platform, practice = null }: Props) => {
  const [route, setRoute] = useState<Route>(() => initialRoute(practice));
  const [generation, setGeneration] = useState(0);
  const [meta, setMeta] = useState<DailyMeta | null>(null);
  const [muted, setMuted] = useState(localPrefs.muted);
  const sound = useMemo(() => new SoundBank(localPrefs.muted(), localPrefs.setMuted), []);
  useEffect(() => sound.attach(), [sound]);

  // The sheet being played, or (in the editor) today's sheet, whose paper a trap uses. Practice loads nothing.
  const wanted = route.screen === 'sheet' ? route.sheetId : route.screen === 'compose' ? (meta?.todayId ?? null) : undefined;
  const rememberToday = useCallback(
    (response: SheetResponse) => setMeta({ todayId: response.todayId, tomorrow: response.tomorrow }),
    [],
  );
  const load = useSheet(platform, wanted, generation, rememberToday);
  const marbled = usePractice(route, generation);
  // The recipe of the practice sheet on screen: "another" skips it.
  const practisedRecipe = marbled?.kind === 'ready' ? (marbled.sheet.recipe?.id ?? null) : null;

  const reload = useCallback(() => setGeneration((n) => n + 1), []);
  /** Each visit loads afresh: a sheet played since (here or in the Book) shows as it is now. */
  const go = useCallback((next: Route) => {
    setRoute(next);
    setGeneration((n) => n + 1);
  }, []);
  const home = useCallback(() => go({ screen: 'sheet', sheetId: null }), [go]);
  const practiceChoice = route.screen === 'practice' ? route.choice : null;
  const navigation = useMemo<GameNavigation>(
    () => ({
      openBook: () => go({ screen: 'book', shelf: 'dailies' }),
      openTraps: () => go({ screen: 'book', shelf: 'traps' }),
      compose: () => go({ screen: 'compose' }),
      play: (sheetId: string) => go({ screen: 'sheet', sheetId }),
      today: () => (meta ? go({ screen: 'sheet', sheetId: meta.todayId }) : home()),
      pickPractice: () => go({ screen: 'practice-pick', initial: practiceChoice }),
      practise: (choice: PracticeChoice) => go({ screen: 'practice', choice, avoid: null, seed: null }),
      anotherPractice: () => {
        if (practiceChoice) go({ screen: 'practice', choice: practiceChoice, avoid: practisedRecipe, seed: null });
      },
      prefetchAnother: () => {
        if (practiceChoice) practiceShelf.prefetch(practiceChoice, practisedRecipe);
      },
    }),
    [go, home, meta, practiceChoice, practisedRecipe],
  );
  const prefetch = useCallback((choice: PracticeChoice) => practiceShelf.prefetch(choice, null), []);
  const atHome = route.screen === 'sheet' && route.sheetId === null;

  const toggleMute = (): void => {
    sound.unlock();
    sound.setMuted(!sound.muted);
    setMuted(sound.muted);
  };

  const game = (response: SheetResponse) => (
    <GameScreen
      key={`${response.sheet.id}:${generation}`}
      platform={platform}
      response={response}
      sound={sound}
      muted={muted}
      onToggleMute={toggleMute}
      onReload={reload}
      navigation={navigation}
    />
  );

  switch (route.screen) {
    case 'book':
      return (
        <BookScreen
          platform={platform}
          onBack={home}
          onPlay={navigation.play}
          onCompose={navigation.compose}
          onPractice={navigation.pickPractice}
          initialShelf={route.shelf}
        />
      );
    case 'practice-pick':
      return <PracticePicker initial={route.initial} onBack={home} onMarble={navigation.practise} onPrefetch={prefetch} />;
    case 'practice': {
      const state: Practice = marbled ?? { kind: 'marbling', noticed: false };
      switch (state.kind) {
        case 'marbling':
          // Most sheets are ready before a notice would even register: an empty room until then.
          return state.noticed ? <StatusScreen kind="loading" text={COPY.practice.marbling} /> : <main className="status" />;
        case 'failed':
          return (
            <StatusScreen
              kind="failed"
              text={COPY.practice.failed}
              onRetry={() => go({ ...route, seed: null })}
              onBack={navigation.pickPractice}
            />
          );
        case 'ready':
          return game(practiceResponse(state.sheet, meta));
        default:
          return assertNever(state);
      }
    }
    case 'sheet':
    case 'compose': {
      if (load.kind === 'loading') return <StatusScreen kind="loading" />;
      if (load.kind === 'failed') return <StatusScreen kind="failed" onRetry={reload} onBack={atHome ? undefined : home} />;
      if (route.screen === 'sheet') return game(load.response);
      return (
        <ComposerScreen
          platform={platform}
          paper={load.response.sheet}
          signedIn={load.response.player.signedIn}
          sound={sound}
          onBack={home}
        />
      );
    }
    default:
      return assertNever(route);
  }
};
