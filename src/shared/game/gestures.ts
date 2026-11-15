import { INPUT } from '../config.ts';
import { pullThrough, sampleField } from '../marbling/field.ts';
import { opsForPrefix, strokeOp } from '../puzzle/moves.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import type { PlayerAction, SheetPoint } from './session.ts';

/**
 * Turns raw gestures (in sheet cells) into player actions. Resolution is
 * exact rather than approximate: a tap asks the bath which ink lies under the
 * finger; a swipe is pulled back into the frame where each candidate seam was
 * made and compared there. Nothing is snapped to "nearest", so a blot can
 * only ever be a misreading, never a misaim.
 */

/** Probe offsets covering a finger footprint: centre plus two rings. */
const FINGER_PROBES: readonly SheetPoint[] = (() => {
  const probes: SheetPoint[] = [{ x: 0, y: 0 }];
  const ringCount = INPUT.fingerProbes - 1;
  const inner = Math.floor(ringCount / 3);
  const outer = ringCount - inner;
  for (let i = 0; i < inner; i++) {
    const a = (i / inner) * Math.PI * 2;
    probes.push({ x: Math.cos(a) * INPUT.fingerRadius * 0.5, y: Math.sin(a) * INPUT.fingerRadius * 0.5 });
  }
  for (let i = 0; i < outer; i++) {
    const a = (i / outer) * Math.PI * 2 + Math.PI / outer;
    probes.push({ x: Math.cos(a) * INPUT.fingerRadius, y: Math.sin(a) * INPUT.fingerRadius });
  }
  return probes;
})();

/**
 * The drop a tap addresses, or null when the finger is on bare ground or the
 * reading is ambiguous (no penalty: the UI just shows a gentle no-op).
 */
export const resolveTap = (spec: SheetSpec, remaining: number, point: SheetPoint): PlayerAction | null => {
  const ops = opsForPrefix(spec.moves, remaining);
  const votes = new Map<number, number>();
  let centre: number | null = null;
  for (const [index, offset] of FINGER_PROBES.entries()) {
    const sample = sampleField(ops, point.x + offset.x, point.y + offset.y);
    if (sample.kind !== 'ink') continue;
    votes.set(sample.source, (votes.get(sample.source) ?? 0) + 1);
    if (index === 0) centre = sample.source;
  }
  let best: number | null = null;
  let bestVotes = 0;
  for (const [move, count] of votes) {
    if (count > bestVotes || (count === bestVotes && move === centre)) {
      best = move;
      bestVotes = count;
    }
  }
  if (best === null || bestVotes / FINGER_PROBES.length < INPUT.tapConsensus) return null;
  return { type: 'absorb', move: best };
};

const SWIPE_SAMPLES = 7;

/**
 * The seam a swipe addresses and whether it drags against the original
 * stroke, or null when no seam matches.
 */
export const resolveSwipe = (
  spec: SheetSpec,
  remaining: number,
  from: SheetPoint,
  to: SheetPoint,
): PlayerAction | null => {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < INPUT.minSwipeLength) return null;
  const ops = opsForPrefix(spec.moves, remaining);
  const maxSin = Math.sin((INPUT.swipeAngleTolerance * Math.PI) / 180);
  let best: { move: number; distance: number; against: boolean } | null = null;

  for (let index = 0; index < remaining; index++) {
    const move = spec.moves[index];
    if (move?.kind !== 'stroke') continue;
    const op = strokeOp(move, index);
    // Pull the swipe back to the moment this stroke was made.
    const points: SheetPoint[] = [];
    for (let i = 0; i < SWIPE_SAMPLES; i++) {
      const t = i / (SWIPE_SAMPLES - 1);
      const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      if (pullThrough(ops, index + 1, remaining, p)) points.push(p);
    }
    if (points.length < 2) continue;
    const first = points[0] as SheetPoint;
    const last = points[points.length - 1] as SheetPoint;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const span = Math.hypot(dx, dy);
    if (span < 1e-6) continue;
    const sinAngle = Math.abs((dx * op.uy - dy * op.ux) / span);
    if (sinAngle > maxSin) continue;
    const distance =
      points.reduce((sum, p) => sum + Math.abs((p.x - op.bx) * -op.uy + (p.y - op.by) * op.ux), 0) / points.length;
    if (distance > INPUT.swipeSeamTolerance) continue;
    if (!best || distance < best.distance) {
      best = { move: index, distance, against: dx * op.ux + dy * op.uy < 0 };
    }
  }

  return best ? { type: 'unstroke', move: best.move, against: best.against } : null;
};
