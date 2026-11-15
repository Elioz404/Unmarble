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

/** Spoiler-free text a player can paste in a comment: one mark per action. */
export const shareLine = (sheetNumber: number, weekdayTitle: string, stars: number, state: SessionState): string => {
  const marks = state.history
    .filter((h) => h.action.type !== 'magnify')
    .map((h) => (h.verdict === 'correct' ? '●' : '○'))
    .join('');
  const result = resultOf(state);
  const seconds = Math.round(result.durationMs / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const outcome = result.clean ? (result.blots === 0 ? 'clean' : `${result.blots} blot${result.blots > 1 ? 's' : ''}`) : 'torn';
  const lens = result.magnified ? ' ◐' : '';
  return `UNMARBLE No.${sheetNumber} · ${weekdayTitle} ${'★'.repeat(stars)}\n${marks}${lens}\n${outcome} · ${time}`;
};
