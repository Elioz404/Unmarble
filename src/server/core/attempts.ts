import { rankScore, resultOf, type Result } from '../../shared/game/scoring.ts';
import { applyAction, replaySession, type SessionState } from '../../shared/game/session.ts';
import type {
  ActionResponse,
  LoggedAction,
  PlayerView,
  ScarMap,
  SheetDescriptor,
  SheetStats,
  Standing,
} from '../../shared/protocol/api.ts';
import { parseActionLog } from '../../shared/protocol/parse.ts';
import { addDays } from '../../shared/time/calendar.ts';
import { readJson } from './json.ts';
import { keys, RETENTION_SECONDS } from './keys.ts';
import type { Store } from './store.ts';

/** Grid (cells) on which scars are pooled for the scar map. */
const SCAR_GRID = 0.5;

type Progress = { readonly lastDay: string | null; readonly streak: number; readonly best: number };

/**
 * Server-authoritative attempts. Every action is validated by replaying the
 * player's log through the shared reducer, so reloading never undoes a blot
 * and a result can only be what the rules allow.
 */
export class AttemptService {
  readonly #store: Store;
  readonly #today: () => string;

  constructor(store: Store, today: () => string) {
    this.#store = store;
    this.#today = today;
  }

  async logOf(sheetId: string, playerId: string): Promise<LoggedAction[]> {
    return parseActionLog(readJson(await this.#store.hGet(keys.attempts(sheetId), playerId))) ?? [];
  }

  async stats(sheetId: string): Promise<SheetStats> {
    const raw = await this.#store.hGetAll(keys.stats(sheetId));
    return { hands: Number(raw.hands ?? 0), cleans: Number(raw.cleans ?? 0) };
  }

  async progress(playerId: string): Promise<Progress> {
    const raw = await this.#store.hGetAll(keys.player(playerId));
    return { lastDay: raw.lastDay ?? null, streak: Number(raw.streak ?? 0), best: Number(raw.best ?? 0) };
  }

  /** The current streak as of today: it lapses once a day is missed. */
  async streak(playerId: string): Promise<number> {
    const { lastDay, streak } = await this.progress(playerId);
    const today = this.#today();
    return lastDay === today || lastDay === addDays(today, -1) ? streak : 0;
  }

  async playerView(sheetId: string, playerId: string | null): Promise<PlayerView> {
    if (!playerId) return { signedIn: false, log: [], streak: 0 };
    const [log, streak] = await Promise.all([this.logOf(sheetId, playerId), this.streak(playerId)]);
    return { signedIn: !playerId.startsWith('anon:'), log, streak };
  }

  /** Validates and records one action; returns the verdict and, at the end, the standing. */
  async record(sheet: SheetDescriptor, playerId: string, entry: LoggedAction): Promise<ActionResponse> {
    const log = await this.logOf(sheet.id, playerId);
    const previous = log[log.length - 1];
    if (previous && entry.at < previous.at) return { verdict: 'ignored', standing: null };
    const state = replaySession(sheet.spec, log);
    const transition = applyAction(sheet.spec, state, entry.action, entry.at, entry.point);
    if (transition.verdict === 'ignored') return { verdict: 'ignored', standing: null };

    const attemptsKey = keys.attempts(sheet.id);
    await this.#store.hSet(attemptsKey, { [playerId]: JSON.stringify([...log, entry]) });
    await this.#store.expire(attemptsKey, RETENTION_SECONDS);
    if (transition.verdict === 'blot') await this.#recordScar(sheet.id, state, entry);
    if (transition.state.status === 'playing') return { verdict: transition.verdict, standing: null };
    return { verdict: transition.verdict, standing: await this.#finish(sheet, playerId, transition.state) };
  }

  async standing(sheet: SheetDescriptor, playerId: string): Promise<Standing | null> {
    const state = replaySession(sheet.spec, await this.logOf(sheet.id, playerId));
    if (state.status === 'playing') return null;
    return this.#standingOf(sheet.id, playerId, resultOf(state));
  }

  async scarMap(sheet: SheetDescriptor, playerId: string | null): Promise<ScarMap | null> {
    if (!playerId) return null;
    const state = replaySession(sheet.spec, await this.logOf(sheet.id, playerId));
    if (state.status === 'playing') return null; // Never spoil an unfinished sheet.
    const [scars, traps, stats] = await Promise.all([
      this.#store.hGetAll(keys.scars(sheet.id)),
      this.#store.hGetAll(keys.traps(sheet.id)),
      this.stats(sheet.id),
    ]);
    const points = Object.entries(scars).map(([cell, weight]) => {
      const [x, y] = cell.split(',').map(Number);
      return { x: x ?? 0, y: y ?? 0, weight: Number(weight) };
    });
    let trap: ScarMap['trap'] = null;
    for (const [move, count] of Object.entries(traps)) {
      const share = stats.hands > 0 ? Number(count) / stats.hands : 0;
      if (!trap || share > trap.share) trap = { move: Number(move), share };
    }
    return { points, trap, hands: stats.hands };
  }

  async #recordScar(sheetId: string, before: SessionState, entry: LoggedAction): Promise<void> {
    if (entry.point) {
      const snap = (v: number) => Math.round(v / SCAR_GRID) * SCAR_GRID;
      await this.#store.hIncrBy(keys.scars(sheetId), `${snap(entry.point.x)},${snap(entry.point.y)}`, 1);
    }
    // Count each player once per trap: the move they misread.
    const action = entry.action;
    if (action.type === 'magnify') return;
    const alreadyCaught = before.history.some(
      (h) => h.verdict === 'blot' && h.action.type !== 'magnify' && h.action.move === action.move,
    );
    if (!alreadyCaught) await this.#store.hIncrBy(keys.traps(sheetId), String(action.move), 1);
  }

  async #finish(sheet: SheetDescriptor, playerId: string, state: SessionState): Promise<Standing> {
    const result = resultOf(state);
    const added = await this.#store.zAdd(keys.board(sheet.id), { member: playerId, score: rankScore(result) });
    if (added > 0) {
      await this.#store.hIncrBy(keys.stats(sheet.id), 'hands', 1);
      if (result.clean) await this.#store.hIncrBy(keys.stats(sheet.id), 'cleans', 1);
      if (sheet.dateKey === this.#today()) await this.#advanceStreak(playerId, sheet.dateKey);
    }
    return this.#standingOf(sheet.id, playerId, result);
  }

  async #advanceStreak(playerId: string, day: string): Promise<void> {
    const { lastDay, streak, best } = await this.progress(playerId);
    if (lastDay === day) return;
    const next = lastDay === addDays(day, -1) ? streak + 1 : 1;
    await this.#store.hSet(keys.player(playerId), {
      lastDay: day,
      streak: String(next),
      best: String(Math.max(best, next)),
    });
  }

  async #standingOf(sheetId: string, playerId: string, result: Result): Promise<Standing> {
    const [rank, stats, streak] = await Promise.all([
      this.#store.zRank(keys.board(sheetId), playerId),
      this.stats(sheetId),
      this.streak(playerId),
    ]);
    return { result, rank: (rank ?? 0) + 1, stats, streak };
  }
}

