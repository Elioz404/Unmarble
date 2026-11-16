import { parseHex, srgbToLinear, type Rgb } from '../sheet/color.ts';
import { groundCrossPhase, groundPhase, type Ground } from '../sheet/ground.ts';
import type { Palette } from '../sheet/palettes.ts';
import type { FieldSample } from '../marbling/field.ts';

/**
 * The look of a marbled sheet, shared by the CPU rasteriser and (line for
 * line) the WebGL fragment shader in `client/render/webgl/sheet.frag.ts`.
 *
 * Art direction, in order of importance:
 *  1. Legibility. Ink edges are crisp, the ruled ground is high-contrast.
 *  2. Materiality. Ink has a denser rim, as real marbling colour does; the
 *     paper has fibre and faint laid/chain lines. Texture lives in paper
 *     space, never in water space, so it never hides a deformation.
 *  3. Restraint. Every effect is a few percent; nothing decorates.
 */
export const LOOK = Object.freeze({
  /** Hairline width in stripe-phase units. */
  ruleWidth: 0.07,
  /** Rim darkening of each drop and where it starts (0 centre … 1 rim). */
  rimStrength: 0.2,
  rimStart: 0.8,
  /** Ink opacity over paper (multiply-like mix). */
  inkOpacity: 0.94,
  /** Ink density noise (moves with the ink). */
  inkGrain: 0.018,
  inkGrainScale: 1.4,
  /** Paper fibre noise (fixed to the paper). */
  paperFibre: 0.022,
  paperFibreScale: 9,
  /** Laid lines (dense) and chain lines (sparse) of laid paper. */
  laidSpacing: 0.16,
  laidStrength: 0.012,
  chainSpacing: 2.6,
  chainStrength: 0.02,
  /** Magnifier ghost: undeformed hairlines drawn over the sheet. */
  ghostWidth: 0.05,
  ghostColor: '#1C2A3A',
});

export type ShadingPalette = {
  readonly paper: Rgb;
  readonly band: Rgb;
  readonly rule: Rgb;
  readonly ghost: Rgb;
  readonly inks: readonly Rgb[];
};

const linear = (hex: string): Rgb => srgbToLinear(parseHex(hex));

export const shadingPaletteOf = (palette: Palette): ShadingPalette => ({
  paper: linear(palette.paper),
  band: linear(palette.band),
  rule: linear(palette.rule),
  ghost: linear(LOOK.ghostColor),
  inks: palette.inks.map(linear),
});

const fract = (v: number): number => v - Math.floor(v);

/** Classic shader hash; mirrored exactly in GLSL. */
const hash = (x: number, y: number): number => fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Value noise in [0, 1]. */
export const valueNoise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

/** Brightness factor of the paper itself at a point of the sheet. */
export const paperTexture = (x: number, y: number): number => {
  const fibre = valueNoise(x * LOOK.paperFibreScale, y * LOOK.paperFibreScale * 0.35) - 0.5;
  const laid = Math.cos((y / LOOK.laidSpacing) * Math.PI * 2) * 0.5;
  const chain = Math.exp(-((fract(x / LOOK.chainSpacing) - 0.5) ** 2) * 900);
  return 1 + fibre * LOOK.paperFibre * 2 + laid * LOOK.laidStrength - chain * LOOK.chainStrength;
};

/** Distance to the nearest integer phase, i.e. to the nearest hairline. */
const hairline = (phase: number, width: number): number => {
  const d = Math.abs(fract(phase + 0.5) - 0.5);
  return 1 - smoothstep(width * 0.5, width, d);
};

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Linear-RGB colour of one sheet point. `x, y` are sheet coordinates (paper
 * space), `sample` is what the bath shows there, `ghost` is the magnifier.
 */
export const shadePoint = (
  sample: FieldSample,
  x: number,
  y: number,
  ground: Ground,
  palette: ShadingPalette,
  ghost: number,
  out: [number, number, number],
): void => {
  let r: number;
  let g: number;
  let b: number;
  if (sample.kind === 'ink') {
    const ink = palette.inks[sample.ink] ?? palette.inks[0] ?? palette.rule;
    const rim = 1 - LOOK.rimStrength * smoothstep(LOOK.rimStart, 1, sample.depth);
    const grain = 1 + (valueNoise(sample.depth * LOOK.inkGrainScale * 6, sample.source * 7.31) - 0.5) * LOOK.inkGrain * 2;
    const k = rim * grain;
    r = mix(palette.paper[0], ink[0] * k, LOOK.inkOpacity);
    g = mix(palette.paper[1], ink[1] * k, LOOK.inkOpacity);
    b = mix(palette.paper[2], ink[2] * k, LOOK.inkOpacity);
  } else {
    const phase = groundPhase(ground, sample.x, sample.y);
    const band = Math.floor(phase) % 2 === 0 ? palette.paper : palette.band;
    const cross = groundCrossPhase(ground, sample.x, sample.y);
    const line = Math.max(hairline(phase, LOOK.ruleWidth), cross === null ? 0 : hairline(cross, LOOK.ruleWidth));
    r = mix(band[0], palette.rule[0], line);
    g = mix(band[1], palette.rule[1], line);
    b = mix(band[2], palette.rule[2], line);
  }
  const paper = paperTexture(x, y);
  r *= paper;
  g *= paper;
  b *= paper;
  if (ghost > 0) {
    const line = hairline(groundPhase(ground, x, y), LOOK.ghostWidth) * ghost * 0.7;
    r = mix(r, palette.ghost[0], line);
    g = mix(g, palette.ghost[1], line);
    b = mix(b, palette.ghost[2], line);
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
};

/** Linear → sRGB byte. */
export const toSrgbByte = (c: number): number => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};
