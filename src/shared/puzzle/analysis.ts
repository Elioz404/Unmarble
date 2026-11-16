import { EVIDENCE } from '../config.ts';
import { measureEvidence, type MoveEvidence } from './evidence.ts';
import type { Move } from './moves.ts';

/**
 * Step-by-step reading of a sheet, from the finished sheet back to the bare
 * ground. Two reference players are simulated:
 *
 *  - the *rule bot* reads only evidence: it always removes the move with the
 *    weakest mark. A sheet is fair when this bot solves it without a blot and
 *    with a comfortable margin at every step.
 *  - the *naive bot* only knows "the roundest drop fell last". Sheets that
 *    claim to teach seams must defeat it at least once: every recipe but
 *    Ink Only, the declared rest day (see `recipes.ts`).
 */
export type StepReading = {
  /** Number of moves still on the sheet at this step. */
  readonly prefix: number;
  /** Index of the move on top. */
  readonly top: number;
  readonly evidence: readonly MoveEvidence[];
  /** Weakest mark among covered moves (Infinity when only one move is left). */
  readonly weakestCover: number;
  /** What the naive bot would pick, or null if no drop is left. */
  readonly naivePick: number | null;
};

export type SheetReading = {
  readonly steps: readonly StepReading[];
  /** The weakest covered mark across all steps: the sheet's fairness margin. */
  readonly margin: number;
  readonly fair: boolean;
  /** Steps at which the naive bot picks the wrong move. */
  readonly naiveFailures: number;
};

const readStep = (moves: readonly Move[], prefix: number): StepReading => {
  const evidence = measureEvidence(moves, prefix);
  const top = prefix - 1;
  let weakestCover = Infinity;
  for (const e of evidence) if (e.move !== top) weakestCover = Math.min(weakestCover, e.strength);
  let naivePick: number | null = null;
  let roundest = Infinity;
  for (const e of evidence) {
    if (e.kind === 'drop' && e.strength < roundest) {
      roundest = e.strength;
      naivePick = e.move;
    }
  }
  return { prefix, top, evidence, weakestCover, naivePick };
};

export const readSheet = (moves: readonly Move[]): SheetReading => {
  const steps: StepReading[] = [];
  for (let prefix = moves.length; prefix >= 1; prefix--) steps.push(readStep(moves, prefix));
  const margin = steps.reduce((m, s) => Math.min(m, s.weakestCover), Infinity);
  const naiveFailures = steps.filter((s) => s.naivePick !== s.top).length;
  return { steps, margin, fair: margin >= EVIDENCE.safetyMargin, naiveFailures };
};
