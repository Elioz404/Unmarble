import { EVIDENCE, GENERATION, SHEET } from '../config.ts';
import { pullThrough } from '../marbling/field.ts';
import type { FieldOp, Point, StrokeOp } from '../marbling/field-ops.ts';
import { groundCrossPhase, groundPhase, type Ground } from '../sheet/ground.ts';
import type { SheetReading } from './analysis.ts';
import { seamSegment } from './evidence.ts';
import { dropRadius, opsForPrefix, strokeOp, type Move, type MoveKind, type StrokeMove, type SwirlMove } from './moves.ts';

/**
 * Detectors for the design features a recipe asks for (or forbids). Each
 * detector reads the sheet the way a player would experience it, so "the
 * recipe promised a crescent" is a checked fact, not a hope. `L` below is the
 * index of the top move.
 */
export type Feature =
  /** A stroke sits under other moves, not on top or at the bottom. */
  | 'buried-seam'
  /** A drop is squeezed into a crescent by a later neighbour. */
  | 'crescent'
  /** Two seams cross inside the sheet. */
  | 'crossed-seams'
  /** The finished sheet has a stroke on top. */
  | 'top-seam'
  /** With a stroke on top, a covered drop still reads nearly round. */
  | 'decoy'
  /** Two touching drops share an ink: their two centres must be read. */
  | 'twin-inks'
  /** The finished sheet has a swirl on top. */
  | 'top-swirl'
  /** The finished sheet has a drop on top: the roundest one. */
  | 'top-drop'
  /** A stroke at mid depth: neither the second move nor the top one. */
  | 'mid-seam'
  /** The second move is a stroke: an early fold, bent by everything after it. */
  | 'deep-seam'
  /** The last two moves are both strokes. */
  | 'fold-pair'
  /** A stroke on top, a drop or swirl under it, and an older stroke deeper down. */
  | 'split-folds'
  /** At least two strokes under the top move. */
  | 'two-buried-seams'
  /** A swirl lies under a later move. */
  | 'buried-swirl'
  /** With a swirl on top, a covered drop still reads nearly round. */
  | 'swirl-decoy'
  /** At least two swirls. */
  | 'twin-swirls'
  /** Two swirls turning opposite ways. */
  | 'opposite-swirls'
  /** Every move is a drop. */
  | 'ink-only'
  /** The ink fell first (at least two drops), then only strokes. */
  | 'folds-only';

/** Every feature, for checks that a catalogue only names features the detectors know. */
export const FEATURES: readonly Feature[] = [
  'buried-seam',
  'crescent',
  'crossed-seams',
  'top-seam',
  'decoy',
  'twin-inks',
  'top-swirl',
  'top-drop',
  'mid-seam',
  'deep-seam',
  'fold-pair',
  'split-folds',
  'two-buried-seams',
  'buried-swirl',
  'swirl-decoy',
  'twin-swirls',
  'opposite-swirls',
  'ink-only',
  'folds-only',
];

/** Folds Only needs this many drops before its folds, so each fold has ink to bend. */
const FOLDS_ONLY_MIN_DROPS = 2;

const isStroke = (move: Move | undefined): move is StrokeMove => move?.kind === 'stroke';

const isSwirl = (move: Move): move is SwirlMove => move.kind === 'swirl';

type PhaseField = (ground: Ground, x: number, y: number) => number | null;

/** Every ruling a ground carries: its stripes, plus a grid's crossing lines. */
const PHASE_FIELDS: readonly PhaseField[] = [groundPhase, groundCrossPhase];

/** A ruling's phase under `ops`, or null where the point shows ink or the ruling is absent. */
const phaseUnder = (ops: readonly FieldOp[], ground: Ground, field: PhaseField, p: Point): number | null => {
  const q = { ...p };
  return pullThrough(ops, 0, ops.length, q) ? field(ground, q.x, q.y) : null;
};

/** Sine of the angle at which a direction cuts a ruling at `p`, or null if unmeasurable there. */
const crossingSine = (
  ops: readonly FieldOp[],
  ground: Ground,
  field: PhaseField,
  p: Point,
  ux: number,
  uy: number,
): number | null => {
  const h = 1e-3;
  const c = phaseUnder(ops, ground, field, p);
  const px = phaseUnder(ops, ground, field, { x: p.x + h, y: p.y });
  const py = phaseUnder(ops, ground, field, { x: p.x, y: p.y + h });
  if (c === null || px === null || py === null) return null;
  const gx = (px - c) / h;
  const gy = (py - c) / h;
  const g = Math.hypot(gx, gy);
  // A direction crosses a ruling steeply when it runs along the phase gradient.
  return g < 1e-9 ? null : Math.abs(ux * gx + uy * gy) / g;
};

/**
 * Share of a stroke's seam where it cuts the (already deformed) ruling at a
 * steep angle. Shallow cuts leave no readable kink. On a grid, steep against
 * either set of lines is enough.
 */
export const steepCrossingShare = (moves: readonly Move[], ground: Ground, index: number): number => {
  const move = moves[index];
  if (!move || !isStroke(move)) return 0;
  const op = strokeOp(move, index);
  const segment = seamSegment(op);
  if (!segment) return 0;
  const before = opsForPrefix(moves, index);
  const minSin = Math.sin((EVIDENCE.minCrossingAngle * Math.PI) / 180);
  let steep = 0;
  let measured = 0;
  const samples = 24;
  for (let i = 0; i < samples; i++) {
    const t = (i + 0.5) / samples;
    const p = { x: segment.from.x + (segment.to.x - segment.from.x) * t, y: segment.from.y + (segment.to.y - segment.from.y) * t };
    const sines = PHASE_FIELDS.map((field) => crossingSine(before, ground, field, p, op.ux, op.uy)).filter(
      (v) => v !== null,
    );
    if (sines.length === 0) continue;
    measured++;
    if (Math.max(...sines) >= minSin) steep++;
  }
  return measured === 0 ? 0 : steep / measured;
};

const segmentsCross = (a: StrokeOp, b: StrokeOp): boolean => {
  const sa = seamSegment(a);
  const sb = seamSegment(b);
  if (!sa || !sb) return false;
  const d1x = sa.to.x - sa.from.x;
  const d1y = sa.to.y - sa.from.y;
  const d2x = sb.to.x - sb.from.x;
  const d2y = sb.to.y - sb.from.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((sb.from.x - sa.from.x) * d2y - (sb.from.y - sa.from.y) * d2x) / denom;
  const u = ((sb.from.x - sa.from.x) * d1y - (sb.from.y - sa.from.y) * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return false;
  const x = sa.from.x + d1x * t;
  const y = sa.from.y + d1y * t;
  const inset = GENERATION.crossingInset;
  return x >= inset && x <= SHEET.cols - inset && y >= inset && y <= SHEET.rows - inset;
};

/** Whether two touching drops of one ink sit side by side (not one inside the other). */
export const hasTwinInks = (moves: readonly Move[]): boolean => {
  const ops = opsForPrefix(moves, moves.length);
  for (let j = 1; j < moves.length; j++) {
    const later = moves[j];
    if (later?.kind !== 'drop') continue;
    for (let i = 0; i < j; i++) {
      const earlier = moves[i];
      if (earlier?.kind !== 'drop' || earlier.ink !== later.ink) continue;
      const p = { x: later.x, y: later.y };
      if (!pullThrough(ops, i + 1, j, p)) continue;
      const separation = Math.hypot(p.x - earlier.x, p.y - earlier.y);
      // Twins touch side by side: the later centre lies outside the earlier disk.
      const nested = separation < dropRadius(earlier.size);
      const gap = separation - dropRadius(earlier.size) - dropRadius(later.size);
      if (!nested && gap <= GENERATION.twinGap) return true;
    }
  }
  return false;
};

/** Whether some drop of the finished sheet is squeezed into a pronounced crescent. */
const hasCrescent = (reading: SheetReading): boolean => {
  const full = reading.steps[0];
  return !!full?.evidence.some(
    (e) => e.kind === 'drop' && e.mark === 'oval' && e.strength >= GENERATION.crescentStrength,
  );
};

/** Some step has `topKind` on top while a covered drop still reads nearly round. */
const hasDecoy = (reading: SheetReading, minMargin: number, topKind: MoveKind): boolean =>
  reading.steps.some((step) => {
    const top = step.evidence[step.top];
    if (top?.kind !== topKind) return false;
    return step.evidence.some(
      (e) => e.move !== step.top && e.kind === 'drop' && e.strength >= minMargin && e.strength <= GENERATION.decoyCeiling,
    );
  });

export const hasFeature = (
  feature: Feature,
  moves: readonly Move[],
  reading: SheetReading,
  minMargin: number,
): boolean => {
  const last = moves.length - 1;
  const strokeAt = (i: number) => isStroke(moves[i]);
  const strokesWithin = (from: number, to: number) => moves.filter((m, i) => isStroke(m) && i >= from && i <= to).length;
  switch (feature) {
    case 'buried-seam':
      return strokesWithin(1, last - 1) > 0;
    case 'top-seam':
      return strokeAt(last);
    case 'crossed-seams': {
      const strokes = moves.map((m, i) => (isStroke(m) ? strokeOp(m, i) : null)).filter((op) => op !== null);
      return strokes.some((a, i) => strokes.slice(i + 1).some((b) => segmentsCross(a, b)));
    }
    case 'crescent':
      return hasCrescent(reading);
    case 'decoy':
      return hasDecoy(reading, minMargin, 'stroke');
    case 'twin-inks':
      return hasTwinInks(moves);
    case 'top-swirl':
      return moves[last]?.kind === 'swirl';
    case 'top-drop':
      return moves[last]?.kind === 'drop';
    case 'mid-seam':
      return strokesWithin(2, last - 1) > 0;
    case 'deep-seam':
      return strokeAt(1);
    case 'fold-pair':
      return strokeAt(last) && strokeAt(last - 1);
    case 'split-folds':
      return strokeAt(last) && !strokeAt(last - 1) && strokesWithin(1, last - 2) > 0;
    case 'two-buried-seams':
      return strokesWithin(1, last - 1) >= 2;
    case 'buried-swirl':
      return moves.some((m, i) => isSwirl(m) && i < last);
    case 'swirl-decoy':
      return hasDecoy(reading, minMargin, 'swirl');
    case 'twin-swirls':
      return moves.filter(isSwirl).length >= 2;
    case 'opposite-swirls': {
      const swirls = moves.filter(isSwirl);
      return swirls.length >= 2 && swirls.some((a) => swirls.some((b) => a.turn !== b.turn));
    }
    case 'ink-only':
      return moves.every((m) => m.kind === 'drop');
    case 'folds-only': {
      const firstFold = moves.findIndex((m) => m.kind !== 'drop');
      return firstFold >= FOLDS_ONLY_MIN_DROPS && moves.slice(firstFold).every((m) => isStroke(m));
    }
  }
};

/** What a sheet must show and must not show; a recipe's identity, checked on the reading. */
export type Signature = {
  readonly features: readonly Feature[];
  readonly forbid?: readonly Feature[];
  readonly minMargin: number;
};

/** Whether a sheet has every required feature of `signature` and none of its forbidden ones. */
export const matchesSignature = (signature: Signature, moves: readonly Move[], reading: SheetReading): boolean =>
  signature.features.every((f) => hasFeature(f, moves, reading, signature.minMargin)) &&
  !(signature.forbid ?? []).some((f) => hasFeature(f, moves, reading, signature.minMargin));
