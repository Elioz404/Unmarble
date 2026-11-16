import { randomBytes } from 'node:crypto';
import type { SheetDescriptor, TrapResponse } from '../../shared/protocol/api.ts';
import { parseSheetDescriptor } from '../../shared/protocol/post-data.ts';
import type { Move } from '../../shared/puzzle/moves.ts';
import { checkTrap } from '../../shared/puzzle/trap.ts';
import { addDays, type DateKey } from '../../shared/time/calendar.ts';
import type { RedditPort } from '../reddit/reddit-port.ts';
import type { AttemptService } from './attempts.ts';
import { readJson } from './json.ts';
import { keys } from './keys.ts';
import type { Store } from './store.ts';

const TRAP_PREFIX = 't-';
/** Random part of a trap id, in bytes. */
const TRAP_ID_BYTES = 5;

/** What makes a trap worth featuring as a Sunday sheet. */
export const FEATURE = Object.freeze({
  /** Days of traps considered, ending the day before Sunday. */
  windowDays: 7,
  /** Fewest hands that must have played it. */
  minHands: 3,
  /** Share of hands that cleaned it: devious, but not impossible. */
  cleanShare: Object.freeze({ min: 0.3, max: 0.85 }),
});

export type TrapMaker = { readonly playerId: string; readonly username: string };

export const isTrapId = (id: string): boolean => id.startsWith(TRAP_PREFIX);

/**
 * Traps set by players. Each is checked against the full sheet contract on
 * the server (the editor's check is only a convenience), published as its own
 * post, and becomes a sheet anyone can play and be ranked on.
 */
export class TrapService {
  readonly #store: Store;
  readonly #reddit: RedditPort;
  readonly #attempts: AttemptService;
  readonly #now: () => number;

  constructor(store: Store, reddit: RedditPort, attempts: AttemptService, now: () => number = Date.now) {
    this.#store = store;
    this.#reddit = reddit;
    this.#attempts = attempts;
    this.#now = now;
  }

  async byId(trapId: string): Promise<SheetDescriptor | null> {
    if (!isTrapId(trapId)) return null;
    return parseSheetDescriptor(readJson(await this.#store.get(keys.trap(trapId))));
  }

  /** Newest traps first. */
  async recent(limit: number): Promise<SheetDescriptor[]> {
    const ids = await this.#store.zRange(keys.recentTraps(), 0, limit - 1, { by: 'rank', reverse: true });
    const traps = await Promise.all(ids.map(({ member }) => this.byId(member)));
    return traps.filter((trap) => trap !== null);
  }

  /**
   * Publishes a trap on today's paper. One per player per day; signed-in
   * players only, because a trap carries its maker's name. The post goes out
   * as the app, so the app itself keeps banned users from posting through it.
   */
  async publish(maker: TrapMaker, moves: readonly Move[], today: SheetDescriptor, subreddit: string): Promise<TrapResponse> {
    if (await this.#reddit.isBanned(maker.username)) return { kind: 'rejected', reason: 'banned' };
    const check = checkTrap(moves, today.spec.ground);
    if (check.problem) return { kind: 'rejected', reason: 'unfair' };

    const id = `${TRAP_PREFIX}${today.dateKey}-${randomBytes(TRAP_ID_BYTES).toString('hex')}`;
    const claimed = await this.#store.hSetNX(keys.trapsSetOn(today.dateKey), maker.playerId, id);
    if (claimed === 0) return { kind: 'rejected', reason: 'daily-limit' };

    const sheet: SheetDescriptor = {
      id,
      kind: 'trap',
      author: maker.username,
      number: today.number,
      dateKey: today.dateKey,
      weekday: today.weekday,
      paletteName: today.paletteName,
      spec: { paletteId: today.spec.paletteId, ground: today.spec.ground, moves, stars: check.stars },
      name: null,
    };
    await this.#store.set(keys.trap(id), JSON.stringify(sheet));
    let postId: string;
    try {
      postId = await this.#reddit.submitSheetPost({
        title: `A trap by u/${maker.username} · ${'★'.repeat(check.stars)} · ${moves.length} moves`,
        binding: { kind: 'trap', sheet },
        fallback: `**UNMARBLE** — a trap set by u/${maker.username} on Sheet No. ${today.number}'s paper. Open this post on new Reddit or in the app to play.`,
      });
    } catch (error) {
      // Nothing was published: give the player their daily trap back.
      await this.#store.hDel(keys.trapsSetOn(today.dateKey), [maker.playerId]);
      throw error;
    }
    const publishedAt = this.#now();
    await this.#store.hSet(keys.trapMeta(id), { maker: maker.playerId, publishedAt: String(publishedAt) });
    await this.#store.hSet(keys.trapPosts(), { [id]: postId });
    await this.#store.hSet(keys.postSheets(), { [postId]: id });
    await this.#store.zAdd(keys.recentTraps(), { member: id, score: publishedAt });
    const postUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId.replace(/^t3_/, '')}`;
    return { kind: 'published', sheet, postUrl };
  }

  /** A removed or deleted trap post takes its trap out of circulation. */
  async withdraw(trapId: string): Promise<void> {
    await this.#store.zRem(keys.recentTraps(), [trapId]);
  }

  /** A trap post a moderator approved again comes back, in its original place. */
  async reinstate(trapId: string): Promise<void> {
    const meta = await this.#store.hGetAll(keys.trapMeta(trapId));
    const publishedAt = Number(meta.publishedAt);
    if (!Number.isFinite(publishedAt) || !(await this.byId(trapId))) return;
    await this.#store.zAdd(keys.recentTraps(), { member: trapId, score: publishedAt });
  }

  /**
   * How a trap fared with everyone but its maker: only signed-in hands count,
   * so neither logged-out devices nor the maker's own run can lift it.
   */
  async #fairStats(trapId: string): Promise<{ hands: number; cleans: number }> {
    const [signed, meta] = await Promise.all([
      this.#attempts.signedStats(trapId),
      this.#store.hGetAll(keys.trapMeta(trapId)),
    ]);
    const own = meta.maker ? await this.#attempts.resultOf(trapId, meta.maker) : null;
    return own ? { hands: signed.hands - 1, cleans: signed.cleans - (own.clean ? 1 : 0) } : signed;
  }

  /**
   * The trap to feature as the Sunday sheet of `sunday`: the most-played trap
   * of the past week whose clean share shows it was devious but fair.
   */
  async featuredFor(sunday: DateKey): Promise<SheetDescriptor | null> {
    const from = Date.parse(`${addDays(sunday, -FEATURE.windowDays)}T00:00:00Z`);
    const to = Date.parse(`${sunday}T00:00:00Z`) - 1;
    const window = await this.#store.zRange(keys.recentTraps(), from, to, { by: 'score' });
    let best: { trap: SheetDescriptor; hands: number } | null = null;
    for (const { member } of window) {
      const trap = await this.byId(member);
      if (!trap || trap.dateKey >= sunday) continue;
      const stats = await this.#fairStats(trap.id);
      if (stats.hands < FEATURE.minHands) continue;
      const share = stats.cleans / stats.hands;
      if (share < FEATURE.cleanShare.min || share > FEATURE.cleanShare.max) continue;
      if (!best || stats.hands > best.hands) best = { trap, hands: stats.hands };
    }
    return best?.trap ?? null;
  }
}
