import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsForPrefix } from '../puzzle/moves.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import { LESSONS } from '../puzzle/tutorial.ts';
import { getPalette } from '../sheet/palettes.ts';
import { createAdaptiveRaster, EDGE_SAMPLES, finishRaster, rasterizeAdaptive, rasterizeSheet, shadeCentres } from './rasterize.ts';
import { shadingPaletteOf } from './shading.ts';

/** A phone-sized sheet. */
const WIDTH = 240;
const HEIGHT = 320;
/** Adaptive sampling must match a full supersample on the same pattern this closely, on this share of pixels. */
const TOLERANCE = 2;
const SHARE = 0.995;

const SHEETS: readonly { name: string; spec: SheetSpec }[] = [
  { name: 'the round-is-last lesson', spec: LESSONS.find((lesson) => lesson.id === 'round-is-last')?.spec as SheetSpec },
  {
    // A fold beside a drop: the water stagnates in two wedges either side of it, where rules crowd.
    name: 'a fold past a drop',
    spec: {
      paletteId: 'saffron-tide',
      ground: { family: 'bands', period: 1.1, angle: 30, amplitude: 0, wavelength: 6 },
      stars: 3,
      moves: [
        { kind: 'drop', x: 6, y: 8, size: 'L', ink: 1 },
        { kind: 'stroke', x: 4, y: 6, heading: 0 },
        { kind: 'drop', x: 7.5, y: 10, size: 'M', ink: 2 },
        { kind: 'swirl', x: 5, y: 9, turn: -1 },
      ],
    },
  },
  {
    name: 'a grid ground',
    spec: {
      paletteId: 'carmine-map',
      ground: { family: 'grid', period: 1.2, angle: 30, amplitude: 0, wavelength: 6 },
      stars: 2,
      moves: [
        { kind: 'drop', x: 5, y: 7, size: 'L', ink: 0 },
        { kind: 'stroke', x: 6, y: 9, heading: 90 },
      ],
    },
  },
];

/** What the feed used to spend per pixel: a quick centre pass, then a full 2 × 2 pass. */
const OLD_FEED_SAMPLES = 1 + 4;

/** The raster keeps the paper finish in float32, so a channel may round one step the other way. */
const FINISH_ROUNDING = 1;

/** Share of pixels whose channels all lie within `TOLERANCE` of the reference. */
const shareClose = (image: Uint8ClampedArray, reference: Uint8ClampedArray): number => {
  let close = 0;
  for (let p = 0; p < WIDTH * HEIGHT; p++) {
    let worst = 0;
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs((image[p * 4 + k] as number) - (reference[p * 4 + k] as number)));
    if (worst <= TOLERANCE) close++;
  }
  return close / (WIDTH * HEIGHT);
};

for (const { name, spec } of SHEETS) {
  const ops = opsForPrefix(spec.moves, spec.moves.length);
  const palette = shadingPaletteOf(getPalette(spec.paletteId));
  const adaptive = (n: number) => {
    const raster = createAdaptiveRaster(WIDTH, HEIGHT);
    const image = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    rasterizeAdaptive(raster, ops, spec.ground, palette, n, image);
    return { image, samples: raster.samples };
  };
  const uniform = (n: number) => rasterizeSheet(ops, spec.ground, palette, { width: WIDTH, height: HEIGHT, supersample: n });

  // The edge test misses nothing: refining only flagged pixels looks like refining them all.
  for (const n of [EDGE_SAMPLES.still, 4]) {
    test(`edge-adaptive ${n} × ${n} matches a full ${n} × ${n} supersample on ${name}`, () => {
      const share = shareClose(adaptive(n).image, uniform(n));
      assert.ok(share >= SHARE, `only ${(share * 100).toFixed(2)}% of pixels within ${TOLERANCE}/255`);
    });
  }

  // What the no-WebGL fallback shows while the sheet moves: the plain one-sample render, finish included.
  test(`a centres-only raster matches a one-sample render on ${name}`, () => {
    const raster = createAdaptiveRaster(WIDTH, HEIGHT);
    const image = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    shadeCentres(raster, ops, spec.ground, palette);
    finishRaster(raster, image);
    const reference = uniform(1);
    for (let k = 0; k < image.length; k++) {
      assert.ok(Math.abs((image[k] as number) - (reference[k] as number)) <= FINISH_ROUNDING, `byte ${k}: ${image[k]} vs ${reference[k]}`);
    }
  });

  test(`edge-adaptive sampling of stills costs less than the old feed passes on ${name}`, () => {
    const { samples } = adaptive(EDGE_SAMPLES.still);
    assert.ok(samples <= OLD_FEED_SAMPLES * WIDTH * HEIGHT, `${(samples / (WIDTH * HEIGHT)).toFixed(2)} samples per pixel`);
  });
}
