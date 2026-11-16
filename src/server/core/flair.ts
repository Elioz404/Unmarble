import type { FlairLabel, RedditPort } from '../reddit/reddit-port.ts';
import { keys } from './keys.ts';
import type { Store } from './store.ts';

/** The streak as it appears next to a player's name in the subreddit. */
export const flairText = (streak: number): string => `Unmarbled ${streak} ${streak === 1 ? 'day' : 'days'} running`;

const STREAK_FLAIR = /^Unmarbled \d+ days? running$/;

/** Whether a flair is one this app wrote (and may therefore change or remove). */
const isStreakFlair = (flair: FlairLabel | null): boolean =>
  flair !== null && flair.cssClass === '' && STREAK_FLAIR.test(flair.text);

const sameFlair = (a: FlairLabel | null, b: FlairLabel | null): boolean =>
  a === b || (a !== null && b !== null && a.text === b.text && a.cssClass === b.cssClass);

/** The flair the streak replaced, as remembered on the player's record. */
const previousOf = (player: Record<string, string>): FlairLabel | null => {
  const text = player.prevFlairText ?? '';
  const cssClass = player.prevFlairCss ?? '';
  return text || cssClass ? { text, cssClass } : null;
};

const REMEMBERED = ['prevFlairText', 'prevFlairCss'];

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
    const player = await this.#store.hGetAll(keys.player(playerId));
    const on = player.flair === '1';
    if (!enabled) {
      if (!on) return false;
      // The flag goes first, so a failure below can never leave the app writing flair.
      await this.#store.hSet(keys.player(playerId), { flair: '0' });
      await this.#stepBack(playerId, username, previousOf(player));
      return false;
    }
    if (on) return true;
    const current = await this.#reddit.userFlair(username);
    const previous = isStreakFlair(current) ? null : current;
    // A streak of zero shows nothing yet: the first counted day writes the flair.
    if (streak > 0) await this.#reddit.setUserFlair(username, { text: flairText(streak), cssClass: '' });
    await this.#store.hSet(keys.player(playerId), {
      flair: '1',
      username,
      prevFlairText: previous?.text ?? '',
      prevFlairCss: previous?.cssClass ?? '',
    });
    return true;
  }

  /** Streak listener: refreshes the flair of players who opted in, unless someone else changed it. */
  readonly onStreak = async (playerId: string, streak: number): Promise<void> => {
    const player = await this.#store.hGetAll(keys.player(playerId));
    if (player.flair !== '1' || !player.username) return;
    const current = await this.#reddit.userFlair(player.username);
    if (!isStreakFlair(current) && !sameFlair(current, previousOf(player))) {
      // Someone else set this flair after the player opted in: theirs wins.
      await this.#store.hSet(keys.player(playerId), { flair: '0' });
      await this.#store.hDel(keys.player(playerId), REMEMBERED);
      return;
    }
    await this.#reddit.setUserFlair(player.username, { text: flairText(streak), cssClass: '' });
  };

  /** Puts back the flair the streak replaced, but only while the streak flair is still showing. */
  async #stepBack(playerId: string, username: string, previous: FlairLabel | null): Promise<void> {
    const current = await this.#reddit.userFlair(username);
    if (isStreakFlair(current)) {
      if (previous) await this.#reddit.setUserFlair(username, previous);
      else await this.#reddit.removeUserFlair(username);
    }
    await this.#store.hDel(keys.player(playerId), REMEMBERED);
  }
}
