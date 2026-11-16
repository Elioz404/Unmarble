import { RULES } from '../../shared/config.ts';
import { rankScore, resultOf, type Result } from '../../shared/game/scoring.ts';
import { applyAction, replaySession, type SessionState } from '../../shared/game/session.ts';
import type {
  ActionResponse,
  BookStatus,
  LoggedAction,
  PlayerView,
  ScarMap,
  SheetDescriptor,
  SheetStats,
  Standing,
} from '../../shared/protocol/api.ts';
import { parseActionLog, parseResult } from '../../shared/protocol/parse.ts';
import { addDays, dateKeyOf, type DateKey } from '../../shared/time/calendar.ts';
import { readJson } from './json.ts';
import { keys, RETENTION_SECONDS } from './keys.ts';
import { isSignedIn } from './players.ts';
import type { Store } from './store.ts';

/** Grid (cells) on which scars are pooled for the scar map. */
const SCAR_GRID = 0.5;
/** Optimistic-transaction retries before giving up on a contended write. */
const MAX_TX_ATTEMPTS = 4;

/** Told whenever a player's daily streak grows (e.g. to update their flair). */
export type StreakListener = (playerId: string, streak: number) => Promise<void>;

type Progress = { readonly lastDay: string | null; readonly streak: number; readonly best: number };

/** Hands that count when the community picks sheets: signed-in players only, so devices can't vote. */
export type SignedStats = { readonly hands: number; readonly cleans: number };

const sameEntry = (a: LoggedAction | undefined, b: LoggedAction): boolean =>
  a !== undefined && JSON.stringify(a) === JSON.stringify(b);

export class ContentionError extends Error {
  constructor(sheetId: string) {
    super(`Attempt on ${sheetId} is too contended to record`);
    this.name = 'ContentionError';
  }
}

/**
 * Server-authoritative attempts.
 *
 * - Every action is validated by replaying the player's log through the
 *   shared reducer, so reloading never undoes a blot.
 * - Actions are sequenced (`seq` = log length the client expects) and
 *   appended in an optimistic transaction: retries are idempotent, gaps and
 *   races come back as a conflict carrying the true log.
 * - Ranked time is measured by the server from the first recorded action; a
 *   client can report a slower time but never a faster one.
 */
export class AttemptService {
  readonly #store: Store;
  readonly #now: () => number;
  readonly #onStreak: StreakListener;

  constructor(store: Store, now: () => number = Date.now, onStreak: StreakListener = async () => undefined) {
    this.#store = store;
    this.#now = now;
    this.#onStreak = onStreak;
  }

  #today(): DateKey {
    return dateKeyOf(this.#now());
  }

  async logOf(sheetId: string, playerId: string): Promise<LoggedAction[]> {
    return parseActionLog(readJson(await this.#store.hGet(keys.attempts(sheetId), playerId))) ?? [];
  }

  async stats(sheetId: string): Promise<SheetStats> {
    const raw = await this.#store.hGetAll(keys.stats(sheetId));
    return { hands: Number(raw.hands ?? 0), cleans: Number(raw.cleans ?? 0), caught: Number(raw.caught ?? 0) };
  }

  /** Finished attempts by signed-in players (the only ones that weigh in on featuring). */
  async signedStats(sheetId: string): Promise<SignedStats> {
    const raw = await this.#store.hGetAll(keys.stats(sheetId));
    return { hands: Number(raw.signedHands ?? 0), cleans: Number(raw.signedCleans ?? 0) };
  }

  /** A player's stored result on a sheet, or null if they have not finished it. */
  async resultOf(sheetId: string, playerId: string): Promise<Result | null> {
    return parseResult(readJson(await this.#store.hGet(keys.results(sheetId), playerId)));
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
    if (!playerId) return { signedIn: false, log: [], streak: 0, flair: false };
    const [log, streak, flair, legacyFlair] = await Promise.all([
      this.logOf(sheetId, playerId),
      this.streak(playerId),
      this.#store.hGet(keys.flair(playerId), 'enabled'),
      this.#store.hGet(keys.player(playerId), 'flair'),
    ]);
    return { signedIn: isSignedIn(playerId), log, streak, flair: (flair ?? legacyFlair) === '1' };
  }

  /** How a player stands with a sheet, for the Book. */
  async statusOf(sheetId: string, playerId: string | null): Promise<BookStatus> {
    if (!playerId) return 'unplayed';
    const result = await this.resultOf(sheetId, playerId);
    if (result) return result.clean ? 'clean' : 'torn';
    return (await this.#store.hGet(keys.attempts(sheetId), playerId)) ? 'playing' : 'unplayed';
  }

  /** Validates and records the action at position `seq` of the player's log. */
  async record(sheet: SheetDescriptor, playerId: string, seq: number, entry: LoggedAction): Promise<ActionResponse> {
    const attemptsKey = keys.attempts(sheet.id);
    for (let attempt = 0; attempt < MAX_TX_ATTEMPTS; attempt++) {
      const tx = await this.#store.watch(attemptsKey);
      const log = await this.logOf(sheet.id, playerId);

      if (seq < log.length) {
        await tx.unwatch();
        // A retry of an action we already hold: answer again, change nothing.
        return sameEntry(log[seq], entry)
          ? this.#acknowledge(sheet, playerId, log.slice(0, seq + 1))
          : { kind: 'conflict', log };
      }
      if (seq > log.length || (log.length > 0 && entry.at < (log[log.length - 1]?.at ?? 0))) {
        await tx.unwatch();
        return { kind: 'conflict', log };
      }

      const before = replaySession(sheet.spec, log);
      const transition = applyAction(sheet.spec, before, entry.action, entry.at, entry.point);
      if (transition.verdict === 'ignored') {
        await tx.unwatch();
        return { kind: 'applied', verdict: 'ignored', standing: null };
      }

      await tx.multi();
      await tx.hSet(attemptsKey, { [playerId]: JSON.stringify([...log, entry]) });
      await tx.expire(attemptsKey, RETENTION_SECONDS);
      if (log.length === 0) {
        await tx.hSetNX(keys.attemptStarts(sheet.id), playerId, String(this.#now()));
        await tx.expire(keys.attemptStarts(sheet.id), RETENTION_SECONDS);
      }
      const committed = await tx.exec().catch(() => null);
      if (!committed) continue; // Someone else wrote first: re-read and re-judge.

      if (transition.verdict === 'blot') await this.#recordScar(sheet.id, before, entry);
      const standing =
        transition.state.status === 'playing' ? null : await this.#finish(sheet, playerId, transition.state);
      return { kind: 'applied', verdict: transition.verdict, standing };
    }
    throw new ContentionError(sheet.id);
  }

  /** The standing of a finished attempt, or null while it is still in play. */
  async standing(sheet: SheetDescriptor, playerId: string): Promise<Standing | null> {
    const stored = await this.resultOf(sheet.id, playerId);
    return stored ? this.#standingOf(sheet.id, playerId, stored) : null;
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

  async #acknowledge(sheet: SheetDescriptor, playerId: string, prefix: LoggedAction[]): Promise<ActionResponse> {
    const state = replaySession(sheet.spec, prefix);
    const verdict = state.history[state.history.length - 1]?.verdict ?? 'ignored';
    const standing = state.status === 'playing' ? null : await this.standing(sheet, playerId);
    return { kind: 'applied', verdict, standing };
  }

  async #recordScar(sheetId: string, before: SessionState, entry: LoggedAction): Promise<void> {
    if (entry.point) {
      const snap = (v: number) => Math.round(v / SCAR_GRID) * SCAR_GRID;
      await this.#store.hIncrBy(keys.scars(sheetId), `${snap(entry.point.x)},${snap(entry.point.y)}`, 1);
      await this.#store.expire(keys.scars(sheetId), RETENTION_SECONDS);
    }
    // Count each player once per trap: the move they misread.
    const action = entry.action;
    if (action.type === 'magnify') return;
    const alreadyCaught = before.history.some(
      (h) => h.verdict === 'blot' && h.action.type !== 'magnify' && h.action.move === action.move,
    );
    if (!alreadyCaught) {
      await this.#store.hIncrBy(keys.traps(sheetId), String(action.move), 1);
      await this.#store.expire(keys.traps(sheetId), RETENTION_SECONDS);
    }
  }

  /** Server-observed time since the player's first action on this sheet. */
  async #serverElapsed(sheetId: string, playerId: string): Promise<{ elapsed: number; startDay: DateKey }> {
    const raw = await this.#store.hGet(keys.attemptStarts(sheetId), playerId);
    const startedAt = raw === undefined ? this.#now() : Number(raw);
    return {
      elapsed: Math.min(RULES.maxAttemptMs, Math.max(0, this.#now() - startedAt)),
      startDay: dateKeyOf(startedAt),
    };
  }

  async #finish(sheet: SheetDescriptor, playerId: string, state: SessionState): Promise<Standing> {
    const claimed = resultOf(state);
    const { elapsed, startDay } = await this.#serverElapsed(sheet.id, playerId);
    // The client may report a slower time (it counts from first sight), never a faster one.
    const result: Result = { ...claimed, durationMs: Math.max(claimed.durationMs, elapsed) };
    const stored = await this.#store.hSetNX(keys.results(sheet.id), playerId, JSON.stringify(result));
    await this.#store.expire(keys.results(sheet.id), RETENTION_SECONDS);
    if (stored > 0) {
      await this.#store.zAdd(keys.board(sheet.id), { member: playerId, score: rankScore(result) });
      await this.#store.expire(keys.board(sheet.id), RETENTION_SECONDS);
      await this.#store.hIncrBy(keys.stats(sheet.id), 'hands', 1);
      if (result.clean) await this.#store.hIncrBy(keys.stats(sheet.id), 'cleans', 1);
      // A hand the sheet caught: it finished, but tore it at least once. Always a subset of hands.
      if (result.blots > 0) await this.#store.hIncrBy(keys.stats(sheet.id), 'caught', 1);
      await this.#store.expire(keys.stats(sheet.id), RETENTION_SECONDS);
      if (isSignedIn(playerId)) {
        await this.#store.hIncrBy(keys.stats(sheet.id), 'signedHands', 1);
        if (result.clean) await this.#store.hIncrBy(keys.stats(sheet.id), 'signedCleans', 1);
      }
      // A daily sheet counts for the streak when it was begun on its own day.
      if (sheet.kind === 'daily' && sheet.dateKey === startDay) {
        const streak = await this.#advanceStreak(playerId, sheet.dateKey);
        // Listeners (flair) are a courtesy: their failure never fails the finish.
        if (streak !== null) {
          await this.#onStreak(playerId, streak).catch((error: unknown) => {
            console.error('Streak listener failed', error);
          });
        }
      }
    }
    return (await this.standing(sheet, playerId)) ?? this.#standingOf(sheet.id, playerId, result);
  }

  /**
   * Advances the streak for `day`; returns the new streak, or null when the
   * day was already counted or is older than the run's newest day (an old
   * sheet finished late never rewinds a streak).
   */
  async #advanceStreak(playerId: string, day: DateKey): Promise<number | null> {
    const { lastDay, streak, best } = await this.progress(playerId);
    // Date keys are ISO dates, so string order is calendar order.
    if (lastDay !== null && day <= lastDay) return null;
    const next = lastDay === addDays(day, -1) ? streak + 1 : 1;
    await this.#store.hSet(keys.player(playerId), {
      lastDay: day,
      streak: String(next),
      best: String(Math.max(best, next)),
    });
    // A player's record lasts as long as they keep playing.
    await this.#store.expire(keys.player(playerId), RETENTION_SECONDS);
    return next;
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
