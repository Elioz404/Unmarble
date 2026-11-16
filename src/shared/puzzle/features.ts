import { EVIDENCE, GENERATION, SHEET } from '../config.ts';
import { pullThrough } from '../marbling/field.ts';
import type { FieldOp, Point, StrokeOp } from '../marbling/field-ops.ts';
import { groundPhase, type Ground } from '../sheet/ground.ts';
import type { SheetReading } from './analysis.ts';
import { seamSegment } from './evidence.ts';
import { dropRadius, opsForPrefix, strokeOp, type Move, type StrokeMove } from './moves.ts';
import type { Feature } from './templates.ts';

/**
 * Detectors for the design features a template asks for. Each detector reads
 * the sheet the way a player would experience it, so "the template promised a
 * crescent" is a checked fact, not a hope.
 */

const isStroke = (move: Move): move is StrokeMove => move.kind === 'stroke';

/** Stripe phase of the bath under `ops`, or null where the point shows ink. */
const phaseUnder = (ops: readonly FieldOp[], ground: Ground, p: Point): number | null => {
  const q = { ...p };
  return pullThrough(ops, 0, ops.length, q) ? groundPhase(ground, q.x, q.y) : null;
};

/**
 * Share of a stroke's seam where it cuts the (already deformed) stripes at a
 * steep angle. Shallow cuts leave no readable kink.
 */
export const steepCrossingShare = (moves: readonly Move[], ground: Ground, index: number): number => {
  const move = moves[index];
  if (!move || !isStroke(move)) return 0;
  const op = strokeOp(move, index);
  const segment = seamSegment(op);
  if (!segment) return 0;
  const before = opsForPrefix(moves, index);
  const minSin = Math.sin((EVIDENCE.minCrossingAngle * Math.PI) / 180);
  const h = 1e-3;
  let steep = 0;
  let measured = 0;
  const samples = 24;
  for (let i = 0; i < samples; i++) {
    const t = (i + 0.5) / samples;
    const p = { x: segment.from.x + (segment.to.x - segment.from.x) * t, y: segment.from.y + (segment.to.y - segment.from.y) * t };
    const c = phaseUnder(before, ground, p);
    const px = phaseUnder(before, ground, { x: p.x + h, y: p.y });
    const py = phaseUnder(before, ground, { x: p.x, y: p.y + h });
    if (c === null || px === null || py === null) continue;
    const gx = (px - c) / h;
    const gy = (py - c) / h;
    const g = Math.hypot(gx, gy);
    if (g < 1e-9) continue;
    measured++;
    // The stroke crosses stripes steeply when it runs along the phase gradient.
    const sinCross = Math.abs(op.ux * gx + op.uy * gy) / g;
    if (sinCross >= minSin) steep++;
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

const hasTwinInks = (moves: readonly Move[]): boolean => {
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

const hasDecoy = (reading: SheetReading, minMargin: number): boolean =>
  reading.steps.some((step) => {
    const top = step.evidence[step.top];
    if (top?.kind !== 'stroke') return false;
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
  switch (feature) {
    case 'buried-seam':
      return moves.some((m, i) => isStroke(m) && i > 0 && i < last);
    case 'top-seam':
      return !!moves[last] && isStroke(moves[last]);
    case 'crossed-seams': {
      const strokes = moves.map((m, i) => (isStroke(m) ? strokeOp(m, i) : null)).filter((op) => op !== null);
      return strokes.some((a, i) => strokes.slice(i + 1).some((b) => segmentsCross(a, b)));
    }
    case 'crescent':
      return hasCrescent(reading);
    case 'decoy':
      return hasDecoy(reading, minMargin);
    case 'twin-inks':
      return hasTwinInks(moves);
  }
};
