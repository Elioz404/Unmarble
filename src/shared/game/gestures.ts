import { INPUT } from '../config.ts';
import { pushThrough, sampleField } from '../marbling/field.ts';
import type { FieldOp } from '../marbling/field-ops.ts';
import { seamSegment } from '../puzzle/evidence.ts';
import { opsForPrefix } from '../puzzle/moves.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import type { PlayerAction, SheetPoint } from './session.ts';

/**
 * Turns raw gestures (in sheet cells) into player actions. Resolution reads
 * the sheet as the player sees it: a tap asks the bath which ink lies under
 * the finger; a swipe is compared with every seam as it currently appears.
 * Nothing is snapped to "nearest" across frames, and every published sheet is
 * checked so that a swipe along the top seam can only mean that seam
 * (see `puzzle/gesture-contract.ts`): a blot is a misreading, never a misaim.
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
  const dx = (to.x - from.x) / length;
  const dy = (to.y - from.y) / length;
  const samples: SheetPoint[] = Array.from({ length: SWIPE_SAMPLES }, (_, i) => {
    const t = i / (SWIPE_SAMPLES - 1);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });
  let best: { move: number; distance: number; against: boolean } | null = null;

  for (let index = 0; index < remaining; index++) {
    if (spec.moves[index]?.kind !== 'stroke') continue;
    // Compare against the seam as it looks now, in the frame the player sees.
    const seam = visibleSeam(ops, index, remaining);
    if (seam.length < 3) continue;
    let matched = 0;
    let distanceSum = 0;
    let tx = 0;
    let ty = 0;
    for (const sample of samples) {
      const nearest = nearestOnPath(seam, sample);
      if (nearest.distance > INPUT.swipeSeamTolerance) continue;
      matched++;
      distanceSum += nearest.distance;
      tx += nearest.tangentX;
      ty += nearest.tangentY;
    }
    if (matched < SWIPE_SAMPLES - 2) continue;
    const tangent = Math.hypot(tx, ty);
    if (tangent < 1e-9) continue;
    const sinAngle = Math.abs((dx * ty - dy * tx) / tangent);
    if (sinAngle > maxSin) continue;
    const distance = distanceSum / matched;
    if (!best || distance < best.distance) {
      // The seam path runs in the stroke's direction of travel; undoing drags against it.
      best = { move: index, distance, against: dx * tx + dy * ty < 0 };
    }
  }

  return best ? { type: 'unstroke', move: best.move, against: best.against } : null;
};

/** Sample spacing (cells) of visible seam paths used for gesture matching. */
const SEAM_STEP = 0.1;

/**
 * The seam of stroke `index` as it appears with `prefix` moves on the bath,
 * densely sampled in the stroke's direction of travel.
 */
export const visibleSeam = (ops: readonly FieldOp[], index: number, prefix: number): SheetPoint[] => {
  const op = ops[index];
  if (op?.type !== 'stroke') return [];
  const segment = seamSegment(op);
  if (!segment) return [];
  const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
  const steps = Math.max(2, Math.ceil(length / SEAM_STEP));
  const path: SheetPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
    };
    path.push(pushThrough(ops, index + 1, prefix, p));
  }
  return path;
};

const nearestOnPath = (
  path: readonly SheetPoint[],
  point: SheetPoint,
): { distance: number; tangentX: number; tangentY: number } => {
  let bestIndex = 0;
  let bestDistance = Infinity;
  path.forEach((p, i) => {
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  });
  const before = path[Math.max(0, bestIndex - 1)] as SheetPoint;
  const after = path[Math.min(path.length - 1, bestIndex + 1)] as SheetPoint;
  const tx = after.x - before.x;
  const ty = after.y - before.y;
  const norm = Math.hypot(tx, ty) || 1;
  return { distance: bestDistance, tangentX: tx / norm, tangentY: ty / norm };
};
