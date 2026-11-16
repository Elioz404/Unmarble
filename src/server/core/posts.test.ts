import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SheetDescriptor } from '../../shared/protocol/api.ts';
import { recipeById, recipeTag } from '../../shared/puzzle/recipes.ts';
import { fallbackText, sheetTitle } from './posts.ts';

const tagOf = (id: string) => {
  const recipe = recipeById(id);
  if (!recipe) throw new Error(`missing recipe ${id}`);
  return recipeTag(recipe);
};

const sheet = (overrides: Partial<SheetDescriptor>): SheetDescriptor => ({
  id: 'd-2026-12-01',
  kind: 'daily',
  author: null,
  number: 12,
  dateKey: '2026-12-01',
  weekday: 'Tuesday',
  paletteName: 'Harbor Cobalt',
  spec: {
    paletteId: 'harbor-cobalt',
    ground: { family: 'bands', period: 1.3, angle: 0, amplitude: 0, wavelength: 6 },
    moves: [{ kind: 'drop', x: 6, y: 8, size: 'L', ink: 0 }],
    stars: 2,
  },
  name: null,
  recipe: tagOf('deep-fold'),
  ...overrides,
});

test('a daily post is titled by its recipe', () => {
  assert.equal(sheetTitle(sheet({})), 'Sheet No. 12 · Tuesday ★★ · Deep Fold');
});

test('a special day’s title carries its mark and its own stars', () => {
  const inkOnly = sheet({ number: 40, weekday: 'Monday', recipe: tagOf('ink-only'), spec: { ...sheet({}).spec, stars: 1 } });
  assert.equal(sheetTitle(inkOnly), 'Sheet No. 40 · Monday ★ · ✦ Ink Only');
});

test('a featured Sunday credits its maker', () => {
  const featured = sheet({ weekday: 'Sunday', author: 'marbler', recipe: null, spec: { ...sheet({}).spec, stars: 4 } });
  assert.equal(sheetTitle(featured), 'Sheet No. 12 · Sunday ★★★★ · the week’s best trap, set by u/marbler');
});

test('a sheet from before recipes names its colourway', () => {
  assert.equal(sheetTitle(sheet({ recipe: null })), 'Sheet No. 12 · Tuesday ★★ · Harbor Cobalt');
});

test('the fallback text states the recipe’s promise when there is one', () => {
  assert.match(fallbackText(sheet({})), /\*Deep Fold\*: an early fold, bent by three drops\./);
  assert.doesNotMatch(fallbackText(sheet({ recipe: null })), /\*.*\*:/);
});
