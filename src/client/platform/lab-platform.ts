import { replaySession } from '../../shared/game/session.ts';
import { resultOf, type Result } from '../../shared/game/scoring.ts';
import { buildDailySheet } from '../../shared/puzzle/daily.ts';
import type { LoggedAction, ScarMap, SheetResponse, Standing } from '../../shared/protocol/api.ts';
import { parseActionLog } from '../../shared/protocol/parse.ts';
import { addDays, dateKeyOf, isDateKey } from '../../shared/time/calendar.ts';
import { localPrefs } from '../lib/local-prefs.ts';
import type { Platform } from './platform.ts';

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

const clearAll = (): void => {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('unmarble:')) window.localStorage.removeItem(key);
    }
  } catch {
    // Nothing to clear.
  }
};

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

/** In the lab every player is alone: first of one. */
const localStanding = (result: Result): Standing => ({
  result,
  rank: 1,
  stats: { hands: 1, cleans: result.clean ? 1 : 0 },
  streak: result.clean ? 1 : 0,
});

export const createLabPlatform = (search: URLSearchParams, hooks: LabHooks): Platform => {
  const now = hooks.now ?? Date.now;
  if (search.has('fresh')) clearAll();
  const requested = search.get('date');
  const dateKey = isDateKey(requested) ? requested : dateKeyOf(now());
  const sheet = buildDailySheet(dateKey, LAB_SEED);

  const logOf = (sheetId: string): LoggedAction[] => parseActionLog(read(`log:${sheetId}`)) ?? [];

  return {
    kind: 'lab',
    loadSheet: async (): Promise<SheetResponse> => {
      const log = logOf(sheet.id);
      const state = replaySession(sheet.spec, log);
      const finished = state.status !== 'playing';
      return {
        sheet,
        player: { signedIn: false, log, streak: 0 },
        standing: finished ? localStanding(resultOf(state)) : null,
        stats: { hands: finished ? 1 : 0, cleans: finished && state.status === 'clean' ? 1 : 0 },
        nextSheetAt: Date.parse(`${addDays(dateKey, 1)}T00:00:00Z`),
        todayId: sheet.id,
      };
    },
    sinkFor: (sheetId) => ({
      record: async (entry): Promise<Standing | null> => {
        const log = [...logOf(sheetId), entry];
        write(`log:${sheetId}`, log);
        const event: LabEvent = { sheetId, entry, wallClock: new Date(now()).toISOString() };
        write('events', [...readLabEvents(), event]);
        const state = replaySession(sheet.spec, log);
        return state.status === 'playing' ? null : localStanding(resultOf(state));
      },
    }),
    fetchScars: async (sheetId): Promise<ScarMap | null> => {
      const state = replaySession(sheet.spec, logOf(sheetId));
      const points = state.history
        .filter((record) => record.verdict === 'blot' && record.point)
        .map((record) => ({ x: record.point?.x ?? 0, y: record.point?.y ?? 0, weight: 1 }));
      return { points, trap: null, hands: 1 };
    },
    openGame: () => hooks.onOpenGame(),
    closeGame: () => hooks.onCloseGame(),
    promptLogin: () => undefined,
    subscribe: async () => false,
    needsLessons: () => !localPrefs.tutorialDone(),
    markLessonsDone: () => localPrefs.setTutorialDone(),
  };
};
