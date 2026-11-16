import { replaySession } from '../../shared/game/session.ts';
import { resultOf, type Result } from '../../shared/game/scoring.ts';
import { buildDailySheet, dateKeyOfSheetId, dayPreview } from '../../shared/puzzle/daily.ts';
import { checkTrap } from '../../shared/puzzle/trap.ts';
import { parseSheetDescriptor } from '../../shared/protocol/post-data.ts';
import type {
  BookResponse,
  BookStatus,
  LoggedAction,
  ScarMap,
  SheetDescriptor,
  SheetResponse,
  SheetStats,
  TrapCatch,
  Standing,
  TrapResponse,
} from '../../shared/protocol/api.ts';
import { parseActionLog } from '../../shared/protocol/parse.ts';
import { addDays, dateKeyOf, isDateKey, type DateKey } from '../../shared/time/calendar.ts';
import { copyToClipboard, type Platform } from './platform.ts';

/**
 * Browser-only platform for design work and playtests with strangers.
 *
 *   lab.html?date=2026-12-03   play a specific day
 *   lab.html?fresh             forget this device's attempts and lessons
 *
 * Attempts are kept in localStorage, and every action is appended to a
 * session log the facilitator can export for the gate analysis.
 */
const LAB_SEED = 'lab';
/** The lab's recipe calendar: public, unlike an installation's, which comes from its secret. */
const LAB_CALENDAR = 'lab:calendar';
const KEY = 'unmarble:lab:';

const read = (key: string): unknown => {
  try {
    const raw = window.localStorage.getItem(KEY + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(KEY + key, JSON.stringify(value));
  } catch {
    // Lab only: a lost write just loses resume.
  }
};

/** Removes every stored key that starts with `prefix`. */
const clearKeys = (prefix: string): void => {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // Nothing to clear.
  }
};

const clearAll = (): void => clearKeys('unmarble:');

/** Lab: forget every attempt on this device, keeping lessons, traps and preferences. */
export const resetLabProgress = (): void => {
  clearKeys(`${KEY}log:`);
  clearKeys(`${KEY}events`);
};

/** Lab: forget everything, as if this device had never played (lessons included). */
export const resetLab = (): void => clearAll();

export type LabEvent = { readonly sheetId: string; readonly entry: LoggedAction; readonly wallClock: string };

/** All recorded actions on this device, for export by the facilitator. */
export const readLabEvents = (): unknown[] => {
  const events = read('events');
  return Array.isArray(events) ? events : [];
};

export type LabHooks = {
  /** The lab shows the card and the game on one page; this switches to the game. */
  readonly onOpenGame: () => void;
  readonly onCloseGame: () => void;
  readonly now?: () => number;
};

/** The lab's single local player: always "signed in" as this name, so traps can be set. */
const LAB_PLAYER = 'lab-player';
/** How far back the lab's Book reaches. */
const LAB_BOOK_DAYS = 14;

/** In the lab every player is alone: first of one. */
const localStanding = (result: Result, streak: number): Standing => ({
  result,
  rank: 1,
  stats: { hands: 1, cleans: result.clean ? 1 : 0, caught: result.blots > 0 ? 1 : 0 },
  streak,
});

export const createLabPlatform = (search: URLSearchParams, hooks: LabHooks): Platform => {
  const now = hooks.now ?? Date.now;
  if (search.has('fresh')) clearAll();
  const requested = search.get('date');
  const today = isDateKey(requested) ? requested : dateKeyOf(now());
  const dailies = new Map<string, SheetDescriptor>();
  // The lab behaves like a community that installed the app when its Book begins.
  const firstDay = addDays(today, 1 - LAB_BOOK_DAYS);

  const daily = (dateKey: DateKey): SheetDescriptor => {
    const cached = dailies.get(dateKey);
    if (cached) return cached;
    const sheet = buildDailySheet(dateKey, LAB_SEED, LAB_CALENDAR, firstDay);
    dailies.set(dateKey, sheet);
    return sheet;
  };
  const traps = (): SheetDescriptor[] => {
    const stored = read('traps');
    return Array.isArray(stored) ? stored.map(parseSheetDescriptor).filter((s) => s !== null) : [];
  };
  const sheetById = (id: string): SheetDescriptor | null => {
    const dateKey = dateKeyOfSheetId(id);
    if (dateKey) return dateKey <= today ? daily(dateKey) : null;
    return traps().find((trap) => trap.id === id) ?? null;
  };
  const logOf = (sheetId: string): LoggedAction[] => parseActionLog(read(`log:${sheetId}`)) ?? [];
  const stateOf = (sheet: SheetDescriptor) => replaySession(sheet.spec, logOf(sheet.id));
  const statusOf = (sheet: SheetDescriptor): BookStatus => {
    const state = stateOf(sheet);
    if (state.status !== 'playing') return state.status;
    return state.history.length > 0 ? 'playing' : 'unplayed';
  };
  const statsOf = (sheet: SheetDescriptor): SheetStats => {
    const state = stateOf(sheet);
    const finished = state.status !== 'playing';
    // As on the server: a hand is caught once it has finished, having torn the sheet.
    return { hands: finished ? 1 : 0, cleans: state.status === 'clean' ? 1 : 0, caught: finished && state.blots > 0 ? 1 : 0 };
  };
  /** Consecutive days, ending today, whose daily sheet is finished. */
  const streak = (): number => {
    let days = 0;
    while (statusOf(daily(addDays(today, -days))) === 'clean' || statusOf(daily(addDays(today, -days))) === 'torn') days++;
    return days;
  };

  /** The lab player's latest trap, set within the past week, and how it is doing. */
  const latestTrapCatch = (): TrapCatch | null => {
    const weekAgo = addDays(today, -6);
    const latest = [...traps()].reverse().find((trap) => trap.dateKey >= weekAgo && trap.dateKey <= today);
    if (!latest) return null;
    const stats = statsOf(latest);
    return { sheetId: latest.id, caught: stats.caught, hands: stats.hands };
  };

  return {
    kind: 'lab',
    loadSheet: async (sheetId?: string): Promise<SheetResponse> => {
      const sheet = (sheetId ? sheetById(sheetId) : null) ?? daily(today);
      const state = stateOf(sheet);
      return {
        sheet,
        player: { signedIn: true, log: logOf(sheet.id), streak: streak(), flair: read('flair') === true },
        standing: state.status === 'playing' ? null : localStanding(resultOf(state), streak()),
        stats: statsOf(sheet),
        nextSheetAt: Date.parse(`${addDays(today, 1)}T00:00:00Z`),
        todayId: daily(today).id,
        // The lab has no Reddit posts to discuss sheets in.
        thread: null,
        yourTrap: latestTrapCatch(),
        tomorrow: dayPreview(LAB_CALENDAR, addDays(today, 1)),
      };
    },
    sinkFor: (sheetId) => ({
      record: async (entry): Promise<Standing | null> => {
        const sheet = sheetById(sheetId);
        if (!sheet) return null;
        const log = [...logOf(sheetId), entry];
        write(`log:${sheetId}`, log);
        const event: LabEvent = { sheetId, entry, wallClock: new Date(now()).toISOString() };
        write('events', [...readLabEvents(), event]);
        const state = replaySession(sheet.spec, log);
        return state.status === 'playing' ? null : localStanding(resultOf(state), streak());
      },
    }),
    fetchScars: async (sheetId): Promise<ScarMap | null> => {
      const sheet = sheetById(sheetId);
      if (!sheet) return null;
      const points = stateOf(sheet)
        .history.filter((record) => record.verdict === 'blot' && record.point)
        .map((record) => ({ x: record.point?.x ?? 0, y: record.point?.y ?? 0, weight: 1 }));
      return { points, trap: null, hands: 1 };
    },
    loadBook: async (): Promise<BookResponse> => {
      // Alone in the lab, no trap can gather the hands it takes to be featured.
      const entry = (sheet: SheetDescriptor) => ({ sheet, status: statusOf(sheet), stats: statsOf(sheet), inTheRunning: false });
      return {
        dailies: Array.from({ length: LAB_BOOK_DAYS }, (_, back) => entry(daily(addDays(today, -back)))),
        traps: [...traps()].reverse().map(entry),
      };
    },
    publishTrap: async (moves): Promise<TrapResponse> => {
      const paper = daily(today);
      const check = checkTrap(moves, paper.spec.ground);
      if (check.problem) return { kind: 'rejected', reason: 'unfair' };
      const sheet: SheetDescriptor = {
        id: `t-${today}-${traps().length + 1}`,
        kind: 'trap',
        author: LAB_PLAYER,
        number: paper.number,
        dateKey: today,
        weekday: paper.weekday,
        paletteName: paper.paletteName,
        spec: { paletteId: paper.spec.paletteId, ground: paper.spec.ground, moves, stars: check.stars },
        name: null,
        recipe: null,
      };
      write('traps', [...traps(), sheet]);
      return { kind: 'published', sheet, postUrl: null };
    },
    setFlair: async (enabled) => {
      write('flair', enabled);
      return enabled;
    },
    openPost: () => undefined,
    openGame: () => hooks.onOpenGame(),
    closeGame: () => hooks.onCloseGame(),
    promptLogin: () => undefined,
    community: null,
    openCommunity: () => undefined,
    share: (text) => copyToClipboard(text),
  };
};
