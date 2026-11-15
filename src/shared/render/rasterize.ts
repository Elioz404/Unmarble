import { SHEET } from '../config.ts';
import { sampleField } from '../marbling/field.ts';
import type { FieldOp } from '../marbling/field-ops.ts';
import type { Ground } from '../sheet/ground.ts';
import { shadePoint, toSrgbByte, type ShadingPalette } from './shading.ts';

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
  const n = Math.max(1, Math.floor(supersample));
  const weight = 1 / (n * n);
  const color: [number, number, number] = [0, 0, 0];
  for (let j = rowFrom; j < rowTo; j++) {
    for (let i = 0; i < width; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let v = 0; v < n; v++) {
        for (let u = 0; u < n; u++) {
          const x = (i + (u + 0.5) / n) * sx;
          const y = (j + (v + 0.5) / n) * sy;
          shadePoint(sampleField(ops, x, y), x, y, ground, palette, ghost, color);
          r += color[0];
          g += color[1];
          b += color[2];
        }
      }
      const o = (j * width + i) * 4;
      target[o] = toSrgbByte(r * weight);
      target[o + 1] = toSrgbByte(g * weight);
      target[o + 2] = toSrgbByte(b * weight);
      target[o + 3] = 255;
    }
  }
  return target;
};
