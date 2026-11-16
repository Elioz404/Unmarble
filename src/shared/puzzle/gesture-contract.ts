import { INPUT, SHEET } from '../config.ts';
import { resolveDrag } from '../game/gestures.ts';
import type { PlayerAction, SheetPoint } from '../game/session.ts';
import { seamSegment } from './evidence.ts';
import { strokeOp, type Move } from './moves.ts';
import type { SheetSpec } from './sheet.ts';

/** Where along the top seam the contract probes, as fractions of its length. */
const SEAM_POSITIONS = [0.25, 0.5, 0.75] as const;
/** Perpendicular offsets probed, as fractions of the swipe tolerance. */
const SEAM_OFFSETS = [-0.75, -0.4, 0, 0.4, 0.75] as const;
/** Length (cells) of a probing swipe; comfortably above the minimum. */
const SWIPE_LENGTH = INPUT.minSwipeLength + 1;
/** Points sampled along a probing drag, like a finger reports them. */
const PATH_POINTS = 16;

/** Radii (cells) at which circling drags around a swirl's eye are probed. */
const CIRCLE_RADII = [1, 1.6, 2.2] as const;
/** Where those circles start, in radians. */
const CIRCLE_STARTS = [0, 2.1, 4.2] as const;
/** How far a probing circle turns, in radians (comfortably above the minimum). */
const CIRCLE_SWEEP = ((INPUT.minSwirlSweep + 80) * Math.PI) / 180;

const straightPath = (from: SheetPoint, to: SheetPoint): SheetPoint[] =>
  Array.from({ length: PATH_POINTS }, (_, i) => {
    const t = i / (PATH_POINTS - 1);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });

const arcPath = (centre: SheetPoint, radius: number, start: number, sweep: number): SheetPoint[] =>
  Array.from({ length: PATH_POINTS * 2 }, (_, i) => {
    const a = start + (sweep * i) / (PATH_POINTS * 2 - 1);
    return { x: centre.x + radius * Math.cos(a), y: centre.y + radius * Math.sin(a) };
  });

const insideSheet = (path: readonly SheetPoint[]): boolean =>
  path.every((p) => p.x >= 0 && p.x <= SHEET.cols && p.y >= 0 && p.y <= SHEET.rows);

const undoesTop = (action: PlayerAction | null, top: number, type: 'unstroke' | 'unswirl'): boolean =>
  action?.type === type && action.move === top && action.against;

/**
 * Gesture separability: at every step whose top move is a stroke or a swirl,
 * every reasonable drag that undoes it must resolve to it — straight swipes
 * against a top seam, circles against a top swirl. Returns the first move
 * that, while on top, could be mistaken for another; null when there is none.
 * Sheets with such a move are rejected, so a player who reads the sheet right
 * can never be punished for where their finger landed.
 */
export const firstAmbiguousGesture = (moves: readonly Move[]): number | null => {
  const probe: SheetSpec = {
    paletteId: '',
    ground: { family: 'bands', period: 1, angle: 0, amplitude: 0, wavelength: 1 },
    moves,
    stars: 1,
  };
  for (let prefix = moves.length; prefix >= 1; prefix--) {
    const top = moves[prefix - 1];
    if (top?.kind === 'stroke') {
      const op = strokeOp(top, prefix - 1);
      const segment = seamSegment(op);
      if (!segment) return prefix - 1;
      for (const position of SEAM_POSITIONS) {
        const cx = segment.from.x + (segment.to.x - segment.from.x) * position;
        const cy = segment.from.y + (segment.to.y - segment.from.y) * position;
        for (const offset of SEAM_OFFSETS) {
          const shift = offset * INPUT.swipeSeamTolerance;
          const ox = cx - op.uy * shift;
          const oy = cy + op.ux * shift;
          const half = SWIPE_LENGTH / 2;
          // Against the stroke: from ahead of the point back past it.
          const path = straightPath({ x: ox + op.ux * half, y: oy + op.uy * half }, { x: ox - op.ux * half, y: oy - op.uy * half });
          if (!undoesTop(resolveDrag(probe, prefix, path), prefix - 1, 'unstroke')) return prefix - 1;
        }
      }
    } else if (top?.kind === 'swirl') {
      // Against the turn: a swirl with turn +1 is undone by circling the other way.
      const sweep = -top.turn * CIRCLE_SWEEP;
      for (const radius of CIRCLE_RADII) {
        for (const start of CIRCLE_STARTS) {
          const path = arcPath({ x: top.x, y: top.y }, radius, start, sweep);
          if (!insideSheet(path)) continue;
          if (!undoesTop(resolveDrag(probe, prefix, path), prefix - 1, 'unswirl')) return prefix - 1;
        }
      }
    }
  }
  return null;
};

export const gesturesAreSeparable = (moves: readonly Move[]): boolean => firstAmbiguousGesture(moves) === null;
