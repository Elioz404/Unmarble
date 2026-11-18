import { readSheet, type StepReading } from '../puzzle/analysis.ts';
import type { MoveKind } from '../puzzle/moves.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import { applyAction, startSession, type PlayerAction, type SessionState, type Verdict } from './session.ts';

/**
 * The Apprentice: the house reader, a bot that only trusts "the roundest drop
 * fell last" (the naive reader of `analysis.ts`). It plays every sheet through
 * the same reducer as a player, so its marks mean exactly what a player's do.
 * It is never a hand: it is computed on the device, never sent, and never
 * counted in hands, ranks, scars or stats.
 *
 * At each step it absorbs the roundest drop left. When that is not the top
 * move, the paper tears, and the sheet shows it which move gave the order
 * away (as it shows a player), so it then undoes the real top move. With no
 * drop left to trust, it drags the top move with its grain: it cannot read
 * folds or swirls. It keeps no time.
 */

/** One misreading by the Apprentice. */
export type ApprenticeTear = {
  /** The undo it was attempting, counted from 1 (the first move undone). */
  readonly step: number;
  /** The move it fell for: the roundest drop, or the top move itself when no drop was left. */
  readonly fellFor: number;
  /** The move that really was on top, and its form. */
  readonly missed: number;
  readonly missedKind: MoveKind;
};

export type ApprenticeRun = {
  /** Its finished attempt, through the shared reducer: `clean` or `torn`. */
  readonly state: SessionState;
  /** Its tears, in order; at most `RULES.maxBlots`, since the sheet gives way then. */
  readonly tears: readonly ApprenticeTear[];
};

const kindOf = (spec: SheetSpec, move: number): MoveKind => {
  const found = spec.moves[move];
  if (!found) throw new Error(`No move ${move} on the sheet`);
  return found.kind;
};

/** The action that undoes the top move. */
const undoTop = (spec: SheetSpec, top: number): PlayerAction => {
  switch (kindOf(spec, top)) {
    case 'drop':
      return { type: 'absorb', move: top };
    case 'stroke':
      return { type: 'unstroke', move: top, against: true };
    case 'swirl':
      return { type: 'unswirl', move: top, against: true };
  }
};

/** What the Apprentice does when the roundest drop is not on top. */
const misread = (spec: SheetSpec, step: StepReading): PlayerAction => {
  if (step.naivePick !== null) return { type: 'absorb', move: step.naivePick };
  switch (kindOf(spec, step.top)) {
    case 'stroke':
      return { type: 'unstroke', move: step.top, against: false };
    case 'swirl':
      return { type: 'unswirl', move: step.top, against: false };
    case 'drop':
      throw new Error(`Drop ${step.top} is on top, yet the Apprentice saw no drop`);
  }
};

const act = (spec: SheetSpec, state: SessionState, action: PlayerAction, expected: Verdict): SessionState => {
  const transition = applyAction(spec, state, action, 0);
  if (transition.verdict !== expected) throw new Error(`The Apprentice expected a ${expected}, got a ${transition.verdict}`);
  return transition.state;
};

export const apprenticeRun = (spec: SheetSpec): ApprenticeRun => {
  const { steps } = readSheet(spec.moves);
  const tears: ApprenticeTear[] = [];
  let state = startSession(spec);
  while (state.status === 'playing') {
    const reading = steps[state.total - state.remaining];
    if (!reading) throw new Error(`No reading for ${state.remaining} moves`);
    if (reading.naivePick !== reading.top) {
      state = act(spec, state, misread(spec, reading), 'blot');
      tears.push({
        step: state.total - state.remaining + 1,
        fellFor: reading.naivePick ?? reading.top,
        missed: reading.top,
        missedKind: kindOf(spec, reading.top),
      });
      if (state.status !== 'playing') break;
    }
    state = act(spec, state, undoTop(spec, reading.top), 'correct');
  }
  return { state, tears };
};

/** The undo steps (counted from 1) at which an attempt tore the paper, and how far it got. */
const stepsOf = (state: SessionState): { readonly torn: ReadonlySet<number>; readonly reached: number } => {
  const torn = new Set<number>();
  let undone = 0;
  for (const record of state.history) {
    if (record.action.type === 'magnify') continue;
    if (record.verdict === 'blot') torn.add(undone + 1);
    else undone++;
  }
  return { torn, reached: state.status === 'clean' ? undone : undone + 1 };
};

/**
 * A finished player against the Apprentice, about one of its tears: the
 * first one the player read cleanly, else the first one both fell for, else
 * its first tear (where the player's sheet had already given way).
 */
export type ApprenticeComparison =
  | { readonly kind: 'unfooled' }
  | { readonly kind: 'outread'; readonly tear: ApprenticeTear }
  | { readonly kind: 'both-tore'; readonly tear: ApprenticeTear }
  | { readonly kind: 'unreached'; readonly tear: ApprenticeTear };

export const compareWithApprentice = (player: SessionState, run: ApprenticeRun): ApprenticeComparison => {
  const first = run.tears[0];
  if (!first) return { kind: 'unfooled' };
  const { torn, reached } = stepsOf(player);
  const met = run.tears.filter((tear) => tear.step <= reached);
  const outread = met.find((tear) => !torn.has(tear.step));
  if (outread) return { kind: 'outread', tear: outread };
  const shared = met[0];
  if (shared) return { kind: 'both-tore', tear: shared };
  return { kind: 'unreached', tear: first };
};
