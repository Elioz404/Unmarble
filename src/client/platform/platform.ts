import type { BookResponse, ScarMap, SheetResponse, TrapResponse } from '../../shared/protocol/api.ts';
import type { Move } from '../../shared/puzzle/moves.ts';
import type { AttemptSink } from '../game/attempt-sink.ts';

/**
 * Everything the UI needs from its host. Two implementations exist:
 *  - `reddit-platform.ts` talks to the Devvit server and Reddit client APIs,
 *  - `lab-platform.ts` runs entirely in the browser for local design work and
 *    stranger playtests, with no Reddit account involved.
 * Screens receive a Platform and never import either implementation.
 */
export type Platform = {
  readonly kind: 'reddit' | 'lab';
  /** A sheet with the player's progress on it: the post's own sheet, or `sheetId` from the Book. */
  loadSheet(sheetId?: string): Promise<SheetResponse>;
  /** Where this player's actions on a sheet are recorded; `startSeq` is the log length already stored. */
  sinkFor(sheetId: string, startSeq: number): AttemptSink;
  fetchScars(sheetId: string): Promise<ScarMap | null>;
  /** Past daily sheets and recent traps, with this player's standing on each. */
  loadBook(): Promise<BookResponse>;
  /** Sets a trap on today's paper. */
  publishTrap(moves: readonly Move[]): Promise<TrapResponse>;
  /** Shows or hides the player's streak as subreddit flair; resolves to the new setting. */
  setFlair(enabled: boolean): Promise<boolean>;
  /** Opens a post (e.g. a freshly set trap) in Reddit. Must run inside a click handler. */
  openPost(url: string): void;
  /** From the in-feed card: open the full game. Must run inside a click handler. */
  openGame(event: MouseEvent): void;
  /** Leaves the full game. Must run inside a click handler. */
  closeGame(event: MouseEvent): void;
  /** Offers sign-in so streaks can be kept. */
  promptLogin(): void;
  /** The community the game lives in (e.g. "unmarble"), or null outside Reddit. */
  readonly community: string | null;
  /**
   * Opens the community's page, where Reddit's own Join button subscribes the
   * player themself. Must run inside a click handler.
   */
  openCommunity(): void;
  /**
   * Shares a result line: copied to the clipboard where allowed, and offered
   * through the host's share sheet (linking `postId`, the sheet's own post).
   */
  share(text: string, postId: string | null): Promise<ShareOutcome>;
};

/** What the player is told after sharing: copied, handed to a share sheet, or neither. */
export type ShareOutcome = 'shared' | 'copied' | 'failed';

/** Copies text with the browser's clipboard: the fallback wherever no share sheet exists. */
export const copyToClipboard = async (text: string): Promise<ShareOutcome> => {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
};
