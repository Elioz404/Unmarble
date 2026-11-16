/**
 * Physical operations on the marbling bath and their exact maps.
 *
 * Based on the closed-form marbling transforms of Lu, Jaffer et al.
 * ("Mathematical Marbling", IEEE CG&A 2012):
 *
 *   drop at c, radius r:   p ↦ c + (p − c)·√(1 + r²/|p − c|²)
 *   stroke through b, direction u, normal n, shift α, fall-off λ:
 *                           p ↦ p + u·αλ / (|(p − b)·n| + λ)
 *   swirl at c, turn τ, fall-off λ (a vortex):
 *                           p ↦ c + R(τλ / (|p − c| + λ))·(p − c)
 *
 * All three maps are bijections of the bath (outside the new ink), so every state
 * can be rendered exactly by pulling a screen point back through the ops, and
 * undoing the top op restores the previous state exactly.
 *
 * Coordinates are in sheet cells. Hot paths avoid allocation: callers pass a
 * mutable `Point` scratch object.
 */

export type Point = { x: number; y: number };

/** A drop of ink. Inside its disk the bath shows `ink`. */
export type DropOp = {
  readonly type: 'drop';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly ink: number;
  /** Identity of the puzzle move this op renders (for hit-testing). */
  readonly source: number;
};

/**
 * A single stylus stroke. `shift` is signed: a negative shift is the exact
 * inverse of the same stroke with a positive shift.
 */
export type StrokeOp = {
  readonly type: 'stroke';
  readonly bx: number;
  readonly by: number;
  /** Unit direction of travel. */
  readonly ux: number;
  readonly uy: number;
  readonly shift: number;
  readonly falloff: number;
  readonly source: number;
};

/**
 * Suction: the inverse of a drop applied on top of the bath. Drawing ink back
 * into the water at the wrong place destroys whatever sits inside the disk.
 */
export type SuctionOp = {
  readonly type: 'suction';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly source: number;
};

/**
 * A swirl: the water turns around an eye, fastest at the centre. `turn` is
 * the signed rotation (radians) at the eye; distance to the eye is invariant,
 * so the same swirl with negative turn is its exact inverse.
 */
export type SwirlOp = {
  readonly type: 'swirl';
  readonly cx: number;
  readonly cy: number;
  readonly turn: number;
  readonly falloff: number;
  readonly source: number;
};

export type FieldOp = DropOp | StrokeOp | SuctionOp | SwirlOp;

const EPSILON = 1e-9;

/** Applies the forward map of a drop to `p` in place. */
export const pushDrop = (cx: number, cy: number, r: number, p: Point): void => {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const l2 = dx * dx + dy * dy;
  if (l2 < EPSILON) {
    // The exact centre is pushed to the rim; any direction is valid.
    p.x = cx + r;
    p.y = cy;
    return;
  }
  const k = Math.sqrt(1 + (r * r) / l2);
  p.x = cx + dx * k;
  p.y = cy + dy * k;
};

/**
 * Pulls `p` back through a drop. Returns false when `p` lies inside the new
 * ink (it has no pre-image in the bath).
 */
export const pullDrop = (cx: number, cy: number, r: number, p: Point): boolean => {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const l2 = dx * dx + dy * dy;
  const r2 = r * r;
  if (l2 <= r2) return false;
  const k = Math.sqrt(1 - r2 / l2);
  p.x = cx + dx * k;
  p.y = cy + dy * k;
  return true;
};

const strokeDisplacement = (op: StrokeOp, x: number, y: number): number => {
  // Normal n = (−uy, ux). Distance to the line is invariant under the map.
  const distance = Math.abs((x - op.bx) * -op.uy + (y - op.by) * op.ux);
  return (op.shift * op.falloff) / (distance + op.falloff);
};

export const pushStroke = (op: StrokeOp, p: Point): void => {
  const s = strokeDisplacement(op, p.x, p.y);
  p.x += op.ux * s;
  p.y += op.uy * s;
};

export const pullStroke = (op: StrokeOp, p: Point): void => {
  const s = strokeDisplacement(op, p.x, p.y);
  p.x -= op.ux * s;
  p.y -= op.uy * s;
};


const rotateAround = (op: SwirlOp, p: Point, direction: 1 | -1): void => {
  const dx = p.x - op.cx;
  const dy = p.y - op.cy;
  const angle = (direction * op.turn * op.falloff) / (Math.hypot(dx, dy) + op.falloff);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  p.x = op.cx + dx * cos - dy * sin;
  p.y = op.cy + dx * sin + dy * cos;
};

export const pushSwirl = (op: SwirlOp, p: Point): void => rotateAround(op, p, 1);

export const pullSwirl = (op: SwirlOp, p: Point): void => rotateAround(op, p, -1);
