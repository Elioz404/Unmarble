import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSheet, GenerationError, searchSheet, validateSheet } from './generator.ts';
import { recipeById, type Recipe } from './recipes.ts';
import { WEEKLY_TEMPLATES } from './templates.ts';
import { PALETTES } from '../sheet/palettes.ts';

const PALETTE = PALETTES[0]?.id ?? '';

const recipe = (id: string): Recipe => {
  const found = recipeById(id);
  if (!found) throw new Error(`missing recipe ${id}`);
  return found;
};

// The per-recipe contract is checked in `recipes.test.ts`.

test('generation is deterministic in its seed', () => {
  const twins = recipe('twins');
  assert.deepEqual(generateSheet('same', twins, PALETTE).spec, generateSheet('same', twins, PALETTE).spec);
  assert.notDeepEqual(generateSheet('same', twins, PALETTE).spec, generateSheet('other', twins, PALETTE).spec);
});

test('a search sliced into small budgets finds the same sheet as one run', () => {
  const fullSet = recipe('full-set');
  const whole = generateSheet('sliced', fullSet, PALETTE);
  // A clock that advances a millisecond per reading: every slice ends after a candidate or two.
  let now = 0;
  const search = searchSheet('sliced', fullSet, PALETTE, () => now++);
  let slices = 0;
  let found = null;
  while (!found) {
    found = search.step(1);
    slices++;
  }
  assert.ok(slices > 1, 'the work was sliced');
  assert.equal(search.attempts, whole.attempts);
  assert.deepEqual(found.spec, whole.spec);
  assert.equal(search.step(1), found, 'a finished search keeps its sheet');
});

test('a search gives up with a GenerationError', () => {
  // Three folds cannot fit in two moves.
  const impossible: Recipe = { ...recipe('fold-last'), id: 'impossible', moves: [2, 2], strokes: [3, 3] };
  assert.throws(() => searchSheet('never', impossible, PALETTE).step(Infinity), GenerationError);
});

test('the weekly templates still generate the days before recipes', () => {
  for (const template of WEEKLY_TEMPLATES) {
    for (const seed of ['alpha', 'beta']) {
      const { spec, reading } = generateSheet(seed, template, PALETTE);
      assert.ok(spec.moves.length >= template.moves[0] && spec.moves.length <= template.moves[1], template.id);
      assert.equal(spec.stars, template.stars);
      assert.ok(reading.naiveFailures >= 1, `${template.id} defeats the roundest-drop shortcut`);
      assert.ok(validateSheet(spec.moves, spec.ground, template), `${template.id} passes the contract`);
    }
  }
});
