import { EVIDENCE, GENERATION, SHEET, VISIBILITY } from '../config.ts';
import { pullThrough } from '../marbling/field.ts';
import type { Ground } from '../sheet/ground.ts';
import { readSheet } from './analysis.ts';
import { seamLength } from './evidence.ts';
import { steepCrossingShare } from './features.ts';
import { firstAmbiguousGesture } from './gesture-contract.ts';
import { dropRadius, opsForPrefix, strokeOp, type Move } from './moves.ts';
import { measureVisibility } from './visibility.ts';

/**
 * The sheet contract as a diagnosis: the first thing that would make a sheet
 * unfair or unreadable, and which move causes it. The generator only asks
 * "is it fine?"; the trap editor shows the answer to the player, so every
 * problem names a move and has a plain-language reading in the UI.
 */
export type Diagnosis =
  /** A drop or swirl sits too close to the edge of the paper. */
  | { readonly kind: 'off-sheet'; readonly move: number }
  /** A later drop fell inside an earlier drop of the same ink: the two read as one blob. */
  | { readonly kind: 'merged-ink'; readonly move: number }
  /** A fold only clips a corner, so its seam is too short to read or swipe. */
  | { readonly kind: 'short-fold'; readonly move: number }
  /** A fold runs along the stripes, so it leaves no readable kink. */
  | { readonly kind: 'shallow-fold'; readonly move: number }
  /** A move leaves no readable trace of being under the next ones. */
  | { readonly kind: 'hidden-order'; readonly move: number }
  /** A drop gets pushed off the paper or squeezed too thin to tap. */
  | { readonly kind: 'faint-ink'; readonly move: number }
  /** When this move is on top, undoing it could be mistaken for another. */
  | { readonly kind: 'ambiguous-gesture'; readonly move: number };

const offSheet = (moves: readonly Move[]): number => {
  return moves.findIndex((move) => {
    const margin =
      move.kind === 'drop'
        ? dropRadius(move.size) + VISIBILITY.dropEdgeMargin
        : move.kind === 'swirl'
          ? GENERATION.swirlEdgeMargin
          : 0;
    return move.x < margin || move.x > SHEET.cols - margin || move.y < margin || move.y > SHEET.rows - margin;
  });
};

/** The first drop that landed inside an earlier drop of its own ink, or -1. */
const mergedInk = (moves: readonly Move[]): number => {
  const ops = opsForPrefix(moves, moves.length);
  for (let j = 1; j < moves.length; j++) {
    const later = moves[j];
    if (later?.kind !== 'drop') continue;
    for (let i = 0; i < j; i++) {
      const earlier = ops[i];
      if (earlier?.type !== 'drop' || earlier.ink !== later.ink) continue;
      // Where the later drop's centre was, on the bath just after the earlier drop fell.
      const p = { x: later.x, y: later.y };
      if (!pullThrough(ops, i + 1, j, p)) continue;
      if (Math.hypot(p.x - earlier.cx, p.y - earlier.cy) < earlier.r) return j;
    }
  }
  return -1;
};

/** The first readability problem of a sheet, or null if it is readable at every step. */
export const diagnoseReadability = (moves: readonly Move[], ground: Ground): Diagnosis | null => {
  const outside = offSheet(moves);
  if (outside >= 0) return { kind: 'off-sheet', move: outside };
  const merged = mergedInk(moves);
  if (merged >= 0) return { kind: 'merged-ink', move: merged };
  const short = moves.findIndex(
    (move, index) => move.kind === 'stroke' && seamLength(strokeOp(move, index)) < EVIDENCE.minSeamLength,
  );
  if (short >= 0) return { kind: 'short-fold', move: short };
  const shallow = moves.findIndex(
    (move, index) =>
      move.kind === 'stroke' && steepCrossingShare(moves, ground, index) < EVIDENCE.minSteepCrossingShare,
  );
  if (shallow >= 0) return { kind: 'shallow-fold', move: shallow };
  for (let prefix = moves.length; prefix >= 1; prefix--) {
    const faint = measureVisibility(moves, prefix).inks.find(
      (ink) => ink.visibleShare < VISIBILITY.minVisibleInk || !ink.tappable,
    );
    if (faint) return { kind: 'faint-ink', move: faint.move };
  }
  const ambiguous = firstAmbiguousGesture(moves);
  return ambiguous === null ? null : { kind: 'ambiguous-gesture', move: ambiguous };
};

/**
 * The first fairness problem: at some step a covered move's mark is weaker
 * than `minMargin`, so its order can't be read. Names the faintest such move.
 */
export const diagnoseFairness = (moves: readonly Move[], minMargin: number): Diagnosis | null => {
  for (const step of readSheet(moves).steps) {
    let weakest: { move: number; strength: number } | null = null;
    for (const evidence of step.evidence) {
      if (evidence.move === step.top) continue;
      if (!weakest || evidence.strength < weakest.strength) weakest = { move: evidence.move, strength: evidence.strength };
    }
    if (weakest && weakest.strength < minMargin) return { kind: 'hidden-order', move: weakest.move };
  }
  return null;
};
