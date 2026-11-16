import { INPUT } from '../config.ts';
import { resolveSwipe } from '../game/gestures.ts';
import { seamSegment } from './evidence.ts';
import { strokeOp, type Move } from './moves.ts';
import type { SheetSpec } from './sheet.ts';

/** Where along the top seam the contract probes, as fractions of its length. */
const PROBE_POSITIONS = [0.25, 0.5, 0.75] as const;
/** Perpendicular offsets probed, as fractions of the swipe tolerance. */
const PROBE_OFFSETS = [-0.75, -0.4, 0, 0.4, 0.75] as const;
/** Length (cells) of a probing swipe; comfortably above the minimum. */
const PROBE_LENGTH = INPUT.minSwipeLength + 1;

/**
 * Gesture separability: at every step whose top move is a stroke, any
 * reasonable swipe against that seam must resolve to it. Sheets where two
 * visible seams run too close to tell apart are rejected, so a player who
 * reads the sheet right can never be punished for where their finger landed.
 */
export const gesturesAreSeparable = (moves: readonly Move[]): boolean => {
  const probe: SheetSpec = {
    paletteId: '',
    ground: { family: 'bands', period: 1, angle: 0, amplitude: 0, wavelength: 1 },
    moves,
    stars: 1,
  };
  for (let prefix = moves.length; prefix >= 1; prefix--) {
    const top = moves[prefix - 1];
    if (top?.kind !== 'stroke') continue;
    const op = strokeOp(top, prefix - 1);
    const segment = seamSegment(op);
    if (!segment) return false;
    for (const position of PROBE_POSITIONS) {
      const cx = segment.from.x + (segment.to.x - segment.from.x) * position;
      const cy = segment.from.y + (segment.to.y - segment.from.y) * position;
      for (const offset of PROBE_OFFSETS) {
        const shift = offset * INPUT.swipeSeamTolerance;
        const ox = cx - op.uy * shift;
        const oy = cy + op.ux * shift;
        const half = PROBE_LENGTH / 2;
        // Against the stroke: from ahead of the point back past it.
        const from = { x: ox + op.ux * half, y: oy + op.uy * half };
        const to = { x: ox - op.ux * half, y: oy - op.uy * half };
        const action = resolveSwipe(probe, prefix, from, to);
        if (action?.type !== 'unstroke' || action.move !== prefix - 1 || !action.against) return false;
      }
    }
  }
  return true;
};
