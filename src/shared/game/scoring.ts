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

/** What a shared result says about its sheet, beyond the marks. */
export type ShareHeading = {
  /** "No.12 · Saturday", or "· a trap by u/someone". */
  readonly heading: string;
  /** What the sheet goes by: its community name in quotes, else its recipe's title; null for neither. */
  readonly title: string | null;
  readonly stars: number;
  /** The subreddit it is played in, or null outside Reddit. */
  readonly community: string | null;
};

/** Earned by a clean sheet with no tear and no Lens, and said so in the share line. */
export const CLEAN_SEAL = '⛨ clean, no Lens';

/**
 * Spoiler-free text a player can paste in a comment, in three lines: the
 * sheet, one mark per action, then the outcome, the time and where it is
 * played. Marks only, never the kinds of moves.
 */
export const shareLine = (sheet: ShareHeading, state: SessionState): string => {
  const marks = marksOf(state);
  const result = resultOf(state);
  const seconds = Math.round(result.durationMs / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const outcome = !result.clean
    ? 'torn'
    : isPerfect(result)
      ? CLEAN_SEAL
      : result.blots === 0
        ? 'clean'
        : `${result.blots} tear${result.blots > 1 ? 's' : ''}`;
  const lens = result.magnified ? ' ◐' : '';
  const head = [`UNMARBLE ${sheet.heading} ${'★'.repeat(sheet.stars)}`, sheet.title].filter(Boolean).join(' · ');
  const foot = [outcome, time, sheet.community ? `r/${sheet.community}` : null].filter(Boolean).join(' · ');
  return [head, `${marks}${lens}`, foot].join('\n');
};
