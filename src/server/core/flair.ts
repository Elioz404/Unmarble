import type { FlairLabel, RedditPort } from '../reddit/reddit-port.ts';
import { keys } from './keys.ts';
import type { Store } from './store.ts';

/** The streak as it appears next to a player's name in the subreddit (a streak counts every finished day). */
export const flairText = (streak: number): string => `${streak}-day Unmarble streak`;

/** Every wording the app has written, current and earlier, so it can still replace or restore it. */
const STREAK_FLAIRS = [/^\d+-day Unmarble streak$/, /^Unmarbled \d+ days? running$/];

/** Whether a flair is one this app wrote (and may therefore change or remove). */
const isStreakFlair = (flair: FlairLabel | null): boolean =>
  flair !== null && flair.cssClass === '' && STREAK_FLAIRS.some((wording) => wording.test(flair.text));

const sameFlair = (a: FlairLabel | null, b: FlairLabel | null): boolean =>
  a === b || (a !== null && b !== null && a.text === b.text && a.cssClass === b.cssClass);

/** A player's flair record: whether the streak shows, for whom, and what it replaced. */
type FlairRecord = { readonly enabled: boolean; readonly username: string | null; readonly previous: FlairLabel | null };

const recordOf = (raw: Record<string, string>, enabledField: string): FlairRecord => {
  const text = raw.prevFlairText ?? '';
  const cssClass = raw.prevFlairCss ?? '';
  return {
    enabled: raw[enabledField] === '1',
    username: raw.username ?? null,
    previous: text || cssClass ? { text, cssClass } : null,
  };
};

/**
 * Opt-in streak flair. A player's flair is theirs, and moderators' flair
 * outranks the app:
 * - opting in sets the streak flair and remembers the flair it replaced;
 * - opting out puts that flair back;
 * - if anyone else changes the flair meanwhile (a moderator, say), the app
 *   steps aside and leaves it alone until the player opts in again.
 */
export class FlairService {
  readonly #store: Store;
  readonly #reddit: RedditPort;

  constructor(store: Store, reddit: RedditPort) {
    this.#store = store;
    this.#reddit = reddit;
  }

  async setEnabled(playerId: string, username: string, enabled: boolean, streak: number): Promise<boolean> {
    const record = await this.#record(playerId);
    if (!enabled) {
      if (!record.enabled) return false;
      // The flag goes first, so a failure below can never leave the app writing flair.
      await this.#store.hSet(keys.flair(playerId), { enabled: '0', username });
      await this.#stepBack(playerId, username, record.previous);
      return false;
    }
    if (record.enabled) return true;
    const current = await this.#reddit.userFlair(username);
    const previous = isStreakFlair(current) ? null : current;
    // A streak of zero shows nothing yet: the first counted day writes the flair.
    if (streak > 0) await this.#reddit.setUserFlair(username, { text: flairText(streak), cssClass: '' });
    await this.#store.hSet(keys.flair(playerId), {
      enabled: '1',
      username,
      prevFlairText: previous?.text ?? '',
      prevFlairCss: previous?.cssClass ?? '',
    });
    return true;
  }

  /** Streak listener: refreshes the flair of players who opted in, unless someone else changed it. */
  readonly onStreak = async (playerId: string, streak: number): Promise<void> => {
    const record = await this.#record(playerId);
    if (!record.enabled || !record.username) return;
    const current = await this.#reddit.userFlair(record.username);
    if (!isStreakFlair(current) && !sameFlair(current, record.previous)) {
      // Someone else set this flair after the player opted in: theirs wins.
      await this.#store.hSet(keys.flair(playerId), { enabled: '0', prevFlairText: '', prevFlairCss: '' });
      return;
    }
    await this.#reddit.setUserFlair(record.username, { text: flairText(streak), cssClass: '' });
  };

  /**
   * The player's flair record. Records from before flair had its own key live
   * on the player's progress hash; they are read (and moved) from there.
   */
  async #record(playerId: string): Promise<FlairRecord> {
    const own = await this.#store.hGetAll(keys.flair(playerId));
    if (own.enabled !== undefined) return recordOf(own, 'enabled');
    const legacy = await this.#store.hGetAll(keys.player(playerId));
    if (legacy.flair === undefined) return { enabled: false, username: null, previous: null };
    const record = recordOf(legacy, 'flair');
    await this.#store.hSet(keys.flair(playerId), {
      enabled: record.enabled ? '1' : '0',
      username: record.username ?? '',
      prevFlairText: record.previous?.text ?? '',
      prevFlairCss: record.previous?.cssClass ?? '',
    });
    await this.#store.hDel(keys.player(playerId), ['flair', 'username', 'prevFlairText', 'prevFlairCss']);
    return record;
  }

  /** Puts back the flair the streak replaced, but only while the streak flair is still showing. */
  async #stepBack(playerId: string, username: string, previous: FlairLabel | null): Promise<void> {
    const current = await this.#reddit.userFlair(username);
    if (isStreakFlair(current)) {
      if (previous) await this.#reddit.setUserFlair(username, previous);
      else await this.#reddit.removeUserFlair(username);
    }
    await this.#store.hSet(keys.flair(playerId), { prevFlairText: '', prevFlairCss: '' });
  }
}
