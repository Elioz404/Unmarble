import type { PlayerAction, SheetPoint, Verdict } from '../game/session.ts';
import type { Result } from '../game/scoring.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
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
});

/** One sheet as presented to players. */
export type SheetDescriptor = {
  readonly id: string;
  readonly number: number;
  readonly dateKey: DateKey;
  readonly weekday: string;
  readonly paletteName: string;
  readonly spec: SheetSpec;
  /** Name given by the community in the comments, once it is settled. */
  readonly name: string | null;
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
};

export type SheetStats = {
  readonly hands: number;
  readonly cleans: number;
};

export type SheetResponse = {
  readonly sheet: SheetDescriptor;
  readonly player: PlayerView;
  readonly stats: SheetStats;
  /** Epoch ms of the next daily sheet. */
  readonly nextSheetAt: number;
  /** Today's sheet id, so an old post can point players to it. */
  readonly todayId: string;
};

export type ActionRequest = {
  readonly sheetId: string;
  readonly entry: LoggedAction;
};

export type Standing = {
  readonly result: Result;
  /** 1-based position among everyone who finished this sheet. */
  readonly rank: number;
  readonly stats: SheetStats;
  readonly streak: number;
};

export type ActionResponse = {
  readonly verdict: Verdict;
  /** Present once the attempt is over. */
  readonly standing: Standing | null;
};

/** Where players tore the sheet, aggregated; only shown after finishing. */
export type ScarMap = {
  readonly points: readonly { readonly x: number; readonly y: number; readonly weight: number }[];
  /** The move that caused the most blots and the share of hands it caught. */
  readonly trap: { readonly move: number; readonly share: number } | null;
  readonly hands: number;
};

export type ErrorResponse = { readonly error: string };
