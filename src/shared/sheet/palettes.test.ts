import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR } from '../config.ts';
import { addDays, paletteIdForDay } from '../time/calendar.ts';
import { getPalette, GROUND_VALUES, PALETTES } from './palettes.ts';
import { colorDistance, lightness, VISION_MODES } from './color.ts';

/** Legibility contract for every palette, in OKLab ΔE. */
const MIN_INK_SEPARATION = 0.14;
const MIN_INK_SEPARATION_CVD = 0.08;
const MIN_INK_TO_GROUND = 0.14;
const MIN_INK_TO_GROUND_CVD = 0.1;
const BAND_TO_PAPER = { min: 0.05, max: 0.09 };
const MIN_RULE_TO_PAPER = 0.24;
const MIN_RULE_TO_BAND = 0.18;
/** Tinting may only add chroma: each ground tone keeps its lightness, up to 8-bit rounding. */
const GROUND_LIGHTNESS_TOLERANCE = 0.003;

test('palette ids are unique and the catalogue covers four weeks', () => {
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length);
  assert.ok(PALETTES.length >= 28);
});

test('neighbouring days are printed on different stock', () => {
  for (let day = 0; day < PALETTES.length; day++) {
    const today = getPalette(paletteIdForDay(addDays(CALENDAR.paletteEpoch, day)));
    const tomorrow = getPalette(paletteIdForDay(addDays(CALENDAR.paletteEpoch, day + 1)));
    assert.notEqual(today.paper, tomorrow.paper, `${today.id} and ${tomorrow.id} share a stock`);
  }
});

for (const palette of PALETTES) {
  test(`${palette.id}: inks are distinct under every vision mode`, () => {
    for (const mode of VISION_MODES) {
      const floor = mode === 'normal' ? MIN_INK_SEPARATION : MIN_INK_SEPARATION_CVD;
      for (let i = 0; i < palette.inks.length; i++) {
        for (let j = i + 1; j < palette.inks.length; j++) {
          const d = colorDistance(palette.inks[i] as string, palette.inks[j] as string, mode);
          assert.ok(d >= floor, `${mode}: ink ${i} vs ${j} ΔE ${d.toFixed(3)} < ${floor}`);
        }
      }
    }
  });

  test(`${palette.id}: inks stand out from the ground under every vision mode`, () => {
    for (const mode of VISION_MODES) {
      const floor = mode === 'normal' ? MIN_INK_TO_GROUND : MIN_INK_TO_GROUND_CVD;
      palette.inks.forEach((ink, slot) => {
        for (const tone of ['paper', 'band'] as const) {
          const d = colorDistance(ink, palette[tone], mode);
          assert.ok(d >= floor, `${mode}: ink ${slot} vs ${tone} ΔE ${d.toFixed(3)} < ${floor}`);
        }
      });
    }
  });

  test(`${palette.id}: the ground reads as a ruler`, () => {
    const band = colorDistance(palette.paper, palette.band);
    assert.ok(band >= BAND_TO_PAPER.min && band <= BAND_TO_PAPER.max, `band ΔE ${band.toFixed(3)}`);
    assert.ok(colorDistance(palette.paper, palette.rule) >= MIN_RULE_TO_PAPER);
    assert.ok(colorDistance(palette.band, palette.rule) >= MIN_RULE_TO_BAND);
  });

  test(`${palette.id}: the stock keeps the shared ground lightnesses`, () => {
    for (const tone of ['paper', 'band', 'rule'] as const) {
      const offset = Math.abs(lightness(palette[tone]) - GROUND_VALUES[tone]);
      assert.ok(offset <= GROUND_LIGHTNESS_TOLERANCE, `${tone} L is off by ${offset.toFixed(4)}`);
    }
  });
}
