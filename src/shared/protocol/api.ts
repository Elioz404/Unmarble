import type { PlayerAction, SheetPoint, Verdict } from '../game/session.ts';
import type { Result } from '../game/scoring.ts';
import type { Move } from '../puzzle/moves.ts';
import type { RecipeTag } from '../puzzle/recipes.ts';
import type { SheetSpec, Stars } from '../puzzle/sheet.ts';
import type { DateKey } from '../time/calendar.ts';

/**
 * The client ↔ server contract. Every request body is parsed with the
 * validators in `./parse.ts` on the server: `/api/*` routes are publicly
 * callable, so nothing here is trusted on arrival.
 */

export const API = Object.freeze({
  sheet: '/api/sheet',
  action: '/api/attempt/action',
  scars: '/api/sheet/scars',
  book: '/api/book',
  traps: '/api/traps',
  flair: '/api/flair',
});

/**
 * A daily sheet (made by the bindery), a trap (made by a player for others)
 * or a practice sheet (made on the player's device, never sent to or
 * accepted by the server).
 */
export type SheetKind = 'daily' | 'trap' | 'practice';

/** One sheet as presented to players. */
export type SheetDescriptor = {
  readonly id: string;
  readonly kind: SheetKind;
  /** Reddit username of the player who made it: a trap's maker, or the maker of a featured Sunday sheet. */
  readonly author: string | null;
  /** The daily sheet number of the day it belongs to (traps: the day they were set). */
  readonly number: number;
  readonly dateKey: DateKey;
  readonly weekday: string;
  readonly paletteName: string;
  readonly spec: SheetSpec;
  /** Name given by the community in the comments, once it is settled. */
  readonly name: string | null;
  /** The recipe a daily sheet features; null for traps, featured Sundays and sheets made before recipes. */
  readonly recipe: RecipeTag | null;
};

/** What tomorrow's daily sheet will ask, announced by the server (only it knows the calendar seed). */
export type DayPreview = {
  readonly dateKey: DateKey;
  /** 'Tuesday'. */
  readonly weekday: string;
  /** Null on a Sunday, which may be a community trap of any difficulty; a special day's own stars. */
  readonly stars: Stars | null;
  /** Null on a Sunday (its recipe is revealed on the day) and before recipes. */
  readonly recipe: RecipeTag | null;
  /** The recipe's promise, or the generic Sunday line. */
  readonly promise: string;
};

export type LoggedAction = {
  readonly action: PlayerAction;
  readonly at: number;
  readonly point: SheetPoint | null;
};

export type PlayerView = {
  readonly signedIn: boolean;
  /** The player's attempt on this sheet so far, to resume exactly where they left. */
  readonly log: readonly LoggedAction[];
  readonly streak: number;
  /** Whether the player chose to show their streak as subreddit flair. */
  readonly flair: boolean;
};

export type SheetStats = {
  readonly hands: number;
  readonly cleans: number;
  /** Finished hands that tore the sheet at least once: how many a trap caught. */
  readonly caught: number;
};

/** The Reddit thread where a sheet is talked about: its own post. */
export type SheetThread = {
  readonly url: string;
  /** The post's id (t3_…), for sharing it. */
  readonly postId: string;
  /** Whether replies to its pinned comment can still name the sheet. */
  readonly naming: boolean;
};

/** How the player's latest trap is doing. */
export type TrapCatch = {
  readonly sheetId: string;
  readonly caught: number;
  readonly hands: number;
};

export type SheetResponse = {
  readonly sheet: SheetDescriptor;
  readonly player: PlayerView;
  /** The player's standing, once their attempt on this sheet is over. */
  readonly standing: Standing | null;
  readonly stats: SheetStats;
  /** Epoch ms of the next daily sheet. */
  readonly nextSheetAt: number;
  /** Today's sheet id, so an old post can point players to it. */
  readonly todayId: string;
  /** This sheet's post, once it has one. */
  readonly thread: SheetThread | null;
  /** The trap this player set most recently (within a week), if any. */
  readonly yourTrap: TrapCatch | null;
  /** What tomorrow's sheet will ask; null from a server that does not announce it. */
  readonly tomorrow: DayPreview | null;
};

export type ActionRequest = {
  readonly sheetId: string;
  /** Length of the log the client believes the server holds before this entry. */
  readonly seq: number;
  readonly entry: LoggedAction;
};

export type Standing = {
  readonly result: Result;
  /** 1-based position among everyone who finished this sheet. */
  readonly rank: number;
  readonly stats: SheetStats;
  readonly streak: number;
};

export type ActionResponse =
  | {
      readonly kind: 'applied';
      readonly verdict: Verdict;
      /** Present once the attempt is over. */
      readonly standing: Standing | null;
    }
  /** The client's log diverged from the server's; here is the truth. */
  | { readonly kind: 'conflict'; readonly log: readonly LoggedAction[] };

/** Where players tore the sheet, aggregated; only shown after finishing. */
export type ScarMap = {
  readonly points: readonly { readonly x: number; readonly y: number; readonly weight: number }[];
  /** The move that caused the most blots and the share of hands it caught. */
  readonly trap: { readonly move: number; readonly share: number } | null;
  readonly hands: number;
};

/** How the player stands with a sheet, as listed in the Book. */
export type BookStatus = 'unplayed' | 'playing' | 'clean' | 'torn';

export type BookEntry = {
  readonly sheet: SheetDescriptor;
  readonly status: BookStatus;
  readonly stats: SheetStats;
  /** A trap currently set to become next Sunday's sheet. */
  readonly inTheRunning: boolean;
};

/** The Book: past daily sheets and recent traps, newest first. */
export type BookResponse = {
  readonly dailies: readonly BookEntry[];
  readonly traps: readonly BookEntry[];
};

/** A trap as the editor submits it: only the moves; the paper is always today's. */
export type TrapRequest = { readonly moves: readonly Move[] };

export type TrapResponse =
  | { readonly kind: 'published'; readonly sheet: SheetDescriptor; readonly postUrl: string | null }
  | { readonly kind: 'rejected'; readonly reason: TrapRejection };

export type TrapRejection = 'invalid' | 'unfair' | 'signed-out' | 'daily-limit' | 'banned';

export type FlairRequest = { readonly enabled: boolean };
export type FlairResponse = { readonly enabled: boolean };

export type ErrorResponse = { readonly error: string };
