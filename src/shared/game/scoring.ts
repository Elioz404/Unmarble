import type { SessionState } from './session.ts';

/**
 * Results and their ordering. Priority: a clean sheet beats a torn one; then
 * fewer blots; then no magnifier; time only breaks ties.
 */
export type Result = {
  readonly clean: boolean;
  readonly blots: number;
  readonly magnified: boolean;
  readonly durationMs: number;
  readonly moves: number;
};

export const resultOf = (state: SessionState): Result => {
  const last = state.history[state.history.length - 1];
  return {
    clean: state.status === 'clean',
    blots: state.blots,
    magnified: state.magnified,
    durationMs: last?.at ?? 0,
    moves: state.total,
  };
};

/** A perfect sheet: clean, no blots, no magnifier. */
export const isPerfect = (result: Result): boolean => result.clean && result.blots === 0 && !result.magnified;

const DURATION_CAP_DS = 9_999_999;

/**
 * A single number that sorts results (lower is better), suitable for a Redis
 * sorted set. Layout: [torn][blots][magnifier][deciseconds].
 */
export const rankScore = (result: Result): number =>
  (result.clean ? 0 : 1) * 1e10 +
  Math.min(result.blots, 9) * 1e9 +
  (result.magnified ? 1 : 0) * 1e8 +
  Math.min(Math.round(result.durationMs / 100), DURATION_CAP_DS);

/** One mark per action, the Lens aside: ● an undo, ○ a tear. */
export const marksOf = (state: SessionState): string =>
  state.history
    .filter((h) => h.action.type !== 'magnify')
    .map((h) => (h.verdict === 'correct' ? '●' : '○'))
    .join('');
