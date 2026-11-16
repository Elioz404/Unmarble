import { EVIDENCE } from '../config.ts';
import type { Ground } from '../sheet/ground.ts';
import { readSheet } from './analysis.ts';
import { diagnoseFairness, diagnoseReadability, type Diagnosis } from './contract.ts';
import type { Move } from './moves.ts';
import type { Stars } from './sheet.ts';

/**
 * Traps: sheets made by players for each other ("set a trap"). A trap uses
 * the day's paper (palette and ground) and must pass the same contract as a
 * daily sheet, so a trap can be devious but never unfair. Checked live in the
 * editor and again on the server, which never trusts the client.
 */
export const TRAP_RULES = Object.freeze({
  minMoves: 3,
  maxMoves: 7,
  /** Traps may be subtle, but every mark must still clear the human threshold. */
  minMargin: EVIDENCE.safetyMargin,
  /** Margin at or above which a trap is easy to read (it loses a star). */
  plainMargin: 2.5,
});

export type TrapProblem =
  | Diagnosis
  | { readonly kind: 'too-few' }
  | { readonly kind: 'too-many' }
  /** The first move must be a drop: bare water has nothing to fold or turn. */
  | { readonly kind: 'starts-bare' };

export type TrapCheck = {
  readonly problem: TrapProblem | null;
  /** Difficulty, from how many moves there are and how faint the faintest mark is. */
  readonly stars: Stars;
};

const clampStars = (value: number): Stars => {
  const rounded = Math.round(Math.min(5, Math.max(1, value)));
  return rounded === 1 || rounded === 2 || rounded === 3 || rounded === 4 ? rounded : 5;
};

export const checkTrap = (moves: readonly Move[], ground: Ground): TrapCheck => {
  if (moves.length > TRAP_RULES.maxMoves) return { problem: { kind: 'too-many' }, stars: 5 };
  if (moves.length > 0 && moves[0]?.kind !== 'drop') return { problem: { kind: 'starts-bare' }, stars: 1 };
  const problem = diagnoseReadability(moves, ground) ?? diagnoseFairness(moves, TRAP_RULES.minMargin);
  const margin = moves.length > 1 ? readSheet(moves).margin : Infinity;
  const stars = clampStars(moves.length - 2 + (margin < TRAP_RULES.plainMargin ? 1 : 0));
  if (problem) return { problem, stars };
  return { problem: moves.length < TRAP_RULES.minMoves ? { kind: 'too-few' } : null, stars };
};
