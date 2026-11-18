import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldScratchJ, sampleFieldJ } from '../marbling/field.ts';
import type { FieldOp } from '../marbling/field-ops.ts';
import { opsForPrefix } from '../puzzle/moves.ts';
import { LESSONS } from '../puzzle/tutorial.ts';
import { parseHex, srgbToLinear } from '../sheet/color.ts';
import { getPalette, PALETTES } from '../sheet/palettes.ts';
import { INK_FLOOR, inkAtDensity, LOOK, paperFinish, shadeSample, shadingPaletteOf } from './shading.ts';

const close = (a: number, b: number, eps: number, what: string) => assert.ok(Math.abs(a - b) <= eps + 1e-12, `${what}: ${a} ≠ ${b}`);

/** The 'round is last' lesson: a deep drop pushed into a crescent by a round light one. */
const LESSON = LESSONS.find((lesson) => lesson.id === 'round-is-last')?.spec;
assert.ok(LESSON);
const OPS = opsForPrefix(LESSON.moves, LESSON.moves.length);
const PALETTE = shadingPaletteOf(getPalette(LESSON.paletteId));
/** A pixel of a 360-pixel-wide sheet, in cells. */
const PX = 12 / 360;

/** One pixel at a single centre sample, as the rasteriser shades it. */
const pixel = (ops: readonly FieldOp[], x: number, y: number): [number, number, number] => {
  const out: [number, number, number] = [0, 0, 0];
  const coverage = shadeSample(sampleFieldJ(ops, x, y, fieldScratchJ()), LESSON.ground, PALETTE, PX, out);
  const finish = paperFinish(x, y, coverage, PX);
  return [out[0] * finish, out[1] * finish, out[2] * finish];
};

test('shading matches its golden values (a change here is a change of the look: update the shader too)', () => {
  const golden: readonly { at: readonly [number, number]; rgb: readonly [number, number, number] }[] = [
    { at: [8, 7], rgb: [0.707184, 0.384739, 0.081372] }, // the round drop's centre wash, granulated
    { at: [9.746, 7], rgb: [0.695734, 0.362319, 0.068701] }, // its tide line
    { at: [5.6, 9.9], rgb: [0.007847, 0.03976, 0.194254] }, // inside the crescent, compressed and granulated
    { at: [1.5, 2.5], rgb: [0.884917, 0.852098, 0.750393] }, // bare paper
    { at: [1, 13.2], rgb: [0.766391, 0.671282, 0.539091] }, // band
    { at: [1, 14.98], rgb: [0.436592, 0.281174, 0.193261] }, // rule
    { at: [1, 14.95], rgb: [0.600288, 0.490716, 0.39806] }, // the rule's analytic pen edge
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
      shadeSample(sampleFieldJ(PRISTINE, 6 + Math.cos(a) * depth * 2.6, 8 + Math.sin(a) * depth * 2.6, fieldScratchJ()), LESSON.ground, PALETTE, PX, out);
      return out;
    });
    for (const rgb of ring) rgb.forEach((c, k) => close(c, ring[0]?.[k] as number, 1e-9, `depth ${depth.toFixed(3)}`));
  }
});

test('the ink only deepens toward its outline: no ring is drawn inside a drop', () => {
  let previous = Infinity;
  for (let depth = LOOK.mottleMaskTo; depth < 1; depth += 0.002) {
    const out: [number, number, number] = [0, 0, 0];
    shadeSample(sampleFieldJ(PRISTINE, 6 + depth * 2.6, 8, fieldScratchJ()), LESSON.ground, PALETTE, PX, out);
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

/**
 * The on-screen width (half coverage to half coverage) of the lesson's rule
 * through the sheet's centre, where the water scales the ground by `squeeze`
 * across the stripes (above 1 crowds them, below 1 stretches them).
 */
const ruleWidthOnScreen = (squeeze: number, px: number): number => {
  const sample = fieldScratchJ();
  const out: [number, number, number] = [0, 0, 0];
  const band = PALETTE.paper[1] as number;
  const rule = PALETTE.rule[1] as number;
  let half = 0;
  for (let offset = 0; offset < 1; offset += px / 8) {
    Object.assign(sample, { kind: 'ground', x: 6, y: 8 + squeeze * offset, jxx: 1, jxy: 0, jyx: 0, jyy: squeeze });
    shadeSample(sample, LESSON.ground, PALETTE, px, out);
    if ((out[1] - band) / (rule - band) < 0.5) break;
    half = offset;
  }
  return 2 * half;
};

test('rules are ruled with a pen: near-constant weight on screen, strain shown only within bounds', () => {
  const px = 0.002;
  const period = LESSON.ground.period;
  const nominal = LOOK.ruleWidth * period;
  const near = (squeeze: number, want: number) => close(ruleWidthOnScreen(squeeze, px), want, px / 4, `squeezed ×${squeeze}`);
  near(1, nominal);
  near(0.1, LOOK.penMax * nominal); // stretched tenfold
  near(2, LOOK.penMin * nominal); // crowded twofold
  // Crowded until the stripes are tighter than the pen allows: the rule keeps to its share of the stripe.
  near(30, (LOOK.penShare * period) / 30);
});
