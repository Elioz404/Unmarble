import { SHEET } from '../config.ts';

/**
 * The "ground" is the ruled pattern laid on the bath before any ink falls.
 * It doubles as the player's ruler: every displacement of the water bends it.
 *
 * Each family is a scalar `phase` field; stripe boundaries sit at integer
 * phase values. Defining stripes this way keeps the CPU rasteriser, the
 * fragment shader and the validator in exact agreement.
 */
export type GroundFamily = 'bands' | 'chevron' | 'waves' | 'combed';

export type Ground = {
  readonly family: GroundFamily;
  /** Stripe period in cells (one light + one dark band). */
  readonly period: number;
  /** Orientation of the stripes, degrees (0 = horizontal). */
  readonly angle: number;
  /** Chevron slope or wave amplitude in cells (unused by bands/combed). */
  readonly amplitude: number;
  /** Wave length in cells (waves only). */
  readonly wavelength: number;
};

export const GROUND_FAMILIES: readonly GroundFamily[] = ['bands', 'chevron', 'waves', 'combed'];

export const isGroundFamily = (value: unknown): value is GroundFamily =>
  typeof value === 'string' && (GROUND_FAMILIES as readonly string[]).includes(value);

const CENTER_X = SHEET.cols / 2;
const CENTER_Y = SHEET.rows / 2;
const TAU = Math.PI * 2;

/** Stripe phase at an original (pre-marbling) point. Matches the shader. */
export const groundPhase = (ground: Ground, x: number, y: number): number => {
  const a = (ground.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = x - CENTER_X;
  const dy = y - CENTER_Y;
  // s runs along the stripes, t across them.
  const s = dx * cos + dy * sin;
  const t = -dx * sin + dy * cos;
  switch (ground.family) {
    case 'bands':
    case 'combed':
      return t / ground.period;
    case 'chevron':
      return (t + ground.amplitude * Math.abs(s)) / ground.period;
    case 'waves':
      return (t + ground.amplitude * Math.sin((TAU * s) / ground.wavelength)) / ground.period;
  }
};

/**
 * Direction of the stripes at a point, in radians (mod π), from the phase
 * gradient. Used to make sure strokes cut the stripes steeply enough to leave
 * readable evidence.
 */
export const stripeDirection = (ground: Ground, x: number, y: number): number => {
  const h = 1e-3;
  const gx = (groundPhase(ground, x + h, y) - groundPhase(ground, x - h, y)) / (2 * h);
  const gy = (groundPhase(ground, x, y + h) - groundPhase(ground, x, y - h)) / (2 * h);
  // Stripes run perpendicular to the gradient.
  return Math.atan2(gx, -gy);
};
