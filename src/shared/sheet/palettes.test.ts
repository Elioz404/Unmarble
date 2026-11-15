import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES } from './palettes.ts';
import { colorDistance, VISION_MODES } from './color.ts';

/** Legibility contract for every palette, in OKLab ΔE. */
const MIN_INK_SEPARATION = 0.14;
const MIN_INK_SEPARATION_CVD = 0.08;
const MIN_INK_TO_GROUND = 0.14;
const BAND_TO_PAPER = { min: 0.05, max: 0.09 };
const MIN_RULE_TO_PAPER = 0.24;

test('palette ids are unique and the catalogue covers four weeks', () => {
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length);
  assert.ok(PALETTES.length >= 28);
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

  test(`${palette.id}: inks stand out from the ground, and the ground reads as a ruler`, () => {
    for (const ink of palette.inks) {
      assert.ok(colorDistance(ink, palette.paper) >= MIN_INK_TO_GROUND);
      assert.ok(colorDistance(ink, palette.band) >= MIN_INK_TO_GROUND);
    }
    const band = colorDistance(palette.paper, palette.band);
    assert.ok(band >= BAND_TO_PAPER.min && band <= BAND_TO_PAPER.max, `band ΔE ${band.toFixed(3)}`);
    assert.ok(colorDistance(palette.paper, palette.rule) >= MIN_RULE_TO_PAPER);
  });
}
