import { SHEET } from '../config.ts';
import { sampleField } from '../marbling/field.ts';
import type { FieldOp } from '../marbling/field-ops.ts';
import type { Ground } from '../sheet/ground.ts';
import { applyGhost, paperFinish, shadeSample, toSrgbByte, type ShadingPalette } from './shading.ts';

export type RasterOptions = {
  readonly width: number;
  readonly height: number;
  /** Samples per pixel axis (2 → 4 samples per pixel). */
  readonly supersample: number;
  /** Magnifier ghost strength, 0–1. */
  readonly ghost: number;
  /** Optional row range for incremental rendering. */
  readonly rows?: readonly [from: number, to: number];
};

/** The GPU's rotated-grid pattern (offsets in pixels): the CPU uses it too at 2 × 2, so both agree. */
const RGSS: readonly (readonly [number, number])[] = [
  [-0.125, -0.375],
  [0.375, -0.125],
  [0.125, 0.375],
  [-0.375, 0.125],
];

/** Sample offsets (pixels, from the centre) for `n` samples per axis: centre, rotated grid, or a regular grid. */
const samplePattern = (n: number): readonly (readonly [number, number])[] => {
  if (n === 1) return [[0, 0]];
  if (n === 2) return RGSS;
  const grid: [number, number][] = [];
  for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) grid.push([(u + 0.5) / n - 0.5, (v + 0.5) / n - 0.5]);
  return grid;
};

/**
 * Renders a sheet into an RGBA buffer, sheet fitted to the full buffer.
 * The CPU twin of the WebGL renderer: used for the in-feed card, for the
 * fallback when WebGL is unavailable, and for offline previews.
 */
export const rasterizeSheet = (
  ops: readonly FieldOp[],
  ground: Ground,
  palette: ShadingPalette,
  options: RasterOptions,
  target: Uint8ClampedArray = new Uint8ClampedArray(options.width * options.height * 4),
): Uint8ClampedArray => {
  const { width, height, supersample, ghost } = options;
  const [rowFrom, rowTo] = options.rows ?? [0, height];
  const sx = SHEET.cols / width;
  const sy = SHEET.rows / height;
  const pattern = samplePattern(Math.max(1, Math.floor(supersample)));
  const weight = 1 / pattern.length;
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
        coverage += shadeSample(sampleField(ops, x + u * sx, y + v * sy), ground, palette, sx, sample);
        color[0] += sample[0];
        color[1] += sample[1];
        color[2] += sample[2];
      }
      const finish = paperFinish(x, y, coverage * weight, sx) * weight;
      color[0] *= finish;
      color[1] *= finish;
      color[2] *= finish;
      if (ghost > 0) applyGhost(x, y, ground, palette, ghost, color);
      const o = (j * width + i) * 4;
      target[o] = toSrgbByte(color[0]);
      target[o + 1] = toSrgbByte(color[1]);
      target[o + 2] = toSrgbByte(color[2]);
      target[o + 3] = 255;
    }
  }
  return target;
};
