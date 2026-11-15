import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSheet } from './generator.ts';
import { WEEKLY_TEMPLATES } from './templates.ts';
import { hasFeature } from './features.ts';
import { readSheet } from './analysis.ts';
import { parseSheetSpec } from './sheet.ts';
import { EVIDENCE } from '../config.ts';
import { PALETTES } from '../sheet/palettes.ts';

const SEEDS = ['alpha', 'beta', 'gamma'];

for (const template of WEEKLY_TEMPLATES) {
  test(`${template.id}: generated sheets honour the template and the golden rule`, () => {
    for (const seed of SEEDS) {
      const { spec } = generateSheet(seed, template, PALETTES[0]?.id ?? '');
      assert.ok(spec.moves.length >= template.moves[0] && spec.moves.length <= template.moves[1]);
      assert.equal(spec.moves[0]?.kind, 'drop');
      const reading = readSheet(spec.moves);
      for (const step of reading.steps) {
        assert.equal(step.evidence[step.top]?.strength, 0, 'top move is pristine');
        assert.ok(step.weakestCover >= Math.max(template.minMargin, EVIDENCE.safetyMargin));
      }
      for (const feature of template.features) {
        assert.ok(hasFeature(feature, spec.moves, reading, template.minMargin), `missing ${feature}`);
      }
      assert.deepEqual(parseSheetSpec(JSON.parse(JSON.stringify(spec))), spec, 'round-trips through JSON');
    }
  });
}

test('generation is deterministic in its seed', () => {
  const template = WEEKLY_TEMPLATES[4];
  if (!template) throw new Error('missing template');
  const a = generateSheet('same', template, 'cinnabar');
  const b = generateSheet('same', template, 'cinnabar');
  assert.deepEqual(a.spec, b.spec);
});
