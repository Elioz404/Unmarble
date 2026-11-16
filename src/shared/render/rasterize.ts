import { SHEET } from '../config.ts';
import { fieldScratchJ, sampleFieldJ } from '../marbling/field.ts';
import type { FieldOp } from '../marbling/field-ops.ts';
import type { Ground } from '../sheet/ground.ts';
import { paperFinish, shadeSample, toSrgbByte, type GroundPlace, type ShadingPalette } from './shading.ts';

export type RasterOptions = {
  readonly width: number;
  readonly height: number;
  /** Samples per pixel axis (2 → 4 samples per pixel). */
  readonly supersample: number;
  /** Optional row range for incremental rendering. */
  readonly rows?: readonly [from: number, to: number];
};

type Offsets = readonly (readonly [number, number])[];

/** The GPU's rotated-grid pattern (offsets in pixels): the CPU uses it too at 2 × 2, so both agree. */
const RGSS: Offsets = [
  [-0.125, -0.375],
  [0.375, -0.125],
  [0.125, 0.375],
  [-0.375, 0.125],
];

/** Sample offsets (pixels, from the centre) for `n` samples per axis: centre, rotated grid, or a stratified grid. */
const samplePattern = (n: number): Offsets => {
  if (n === 1) return [[0, 0]];
  if (n === 2) return RGSS;
  const grid: [number, number][] = [];
  for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) grid.push([(u + 0.5) / n - 0.5, (v + 0.5) / n - 0.5]);
  return grid;
};

/**
 * Renders a sheet into an RGBA buffer, sheet fitted to the full buffer, with
 * the same samples in every pixel. The reference CPU twin of the WebGL
 * renderer (at 2 × 2 it uses the GPU's own pattern): used for offline
 * previews and the lab's parity check. Interactive and feed surfaces use
 * `rasterizeAdaptive`.
 */
export const rasterizeSheet = (
  ops: readonly FieldOp[],
  ground: Ground,
  palette: ShadingPalette,
  options: RasterOptions,
  target: Uint8ClampedArray = new Uint8ClampedArray(options.width * options.height * 4),
): Uint8ClampedArray => {
  const { width, height, supersample } = options;
  const [rowFrom, rowTo] = options.rows ?? [0, height];
  const sx = SHEET.cols / width;
  const sy = SHEET.rows / height;
  const pattern = samplePattern(Math.max(1, Math.floor(supersample)));
  const weight = 1 / pattern.length;
  const field = fieldScratchJ();
  const sample: [number, number, number] = [0, 0, 0];
  const color: [number, number, number] = [0, 0, 0];
  for (let j = rowFrom; j < rowTo; j++) {
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) * sx;
      const y = (j + 0.5) * sy;
      color[0] = 0;
      color[1] = 0;
      color[2] = 0;
      let coverage = 0;
      for (const [u, v] of pattern) {
        coverage += shadeSample(sampleFieldJ(ops, x + u * sx, y + v * sy, field), ground, palette, sx, sample);
        color[0] += sample[0];
        color[1] += sample[1];
        color[2] += sample[2];
      }
      const finish = paperFinish(x, y, coverage * weight, sx) * weight;
      const o = (j * width + i) * 4;
      target[o] = toSrgbByte(color[0] * finish);
      target[o + 1] = toSrgbByte(color[1] * finish);
      target[o + 2] = toSrgbByte(color[2] * finish);
      target[o + 3] = 255;
    }
  }
  return target;
};

/**
 * Samples per axis where an edge-adaptive raster resamples an edge, by
 * surface. Stills get 3 × 3 (more than the old 2 × 2 everywhere, for fewer
 * samples in all); the animating no-WebGL fallback gets the GPU's own 2 × 2
 * pattern, so it matches the GPU and stays cheap per frame.
 */
export const EDGE_SAMPLES = Object.freeze({ still: 3, fallback: 2 });

/**
 * Where two neighbouring pixel centres differ by any of these, both pixels
 * are resampled: an outline, a hairline or a fold may cross between them.
 */
const EDGE = Object.freeze({
  /** Linear-channel step above anything a smooth wash, tide or mottle makes between neighbours. */
  colour: 0.012,
  /** Stripe-phase step that can hide a compressed hairline between two centres. */
  phase: 0.35,
});

/** Region keys: which ink (negative) or which band and hairline share of the ground a centre landed in. */
const groundRegion = ({ phase, cross, line }: GroundPlace): number =>
  (Math.floor(cross) * 1024 + Math.floor(phase)) * 4 + Math.round(line * 3);
const inkRegion = (source: number): number => -1 - source;

/**
 * An edge-adaptive raster: every pixel is shaded once at its centre, then
 * only pixels where neighbouring centres disagree are resampled on a finer
 * grid. Buffers are kept between frames, so animating costs no allocation.
 */
export type AdaptiveRaster = {
  readonly width: number;
  readonly height: number;
  /** Linear colour before the paper finish, and ink coverage, per pixel. */
  readonly rgb: Float32Array;
  readonly coverage: Float32Array;
  /** What each centre landed in, and its ground phases (NaN on ink). */
  readonly region: Int32Array;
  readonly phase: Float32Array;
  readonly cross: Float32Array;
  readonly flagged: Uint8Array;
  /** Field samples taken since the raster was last shaded from scratch. */
  samples: number;
};

export const createAdaptiveRaster = (width: number, height: number): AdaptiveRaster => {
  const pixels = width * height;
  return {
    width,
    height,
    rgb: new Float32Array(pixels * 3),
    coverage: new Float32Array(pixels),
    region: new Int32Array(pixels),
    phase: new Float32Array(pixels),
    cross: new Float32Array(pixels),
    flagged: new Uint8Array(pixels),
    samples: 0,
  };
};

/** First pass: one sample at every pixel centre. A finished image already, aliased only at edges. */
export const shadeCentres = (raster: AdaptiveRaster, ops: readonly FieldOp[], ground: Ground, palette: ShadingPalette): void => {
  const { width, height, rgb, coverage, region, phase, cross } = raster;
  const sx = SHEET.cols / width;
  const sy = SHEET.rows / height;
  const field = fieldScratchJ();
  const place: GroundPlace = { phase: 0, cross: 0, line: 0 };
  const color: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const p = j * width + i;
      const sample = sampleFieldJ(ops, (i + 0.5) * sx, (j + 0.5) * sy, field);
      const ink = shadeSample(sample, ground, palette, sx, color, place);
      rgb[p * 3] = color[0];
      rgb[p * 3 + 1] = color[1];
      rgb[p * 3 + 2] = color[2];
      coverage[p] = ink;
      if (ink > 0) {
        region[p] = inkRegion(sample.source);
        phase[p] = Number.NaN;
        cross[p] = Number.NaN;
      } else {
        region[p] = groundRegion(place);
        phase[p] = place.phase;
        cross[p] = place.cross;
      }
    }
  }
  raster.samples = width * height;
};

/** Whether pixels `a` and `b` (neighbours) may have an edge between them. */
const differ = (raster: AdaptiveRaster, a: number, b: number): boolean => {
  const { rgb, region, phase, cross } = raster;
  if (region[a] !== region[b]) return true;
  for (let k = 0; k < 3; k++) if (Math.abs((rgb[a * 3 + k] as number) - (rgb[b * 3 + k] as number)) > EDGE.colour) return true;
  // NaN (ink) compares false: inside one drop only the colour test applies.
  return Math.abs((phase[a] as number) - (phase[b] as number)) > EDGE.phase || Math.abs((cross[a] as number) - (cross[b] as number)) > EDGE.phase;
};

/**
 * Second pass: resamples every pixel that disagrees with its right or lower
 * neighbour (both pixels of the pair) on an `n` × `n` pattern.
 */
export const refineEdges = (
  raster: AdaptiveRaster,
  ops: readonly FieldOp[],
  ground: Ground,
  palette: ShadingPalette,
  n: number,
): void => {
  const { width, height, rgb, coverage, flagged } = raster;
  flagged.fill(0);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const p = j * width + i;
      if (i + 1 < width && differ(raster, p, p + 1)) flagged[p] = flagged[p + 1] = 1;
      if (j + 1 < height && differ(raster, p, p + width)) flagged[p] = flagged[p + width] = 1;
    }
  }
  const sx = SHEET.cols / width;
  const sy = SHEET.rows / height;
  const pattern = samplePattern(n);
  const weight = 1 / pattern.length;
  const field = fieldScratchJ();
  const color: [number, number, number] = [0, 0, 0];
  for (let p = 0; p < width * height; p++) {
    if (flagged[p] === 0) continue;
    const x = ((p % width) + 0.5) * sx;
    const y = (Math.floor(p / width) + 0.5) * sy;
    let r = 0;
    let g = 0;
    let b = 0;
    let ink = 0;
    for (const [u, v] of pattern) {
      ink += shadeSample(sampleFieldJ(ops, x + u * sx, y + v * sy, field), ground, palette, sx, color);
      r += color[0];
      g += color[1];
      b += color[2];
    }
    rgb[p * 3] = r * weight;
    rgb[p * 3 + 1] = g * weight;
    rgb[p * 3 + 2] = b * weight;
    coverage[p] = ink * weight;
    raster.samples += pattern.length;
  }
};

/** Last pass: the paper finish, once per pixel, into RGBA bytes. */
export const finishRaster = (raster: AdaptiveRaster, target: Uint8ClampedArray): void => {
  const { width, height, rgb, coverage } = raster;
  const sx = SHEET.cols / width;
  const sy = SHEET.rows / height;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const p = j * width + i;
      const finish = paperFinish((i + 0.5) * sx, (j + 0.5) * sy, coverage[p] as number, sx);
      target[p * 4] = toSrgbByte((rgb[p * 3] as number) * finish);
      target[p * 4 + 1] = toSrgbByte((rgb[p * 3 + 1] as number) * finish);
      target[p * 4 + 2] = toSrgbByte((rgb[p * 3 + 2] as number) * finish);
      target[p * 4 + 3] = 255;
    }
  }
};

/** Renders a sheet edge-adaptively in one go: centres, refined edges (`n` × `n`), finish. */
export const rasterizeAdaptive = (
  raster: AdaptiveRaster,
  ops: readonly FieldOp[],
  ground: Ground,
  palette: ShadingPalette,
  n: number,
  target: Uint8ClampedArray,
): void => {
  shadeCentres(raster, ops, ground, palette);
  refineEdges(raster, ops, ground, palette, n);
  finishRaster(raster, target);
};
