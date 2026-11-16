import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleField } from '../marbling/field.ts';
import type { FieldOp } from '../marbling/field-ops.ts';
import { opsForPrefix } from '../puzzle/moves.ts';
import { LESSONS } from '../puzzle/tutorial.ts';
import { parseHex, srgbToLinear } from '../sheet/color.ts';
import { getPalette, PALETTES } from '../sheet/palettes.ts';
import { INK_FLOOR, inkAtDensity, LOOK, paperFinish, shadeSample, shadingPaletteOf } from './shading.ts';

const close = (a: number, b: number, eps: number, what: string) => assert.ok(Math.abs(a - b) <= eps + 1e-12, `${what}: ${a} ≠ ${b}`);

/** The 'round is last' lesson: a deep drop pushed into a crescent by a round light one. */
const LESSON = LESSONS[1]?.spec;
assert.ok(LESSON);
const OPS = opsForPrefix(LESSON.moves, LESSON.moves.length);
const PALETTE = shadingPaletteOf(getPalette(LESSON.paletteId));
/** A pixel of a 360-pixel-wide sheet, in cells. */
const PX = 12 / 360;

/** One pixel at a single centre sample, as the rasteriser shades it. */
const pixel = (ops: readonly FieldOp[], x: number, y: number): [number, number, number] => {
  const out: [number, number, number] = [0, 0, 0];
  const coverage = shadeSample(sampleField(ops, x, y), LESSON.ground, PALETTE, PX, out);
  const finish = paperFinish(x, y, coverage, PX);
  return [out[0] * finish, out[1] * finish, out[2] * finish];
};

test('shading matches its golden values (a change here is a change of the look: update the shader too)', () => {
  const golden: readonly { at: readonly [number, number]; rgb: readonly [number, number, number] }[] = [
    { at: [8, 7], rgb: [0.709286, 0.388641, 0.083718] }, // the round drop's centre wash
    { at: [9.746, 7], rgb: [0.695203, 0.362602, 0.068645] }, // its tide line
    { at: [5.6, 9.9], rgb: [0.008468, 0.041747, 0.198596] }, // inside the crescent
    { at: [1.5, 2.5], rgb: [0.893235, 0.844006, 0.75795] }, // bare paper
    { at: [1, 13.2], rgb: [0.75128, 0.678338, 0.564182] }, // band
    { at: [1, 14.98], rgb: [0.363699, 0.307311, 0.214355] }, // rule
  ];
  for (const { at, rgb } of golden) {
    const got = pixel(OPS, at[0], at[1]);
    rgb.forEach((c, k) => close(got[k] as number, c, 1e-6, `(${at.join(', ')})[${k}]`));
  }
});

test('an ink at full density is exactly its palette colour, laid over the paper', () => {
  for (const palette of PALETTES) {
    const shading = shadingPaletteOf(palette);
    palette.inks.forEach((hex, slot) => {
      const want = srgbToLinear(parseHex(hex));
      inkAtDensity(shading, slot, 1).forEach((c, k) => close(c, Math.max(want[k] as number, INK_FLOOR), 1e-9, `${palette.id} ink ${slot}`));
      inkAtDensity(shading, slot, 0).forEach((c, k) => close(c, shading.paper[k] as number, 1e-9, `${palette.id} paper`));
    });
  }
});

/** A lone drop that nothing has touched since it fell. */
const PRISTINE: readonly FieldOp[] = [{ type: 'drop', cx: 6, cy: 8, r: 2.6, ink: 1, source: 0 }];
const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);

test("a pristine drop's tide line is a perfect ring", () => {
  for (let depth = LOOK.mottleMaskTo; depth < 1; depth += 0.005) {
    const ring = Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2;
      const out: [number, number, number] = [0, 0, 0];
      shadeSample(sampleField(PRISTINE, 6 + Math.cos(a) * depth * 2.6, 8 + Math.sin(a) * depth * 2.6), LESSON.ground, PALETTE, PX, out);
      return out;
    });
    for (const rgb of ring) rgb.forEach((c, k) => close(c, ring[0]?.[k] as number, 1e-9, `depth ${depth.toFixed(3)}`));
  }
});

test('the ink only deepens toward its outline: no ring is drawn inside a drop', () => {
  let previous = Infinity;
  for (let depth = LOOK.mottleMaskTo; depth < 1; depth += 0.002) {
    const out: [number, number, number] = [0, 0, 0];
    shadeSample(sampleField(PRISTINE, 6 + depth * 2.6, 8), LESSON.ground, PALETTE, PX, out);
    assert.ok(luminance(out) <= previous + 1e-12, `lighter again at depth ${depth.toFixed(3)}`);
    previous = luminance(out);
  }
});

test('laid and chain lines never show through ink; tooth shows faintly', () => {
  for (let i = 0; i < 400; i++) {
    const x = (i * 0.731) % 12;
    const y = (i * 0.377) % 16;
    for (const px of [0.01, PX, 0.125]) {
      close(paperFinish(x, y, 1, px), 1, LOOK.toothStrength * LOOK.toothThroughInk, `ink at (${x}, ${y})`);
      close(paperFinish(x, y, 0, px), 1, LOOK.toothStrength + LOOK.laidStrength / 2 + LOOK.chainStrength, `paper at (${x}, ${y})`);
    }
  }
});
