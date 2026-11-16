import type { ScarMap, SheetResponse } from '../../shared/protocol/api.ts';
import type { AttemptSink } from '../game/controller.ts';

/**
 * Everything the UI needs from its host. Two implementations exist:
 *  - `reddit-platform.ts` talks to the Devvit server and Reddit client APIs,
 *  - `lab-platform.ts` runs entirely in the browser for local design work and
 *    stranger playtests, with no Reddit account involved.
 * Screens receive a Platform and never import either implementation.
 */
export type Platform = {
  readonly kind: 'reddit' | 'lab';
  /** The sheet this post shows, with the player's progress on it. */
  loadSheet(): Promise<SheetResponse>;
  sinkFor(sheetId: string): AttemptSink;
  fetchScars(sheetId: string): Promise<ScarMap | null>;
  /** From the in-feed card: open the full game. Must run inside a click handler. */
  openGame(event: MouseEvent): void;
  /** Leaves the full game (no-op where there is nothing to leave). */
  closeGame(): void;
  /** Offers sign-in so streaks can be kept. */
  promptLogin(): void;
  /** Subscribes the player to the subreddit; resolves false if unavailable. */
  subscribe(): Promise<boolean>;
  /** Whether this player still needs the three-sheet introduction. */
  needsLessons(): boolean;
  markLessonsDone(): void;
};
