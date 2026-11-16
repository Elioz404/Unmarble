import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePostBinding, parseSheetDescriptor } from '../protocol/post-data.ts';
import { matchesSignature } from './features.ts';
import { validateSheet } from './generator.ts';
import { buildPracticeSheet, practiceRecipe, searchPractice, type PracticeRequest } from './practice.ts';
import { recipeById, recipesForStars } from './recipes.ts';
import { STARS, type Stars } from './sheet.ts';

const SHEETS_PER_LEVEL = 20;
const TODAY = '2026-12-03';
const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const request = (stars: Stars, i: number, recipeId: string | null = null): PracticeRequest => ({
  stars,
  recipeId,
  seed: `${stars}0${i.toString(16).padStart(14, '0')}`,
});

for (const stars of STARS) {
  test(`${stars}-star practice sheets are fair and honour their recipe`, () => {
    const used = new Set<string>();
    for (let i = 0; i < SHEETS_PER_LEVEL; i++) {
      const asked = request(stars, i);
      const recipe = practiceRecipe(asked, null);
      assert.equal(recipe.stars, stars);
      used.add(recipe.id);
      const sheet = buildPracticeSheet(asked, recipe, TODAY);
      assert.equal(sheet.kind, 'practice');
      assert.equal(sheet.spec.stars, stars);
      assert.equal(sheet.recipe?.id, recipe.id);
      const reading = validateSheet(sheet.spec.moves, sheet.spec.ground, recipe);
      assert.ok(reading, `${sheet.id} passes the full contract`);
      assert.ok(matchesSignature(recipe, sheet.spec.moves, reading), `${sheet.id} honours its signature`);
    }
    assert.ok(used.size > 1, 'any recipe draws more than one');
  });
}

test('a practice request is deterministic in its seed, however the search is sliced', () => {
  const asked = request(4, 7);
  const recipe = practiceRecipe(asked, null);
  const whole = buildPracticeSheet(asked, recipe, TODAY);
  // A clock that runs out at once: every slice tries a single candidate.
  const search = searchPractice(asked, recipe, TODAY, () => 0);
  let sliced = search.step(0);
  while (!sliced) sliced = search.step(0);
  assert.deepEqual(sliced, whole);
});

test('a chosen recipe is honoured, and "any" avoids the one just played', () => {
  const storm = recipeById('storm-4');
  assert.ok(storm);
  assert.equal(practiceRecipe(request(4, 1, 'storm-4'), null), storm);
  // A recipe of another difficulty is not a choice there: any of the level instead.
  assert.equal(practiceRecipe(request(2, 1, 'storm-4'), null).stars, 2);
  for (const stars of STARS) {
    for (const last of recipesForStars(stars)) {
      for (let i = 0; i < 5; i++) assert.notEqual(practiceRecipe(request(stars, i), last.id).id, last.id);
    }
  }
});

test('the server never accepts a practice sheet', () => {
  const asked = request(3, 2);
  const sheet = roundTrip(buildPracticeSheet(asked, practiceRecipe(asked, null), TODAY));
  assert.equal(parseSheetDescriptor(sheet), null);
  assert.equal(parsePostBinding({ kind: 'practice', sheet }), null);
  assert.equal(parsePostBinding({ kind: 'daily', sheet }), null);
});
