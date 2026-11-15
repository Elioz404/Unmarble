import { EVIDENCE, SHEET } from '../config.ts';
import { pullThrough, pushThrough } from '../marbling/field.ts';
import type { FieldOp, Point, StrokeOp } from '../marbling/field-ops.ts';
import { opsForPrefix, type Move } from './moves.ts';

/**
 * Evidence is what a careful eye can read on the sheet about the order of
 * moves. A move that something fell on afterwards carries a *mark*: a drop
 * outline that is no longer round, a ring of later ink inside it, or a seam
 * that no longer runs straight. The move on top carries none.
 *
 * `strength` is the mark normalised by its human-readability threshold, so
 * 1.0 means "just readable" and 0 means "pristine". The golden rule of every
 * published sheet: at each step, the top move has strength 0 and every other
 * move has strength ≥ EVIDENCE.safetyMargin.
 */
export type MarkKind = 'none' | 'oval' | 'ring' | 'bent-seam';

export type MoveEvidence = {
  readonly move: number;
  readonly kind: Move['kind'];
  readonly mark: MarkKind;
  /** Raw measurement: ovality ratio for drops, bend in cells for seams. */
  readonly raw: number;
  readonly strength: number;
};

/** Strength reported for unmistakable marks such as a ring of later ink. */
export const UNMISTAKABLE = 99;

const TAU = Math.PI * 2;

const polygonCentroid = (points: readonly Point[]): Point => {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Point;
    const b = points[(i + 1) % points.length] as Point;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    const n = points.length || 1;
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
};

/** Out-of-roundness of a closed outline: (rmax − rmin) / (rmax + rmin). */
export const ovality = (outline: readonly Point[]): number => {
  const c = polygonCentroid(outline);
  let min = Infinity;
  let max = 0;
  for (const p of outline) {
    const r = Math.hypot(p.x - c.x, p.y - c.y);
    if (r < min) min = r;
    if (r > max) max = r;
  }
  return max + min > 0 ? (max - min) / (max + min) : 0;
};

/** Outline of drop `index` as it appears after the ops up to `prefix`. */
export const dropOutline = (ops: readonly FieldOp[], index: number, prefix: number): Point[] => {
  const op = ops[index];
  if (op?.type !== 'drop') throw new TypeError(`Op ${index} is not a drop`);
  const outline: Point[] = [];
  for (let i = 0; i < EVIDENCE.outlineSamples; i++) {
    const a = (i / EVIDENCE.outlineSamples) * TAU;
    outline.push(pushThrough(ops, index + 1, prefix, { x: op.cx + op.r * Math.cos(a), y: op.cy + op.r * Math.sin(a) }));
  }
  return outline;
};

/**
 * True when a later drop fell inside drop `index`, turning it into a ring.
 * The later drop's centre is pulled back to just before `index`'s successor
 * ops; if it lands inside the original disk, ink fell on ink.
 */
const holdsLaterInk = (ops: readonly FieldOp[], index: number, prefix: number): boolean => {
  const op = ops[index];
  if (op?.type !== 'drop') return false;
  for (let j = index + 1; j < prefix; j++) {
    const later = ops[j];
    if (later?.type !== 'drop') continue;
    const p = { x: later.cx, y: later.cy };
    if (!pullThrough(ops, index + 1, j, p)) continue;
    if (Math.hypot(p.x - op.cx, p.y - op.cy) < op.r) return true;
  }
  return false;
};

type Segment = { from: Point; to: Point };

/** Clips the infinite line of a stroke to the sheet rectangle. */
export const seamSegment = (op: StrokeOp): Segment | null => {
  // Liang–Barsky on the parametric line b + t·u.
  let t0 = -Infinity;
  let t1 = Infinity;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    return t0 <= t1;
  };
  if (
    !clip(-op.ux, op.bx) ||
    !clip(op.ux, SHEET.cols - op.bx) ||
    !clip(-op.uy, op.by) ||
    !clip(op.uy, SHEET.rows - op.by)
  ) {
    return null;
  }
  return {
    from: { x: op.bx + op.ux * t0, y: op.by + op.uy * t0 },
    to: { x: op.bx + op.ux * t1, y: op.by + op.uy * t1 },
  };
};

export const seamLength = (op: StrokeOp): number => {
  const segment = seamSegment(op);
  return segment ? Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y) : 0;
};

/** Maximum distance of points from their best-fit (total least squares) line. */
export const straightnessDeviation = (points: readonly Point[]): number => {
  const n = points.length;
  if (n < 3) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  let max = 0;
  for (const p of points) max = Math.max(max, Math.abs((p.x - mx) * nx + (p.y - my) * ny));
  return max;
};

/** The seam of stroke `index` as it appears after the ops up to `prefix`. */
export const seamPath = (ops: readonly FieldOp[], index: number, prefix: number): Point[] => {
  const op = ops[index];
  if (op?.type !== 'stroke') throw new TypeError(`Op ${index} is not a stroke`);
  const segment = seamSegment(op);
  if (!segment) return [];
  const points: Point[] = [];
  for (let i = 0; i < EVIDENCE.seamSamples; i++) {
    const t = i / (EVIDENCE.seamSamples - 1);
    const p = {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
    };
    points.push(pushThrough(ops, index + 1, prefix, p));
  }
  return points;
};

/** Evidence for every move in the first `prefix` moves of a sheet. */
export const measureEvidence = (moves: readonly Move[], prefix: number): MoveEvidence[] => {
  const ops = opsForPrefix(moves, prefix);
  return ops.map((op, index): MoveEvidence => {
    const isTop = index === prefix - 1;
    if (op.type === 'drop') {
      if (!isTop && holdsLaterInk(ops, index, prefix)) {
        return { move: index, kind: 'drop', mark: 'ring', raw: UNMISTAKABLE, strength: UNMISTAKABLE };
      }
      const raw = isTop ? 0 : ovality(dropOutline(ops, index, prefix));
      const strength = raw / EVIDENCE.dropOvality;
      return { move: index, kind: 'drop', mark: strength > 0 ? 'oval' : 'none', raw, strength };
    }
    const raw = isTop ? 0 : straightnessDeviation(seamPath(ops, index, prefix));
    const strength = raw / EVIDENCE.seamBend;
    return { move: index, kind: 'stroke', mark: strength > 0 ? 'bent-seam' : 'none', raw, strength };
  });
};
