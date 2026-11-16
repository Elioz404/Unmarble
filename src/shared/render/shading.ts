import { parseHex, srgbToLinear, type Rgb } from '../sheet/color.ts';
import { groundCrossPhase, groundPhase, type Ground } from '../sheet/ground.ts';
import type { Palette } from '../sheet/palettes.ts';
import type { FieldSample } from '../marbling/field.ts';

/**
 * The look of a marbled sheet, shared by the CPU rasteriser and (line for
 * line) the WebGL fragment shader in `client/render/webgl/sheet-shader.ts`.
 *
 * Art direction, in order of importance:
 *  1. Legibility. Ink outlines are hard, full-contrast steps and the ruled
 *     ground is high-contrast. No term adds an edge the field does not have.
 *  2. Materiality. Ink is laid over the paper subtractively (Beer–Lambert),
 *     with pigment body: a slightly thinner wash in the centre, a tide line
 *     pooled just inside the true outline, a faint mottle. All of it lives in
 *     the ink's own coordinates, so it rides every deformation. The paper has
 *     tooth and laid/chain lines fixed to the paper, so they never hide one.
 *  3. Restraint. Every effect is a few percent; nothing decorates.
 *
 * Shading runs in two steps: `shadeSample` per sample (colour and ink
 * coverage), then `paperFinish` once per pixel.
 */
export const LOOK = Object.freeze({
  /** Hairline width in stripe-phase units. */
  ruleWidth: 0.07,
  /**
   * Ink density at a drop's centre per ink slot (deep → light), where 1 is the
   * palette colour: a thinner, luminous wash. Each is the thinnest wash that
   * still keeps the palette contract (`palettes.test.ts`) with the mottle at
   * its lightest; the lightest ink cannot thin at all.
   */
  inkBody: Object.freeze([0.95, 0.96, 0.98, 1]),
  /** Depths (0 centre … 1 rim) over which the wash thickens to full density. */
  inkBodyFrom: 0.15,
  inkBodyTo: 0.9,
  /**
   * Extra density of the tide line pooled against the outline: full from
   * `tideAt` out to the rim, so the outline stays the hardest step, and fading
   * inward over `tideWidth` (depth units), so it never draws a ring inside.
   */
  tide: 0.22,
  tideAt: 0.955,
  tideWidth: 0.03,
  /** The tide line fades in between these widths in pixels, so it vanishes on small sheets instead of aliasing. */
  tideFromPx: 1,
  tideToPx: 2.5,
  /** Pigment mottle: relative density swing, and blotches per cell in the ink's own coordinates. */
  mottle: 0.03,
  mottleScale: 0.8,
  /** Noise offset per source move, so no two drops mottle alike. */
  mottleSeedX: 13.1,
  mottleSeedY: 7.3,
  /** Depths over which the mottle fades out, so the outline stays a clean step. */
  mottleMaskFrom: 0.86,
  mottleMaskTo: 0.96,
  /** Paper tooth: relative brightness swing, and the share of it that shows through ink. */
  toothStrength: 0.02,
  toothThroughInk: 0.35,
  /** Tooth noise frequencies (per cell, near-isotropic): a coarse octave, a fine one, and the coarse octave's weight. */
  toothCoarseX: 11,
  toothCoarseY: 7.8,
  toothFineX: 27,
  toothFineY: 19,
  toothCoarse: 0.6,
  /** Laid lines (dense) and chain lines (sparse) of laid paper; they show on bare paper only. */
  laidSpacing: 0.16,
  laidStrength: 0.012,
  chainSpacing: 2.6,
  chainStrength: 0.02,
  /** Chain-line width, as a Gaussian σ in cells. */
  chainWidth: 0.061,
  /** A pixel's footprint as a Gaussian σ in pixels: what the chain line is prefiltered with. */
  pixelFootprint: 0.5,
});

/** Floor of a linear ink channel before its logarithm, so a black ink stays finite. */
export const INK_FLOOR = 1e-4;

export type ShadingPalette = {
  readonly paper: Rgb;
  readonly band: Rgb;
  readonly rule: Rgb;
  /** Per ink, ln(ink / paper): its optical density over this paper, per channel (Beer–Lambert). */
  readonly inkLog: readonly Rgb[];
};

const linear = (hex: string): Rgb => srgbToLinear(parseHex(hex));

const densityOver = (paper: Rgb) => (ink: Rgb): Rgb => [
  Math.log(Math.max(ink[0], INK_FLOOR) / paper[0]),
  Math.log(Math.max(ink[1], INK_FLOOR) / paper[1]),
  Math.log(Math.max(ink[2], INK_FLOOR) / paper[2]),
];

export const shadingPaletteOf = (palette: Palette): ShadingPalette => {
  const paper = linear(palette.paper);
  return {
    paper,
    band: linear(palette.band),
    rule: linear(palette.rule),
    inkLog: palette.inks.map(linear).map(densityOver(paper)),
  };
};

const fract = (v: number): number => v - Math.floor(v);

/**
 * Integer lattice hash (lowbias32) in [0, 1). Mirrored exactly in GLSL: unlike
 * a sin-based hash it gives the same bits in float32 and float64.
 */
const hash = (x: number, y: number): number => {
  let h = (Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 8) / 16777216;
};

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

/** Distance to the nearest integer phase, i.e. to the nearest hairline. */
const hairline = (phase: number, width: number): number => {
  const d = Math.abs(fract(phase + 0.5) - 0.5);
  return 1 - smoothstep(width * 0.5, width, d);
};

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** An ink slot clamped to the palette, as the shader does. */
const slotOf = (slot: number): number => Math.min(Math.max(slot, 0), LOOK.inkBody.length - 1);

/** Density of an ink slot's wash at a drop's centre. */
export const inkBodyOf = (slot: number): number => LOOK.inkBody[slotOf(slot)] as number;

/** Lays an ink at optical density `density` (1 is the palette colour) over the paper (Beer–Lambert), into `out`. */
const layInk = (palette: ShadingPalette, slot: number, density: number, out: [number, number, number]): void => {
  const log = palette.inkLog[slotOf(slot)] as Rgb;
  out[0] = palette.paper[0] * Math.exp(density * log[0]);
  out[1] = palette.paper[1] * Math.exp(density * log[1]);
  out[2] = palette.paper[2] * Math.exp(density * log[2]);
};

/** The colour of an ink laid at optical density `density` (1 is the palette colour) over the paper. */
export const inkAtDensity = (palette: ShadingPalette, slot: number, density: number): Rgb => {
  const out: [number, number, number] = [0, 0, 0];
  layInk(palette, slot, density, out);
  return out;
};

/**
 * Linear-RGB colour of one sample, before the paper finish, into `out`.
 * `px` is the size of a pixel in cells. Returns the sample's ink coverage:
 * 1 for ink, 0 for bare ground.
 */
export const shadeSample = (
  sample: FieldSample,
  ground: Ground,
  palette: ShadingPalette,
  px: number,
  out: [number, number, number],
): number => {
  if (sample.kind === 'ink') {
    const { depth, source } = sample;
    const body = mix(inkBodyOf(sample.ink), 1, smoothstep(LOOK.inkBodyFrom, LOOK.inkBodyTo, depth));
    const t = Math.min(0, depth - LOOK.tideAt) / LOOK.tideWidth;
    const tide = LOOK.tide * smoothstep(LOOK.tideFromPx, LOOK.tideToPx, (LOOK.tideWidth * sample.r) / px) * Math.exp(-t * t);
    const blotch = valueNoise(
      sample.lx * LOOK.mottleScale + LOOK.mottleSeedX * source,
      sample.ly * LOOK.mottleScale + LOOK.mottleSeedY * source,
    );
    const mottle = 2 * LOOK.mottle * (blotch - 0.5) * (1 - smoothstep(LOOK.mottleMaskFrom, LOOK.mottleMaskTo, depth));
    layInk(palette, sample.ink, (body + tide) * (1 + mottle), out);
    return 1;
  }
  const phase = groundPhase(ground, sample.x, sample.y);
  const band = Math.floor(phase) % 2 === 0 ? palette.paper : palette.band;
  const cross = groundCrossPhase(ground, sample.x, sample.y);
  const line = Math.max(hairline(phase, LOOK.ruleWidth), cross === null ? 0 : hairline(cross, LOOK.ruleWidth));
  out[0] = mix(band[0], palette.rule[0], line);
  out[1] = mix(band[1], palette.rule[1], line);
  out[2] = mix(band[2], palette.rule[2], line);
  return 0;
};

/**
 * Brightness factor of the paper finish at a pixel centre `x, y` (paper
 * space), given the pixel's ink coverage and its size `px` in cells. Tooth
 * shows faintly through ink; laid and chain lines only on bare paper. Every
 * term is prefiltered by the pixel size, so small sheets never moiré.
 */
export const paperFinish = (x: number, y: number, coverage: number, px: number): number => {
  // A pattern aliases once a pixel spans half its period (Nyquist); each fades out on the way there.
  const fine = 1 - smoothstep(0.5 / LOOK.toothFineX, 1 / LOOK.toothFineX, px);
  const tooth =
    LOOK.toothCoarse * (valueNoise(x * LOOK.toothCoarseX, y * LOOK.toothCoarseY) - 0.5) +
    (1 - LOOK.toothCoarse) * (valueNoise(x * LOOK.toothFineX, y * LOOK.toothFineY) - 0.5) * fine;
  const laid = Math.cos((y / LOOK.laidSpacing) * Math.PI * 2) * 0.5 * (1 - smoothstep(LOOK.laidSpacing / 4, LOOK.laidSpacing / 2, px));
  const sigma = Math.hypot(LOOK.chainWidth, LOOK.pixelFootprint * px);
  const offset = (fract(x / LOOK.chainSpacing) - 0.5) * LOOK.chainSpacing;
  const chain = (LOOK.chainWidth / sigma) * Math.exp(-(offset * offset) / (2 * sigma * sigma));
  return (
    1 +
    2 * LOOK.toothStrength * tooth * mix(1, LOOK.toothThroughInk, coverage) +
    (1 - coverage) * (laid * LOOK.laidStrength - chain * LOOK.chainStrength)
  );
};

/** Linear → sRGB byte. */
export const toSrgbByte = (c: number): number => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};
