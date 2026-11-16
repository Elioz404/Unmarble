import type { RedditPort } from '../reddit/reddit-port.ts';
import { keys } from './keys.ts';
import type { Store } from './store.ts';

/** The streak as it appears next to a player's name in the subreddit. */
export const flairText = (streak: number): string => `Unmarbled ${streak} ${streak === 1 ? 'day' : 'days'} running`;

/**
 * Opt-in streak flair. A player's flair is theirs: it is only ever written
 * after they ask for it (replacing whatever they had), kept up to date as the
 * streak grows, and removed when they opt out.
 */
export class FlairService {
  readonly #store: Store;
  readonly #reddit: RedditPort;

  constructor(store: Store, reddit: RedditPort) {
    this.#store = store;
    this.#reddit = reddit;
  }

  async setEnabled(playerId: string, username: string, enabled: boolean, streak: number): Promise<boolean> {
    await this.#store.hSet(keys.player(playerId), { flair: enabled ? '1' : '0', username });
    if (enabled) await this.#reddit.setUserFlair(username, flairText(Math.max(1, streak)));
    else await this.#reddit.removeUserFlair(username);
    return enabled;
  }

  /** Streak listener: refreshes the flair of players who opted in. */
  readonly onStreak = async (playerId: string, streak: number): Promise<void> => {
    const player = await this.#store.hGetAll(keys.player(playerId));
    if (player.flair !== '1' || !player.username) return;
    await this.#reddit.setUserFlair(player.username, flairText(streak));
  };
}
