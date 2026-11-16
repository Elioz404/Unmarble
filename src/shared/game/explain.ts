import { measureEvidence, type MarkKind } from '../puzzle/evidence.ts';
import type { MoveKind } from '../puzzle/moves.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import type { PlayerAction } from './session.ts';

/**
 * Why a blot was a blot, in terms the sheet itself can show: which later move
 * left its mark on the one the player chose. The UI outlines that culprit, so
 * every mistake teaches the reading instead of just costing a life.
 */
export type BlotReason =
  /** The chosen drop was pushed out of round by a later move. */
  | 'bent'
  /** Later ink fell inside the chosen drop. */
  | 'ring'
  /** The chosen seam was bent by a later move. */
  | 'seam-bent'
  /** Right seam, wrong way: strokes are undone against their direction. */
  | 'with-the-grain'
  /** The chosen swirl's eye was disturbed by a later move. */
  | 'eye-bent'
  /** Right swirl, wrong way: swirls are undone against their turn. */
  | 'with-the-turn';

export type BlotExplanation = {
  readonly reason: BlotReason;
  /** The later move whose mark gave the order away, if any. */
  readonly culprit: number | null;
};

const reasonOf = (mark: MarkKind, kind: MoveKind): BlotReason => {
  if (kind === 'stroke') return 'seam-bent';
  if (kind === 'swirl') return 'eye-bent';
  return mark === 'ring' ? 'ring' : 'bent';
};

export const explainBlot = (spec: SheetSpec, remaining: number, action: PlayerAction): BlotExplanation | null => {
  if (action.type === 'magnify') return null;
  const top = remaining - 1;
  if (action.type === 'unstroke' && action.move === top) return { reason: 'with-the-grain', culprit: null };
  if (action.type === 'unswirl' && action.move === top) return { reason: 'with-the-turn', culprit: null };
  const chosen = action.move;
  const chosenMove = spec.moves[chosen];
  if (!chosenMove || chosen >= top) return null;
  // The earliest later move that already left a readable mark on the chosen one.
  for (let prefix = chosen + 2; prefix <= remaining; prefix++) {
    const evidence = measureEvidence(spec.moves, prefix)[chosen];
    if (evidence && evidence.strength >= 1) {
      return { reason: reasonOf(evidence.mark, chosenMove.kind), culprit: prefix - 1 };
    }
  }
  const final = measureEvidence(spec.moves, remaining)[chosen];
  return { reason: reasonOf(final?.mark ?? 'oval', chosenMove.kind), culprit: top };
};
