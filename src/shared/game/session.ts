import { RULES } from '../config.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';

/**
 * The rules of one attempt, as a pure reducer. The client applies actions
 * optimistically; the server replays the very same log to verify results.
 *
 * The player unmarbles the sheet from the top down:
 *  - `absorb` draws a drop back into the water,
 *  - `unstroke` drags a seam back, against the direction it was made,
 *  - `magnify` shows the undisturbed ruling for a moment (once per sheet).
 * Acting on anything but the top move, or dragging a seam the wrong way,
 * tears the paper: a blot. Too many blots and the sheet is torn.
 */
export type PlayerAction =
  | { readonly type: 'absorb'; readonly move: number }
  | { readonly type: 'unstroke'; readonly move: number; readonly against: boolean }
  | { readonly type: 'magnify' };

export type Verdict = 'correct' | 'blot' | 'ignored';

export type SessionStatus = 'playing' | 'clean' | 'torn';

/** Where on the sheet an action happened, in cells (for scars). */
export type SheetPoint = { readonly x: number; readonly y: number };

export type ActionRecord = {
  readonly action: PlayerAction;
  readonly verdict: Verdict;
  /** Milliseconds since the attempt started. */
  readonly at: number;
  readonly point: SheetPoint | null;
};

export type SessionState = {
  readonly total: number;
  /** Moves still on the sheet. */
  readonly remaining: number;
  readonly blots: number;
  readonly magnified: boolean;
  readonly status: SessionStatus;
  readonly history: readonly ActionRecord[];
};

export const startSession = (spec: SheetSpec): SessionState => ({
  total: spec.moves.length,
  remaining: spec.moves.length,
  blots: 0,
  magnified: false,
  status: 'playing',
  history: [],
});

export const judgeAction = (spec: SheetSpec, state: SessionState, action: PlayerAction): Verdict => {
  if (state.status !== 'playing') return 'ignored';
  if (action.type === 'magnify') return state.magnified ? 'ignored' : 'correct';
  const target = spec.moves[action.move];
  if (!target || action.move >= state.remaining) return 'ignored';
  const top = state.remaining - 1;
  if (action.type === 'absorb') {
    if (target.kind !== 'drop') return 'ignored';
    return action.move === top ? 'correct' : 'blot';
  }
  if (target.kind !== 'stroke') return 'ignored';
  return action.move === top && action.against ? 'correct' : 'blot';
};

export type Transition = { readonly state: SessionState; readonly verdict: Verdict };

export const applyAction = (
  spec: SheetSpec,
  state: SessionState,
  action: PlayerAction,
  at: number,
  point: SheetPoint | null = null,
): Transition => {
  const verdict = judgeAction(spec, state, action);
  if (verdict === 'ignored') return { state, verdict };
  const record: ActionRecord = { action, verdict, at, point };
  const history = [...state.history, record];
  if (action.type === 'magnify') return { state: { ...state, magnified: true, history }, verdict };
  if (verdict === 'blot') {
    const blots = state.blots + 1;
    return { state: { ...state, blots, history, status: blots >= RULES.maxBlots ? 'torn' : 'playing' }, verdict };
  }
  const remaining = state.remaining - 1;
  return { state: { ...state, remaining, history, status: remaining === 0 ? 'clean' : 'playing' }, verdict };
};

/** Rebuilds a session from a recorded log, as the server does to verify a result. */
export const replaySession = (
  spec: SheetSpec,
  log: readonly { action: PlayerAction; at: number; point: SheetPoint | null }[],
): SessionState =>
  log.reduce((state, entry) => applyAction(spec, state, entry.action, entry.at, entry.point).state, startSession(spec));
