import { SHEET } from '../config.ts';

/**
 * The "ground" is the ruled pattern laid on the bath before any ink falls.
 * It doubles as the player's ruler: every displacement of the water bends it.
 *
 * Each family is a scalar `phase` field; stripe boundaries sit at integer
 * phase values. A grid adds a second, crossing field of hairlines. Defining
 * the ground this way keeps the CPU rasteriser, the fragment shader and the
 * validator in exact agreement.
 */
export type GroundFamily = 'bands' | 'chevron' | 'waves' | 'combed' | 'grid' | 'rings';

export type Ground = {
  readonly family: GroundFamily;
  /** Stripe period in cells (one light + one dark band). */
  readonly period: number;
  /** Orientation of the stripes, degrees (0 = horizontal). Unused by rings. */
  readonly angle: number;
  /** Chevron slope or wave amplitude in cells (unused by the other families). */
  readonly amplitude: number;
  /** Wave length in cells (waves only). */
  readonly wavelength: number;
};

export const GROUND_FAMILIES: readonly GroundFamily[] = ['bands', 'chevron', 'waves', 'combed', 'grid', 'rings'];

export const isGroundFamily = (value: unknown): value is GroundFamily =>
  typeof value === 'string' && (GROUND_FAMILIES as readonly string[]).includes(value);

const CENTER_X = SHEET.cols / 2;
const CENTER_Y = SHEET.rows / 2;
const TAU = Math.PI * 2;

/** Coordinates along (s) and across (t) the stripes, centred on the sheet. */
const stripeFrame = (ground: Ground, x: number, y: number): { s: number; t: number } => {
  const a = (ground.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = x - CENTER_X;
  const dy = y - CENTER_Y;
  return { s: dx * cos + dy * sin, t: -dx * sin + dy * cos };
};

/** Stripe phase at an original (pre-marbling) point. Matches the shader. */
export const groundPhase = (ground: Ground, x: number, y: number): number => {
  if (ground.family === 'rings') return Math.hypot(x - CENTER_X, y - CENTER_Y) / ground.period;
  const { s, t } = stripeFrame(ground, x, y);
  switch (ground.family) {
    case 'bands':
    case 'combed':
    case 'grid':
      return t / ground.period;
    case 'chevron':
      return (t + ground.amplitude * Math.abs(s)) / ground.period;
    case 'waves':
      return (t + ground.amplitude * Math.sin((TAU * s) / ground.wavelength)) / ground.period;
  }
};

/**
 * The crossing field of a grid (hairlines running across the bands), or null
 * for families with a single direction. Matches the shader.
 */
export const groundCrossPhase = (ground: Ground, x: number, y: number): number | null =>
  ground.family === 'grid' ? stripeFrame(ground, x, y).s / ground.period : null;
