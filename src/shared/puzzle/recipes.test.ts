import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVIDENCE, GENERATION } from '../config.ts';
import { PALETTES } from '../sheet/palettes.ts';
import { readSheet } from './analysis.ts';
import { FEATURES, hasNestedInk, hasTwinInks, matchesSignature } from './features.ts';
import { generateSheet, validateSheet, type GeneratedSheet } from './generator.ts';
import { gesturesAreSeparable } from './gesture-contract.ts';
import {
  bandForWeekday,
  RECIPE_TEXT,
  RECIPES,
  recipeById,
  recipesForStars,
  recipeTag,
  SPECIAL_IDS,
  type Recipe,
} from './recipes.ts';
import { parseSheetSpec } from './sheet.ts';

const SUNDAY = 0;
const TUESDAY = 2;
const SEEDS = ['alpha', 'beta', 'gamma', 's8', 's10', 's12', 'q18', 'r21', 'k3', 'z9'];
/** Two recipes of a weekday are distinct when few of one's sheets would pass for the other. */
const MAX_OVERLAP = 0.3;

const weekdayRecipes = RECIPES.filter((r) => r.special === null);

/** Ten sheets per recipe, generated once for every test below. */
const sheets = new Map<string, readonly GeneratedSheet[]>(
  RECIPES.map((r) => [r.id, SEEDS.map((seed) => generateSheet(seed, r, PALETTES[0]?.id ?? ''))]),
);
const sheetsOf = (r: Recipe): readonly GeneratedSheet[] => sheets.get(r.id) ?? [];

const recipe = (id: string): Recipe => {
  const found = recipeById(id);
  if (!found) throw new Error(`missing recipe ${id}`);
  return found;
};

test('recipe ids are unique and found by id', () => {
  assert.equal(new Set(RECIPES.map((r) => r.id)).size, RECIPES.length);
  for (const r of RECIPES) assert.equal(recipeById(r.id), r);
  assert.equal(recipeById('no-such-recipe'), null);
});

test('Monday to Saturday rotate 4 recipes, Sunday 5, and Tuesday 5 with Stone', () => {
  for (let weekday = 0; weekday < 7; weekday++) {
    assert.equal(weekdayRecipes.filter((r) => r.weekday === weekday).length, weekday === SUNDAY || weekday === TUESDAY ? 5 : 4);
  }
});

test('recipes keep their weekday’s stars and move counts; Ink Only alone leaves the band', () => {
  const inside = ([min, max]: readonly [number, number], [bandMin, bandMax]: readonly [number, number]) =>
    min >= bandMin && max <= bandMax;
  for (const r of RECIPES) {
    const band = bandForWeekday(r.weekday);
    if (r.special === null) assert.equal(r.stars, band.stars, `${r.id} stars`);
    if (r.id === 'ink-only') {
      assert.deepEqual(r.moves, [6, 6], 'a rest day: six drops');
      assert.deepEqual(r.strokes, [0, 0]);
    } else {
      assert.ok(inside(r.moves, band.moves), `${r.id} moves`);
    }
  }
});

test('public strings fit where they are shown', () => {
  for (const r of RECIPES) {
    assert.ok(r.title.length <= RECIPE_TEXT.title, `${r.id} title`);
    assert.ok(r.promise.length <= RECIPE_TEXT.promise, `${r.id} promise`);
    assert.ok(r.id.length <= RECIPE_TEXT.id, `${r.id} id`);
    assert.ok(!r.promise.endsWith('.'), `${r.id} promise has no final full stop`);
    assert.deepEqual(recipeTag(r), { id: r.id, title: r.title, promise: r.promise, special: r.special });
  }
});

test('every feature a recipe names is one the detectors know', () => {
  for (const r of RECIPES) {
    for (const f of [...r.features, ...r.forbid]) assert.ok(FEATURES.includes(f), `${r.id}: ${f}`);
  }
});

test('specials never fall on a Sunday, and each has a tier', () => {
  for (const kind of SPECIAL_IDS) assert.ok(RECIPES.some((r) => r.special === kind), kind);
  for (const r of RECIPES) if (r.special !== null) assert.notEqual(r.weekday, SUNDAY, r.id);
});

test('practice pools by difficulty: weekday recipes first, then specials', () => {
  const sizes = [1, 2, 3, 4, 5].map((stars) => recipesForStars(stars as 1 | 2 | 3 | 4 | 5).length);
  assert.deepEqual(sizes, [5, 9, 10, 5, 5]);
  const threeStars = recipesForStars(3).map((r) => r.id);
  assert.deepEqual(threeStars.slice(0, 4), RECIPES.filter((r) => r.weekday === 4 && !r.special).map((r) => r.id));
  assert.equal(threeStars.at(-1), 'folds-only');
});

for (const r of RECIPES) {
  test(`${r.id}: sheets are fair, readable and honour the recipe`, () => {
    for (const { spec, reading } of sheetsOf(r)) {
      assert.ok(spec.moves.length >= r.moves[0] && spec.moves.length <= r.moves[1], 'move count');
      assert.equal(spec.moves[0]?.kind, 'drop');
      assert.equal(spec.stars, r.stars);
      assert.ok(r.grounds.includes(spec.ground.family), 'ground');
      for (const step of readSheet(spec.moves).steps) {
        assert.equal(step.evidence[step.top]?.strength, 0, 'top move is pristine');
        assert.ok(step.weakestCover >= Math.max(r.minMargin, EVIDENCE.safetyMargin));
      }
      assert.ok(matchesSignature(r, spec.moves, reading), 'required features present, forbidden ones absent');
      if (!r.features.includes('twin-inks')) assert.ok(!hasTwinInks(spec.moves), 'no twins that nobody announced');
      assert.ok(validateSheet(spec.moves, spec.ground, r), 'passes the full contract again');
      assert.ok(gesturesAreSeparable(spec.moves), 'every top move can be undone unambiguously');
      assert.deepEqual(parseSheetSpec(JSON.parse(JSON.stringify(spec))), spec, 'round-trips through JSON');
      if (r.id === 'ink-only') assert.equal(reading.naiveFailures, 0, 'the declared rest day');
      else assert.ok(reading.naiveFailures >= 1, 'defeats the roundest-drop shortcut');
    }
  });
}

test('recipes of the same weekday are distinct', () => {
  for (let weekday = 0; weekday < 7; weekday++) {
    const siblings = weekdayRecipes.filter((r) => r.weekday === weekday);
    for (const a of siblings) {
      for (const b of siblings) {
        if (a === b) continue;
        const own = sheetsOf(a);
        const share = own.filter((g) => matchesSignature(b, g.spec.moves, g.reading)).length / own.length;
        assert.ok(share < MAX_OVERLAP, `${Math.round(share * 100)}% of ${a.id} sheets pass for ${b.id}`);
      }
    }
  }
});

test('Stone: a bullseye of three inks, each drop within the one before, under a fold', () => {
  for (const { spec } of sheetsOf(recipe('stone'))) {
    const nest = spec.moves.slice(0, GENERATION.nestSizes.length);
    assert.deepEqual(
      nest.map((m) => (m.kind === 'drop' ? m.size : m.kind)),
      [...GENERATION.nestSizes],
      'the bullseye falls first, outermost first',
    );
    assert.equal(new Set(nest.map((m) => (m.kind === 'drop' ? m.ink : -1))).size, nest.length, 'one ink per ring');
    assert.equal(spec.moves.at(-1)?.kind, 'stroke');
  }
});

test('a bullseye needs every drop wholly within the one before', () => {
  const drop = (x: number, size: 'S' | 'M' | 'L', ink: 0 | 1 | 2) => ({ kind: 'drop', x, y: 8, size, ink }) as const;
  assert.ok(hasNestedInk([drop(6, 'L', 0), drop(6.5, 'M', 1), drop(6.5, 'S', 2)]));
  // The same drops, the middle one only overlapping the edge: a crescent, not a ring.
  assert.ok(!hasNestedInk([drop(6, 'L', 0), drop(8, 'M', 1), drop(8, 'S', 2)]));
  // Two rings are not yet a bullseye.
  assert.ok(!hasNestedInk([drop(6, 'L', 0), drop(6.5, 'M', 1)]));
});
