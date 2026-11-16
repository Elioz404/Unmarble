import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySheet, dayPreview } from '../puzzle/daily.ts';
import { recipeById, recipeTag } from '../puzzle/recipes.ts';
import type { SheetResponse } from './api.ts';
import { parseSheetResponse } from './parse.ts';
import { parseDayPreview, parsePostBinding, parseSheetDescriptor } from './post-data.ts';

const SHEET = buildDailySheet('2026-12-03', 'seed', 'calendar', '2026-11-25');
const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** `value` as an old peer would send it, without `field`. */
const without = (value: object, field: string): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...value };
  delete copy[field];
  return copy;
};

const RESPONSE: SheetResponse = {
  sheet: SHEET,
  player: { signedIn: true, log: [], streak: 0, flair: false },
  standing: null,
  stats: { hands: 0, cleans: 0, caught: 0 },
  nextSheetAt: 0,
  todayId: SHEET.id,
  thread: null,
  yourTrap: null,
  tomorrow: dayPreview('calendar', '2026-12-04'),
};

test('a daily sheet carries its recipe through post data', () => {
  assert.ok(SHEET.recipe, 'a day after the first calendar version has a recipe');
  assert.deepEqual(parseSheetDescriptor(roundTrip(SHEET)), SHEET);
  assert.deepEqual(parsePostBinding(roundTrip({ kind: 'daily', sheet: SHEET })), { kind: 'daily', sheet: SHEET });
});

test('a sheet stored before recipes reads as having none', () => {
  assert.deepEqual(parseSheetDescriptor(roundTrip(without(SHEET, 'recipe'))), { ...SHEET, recipe: null });
});

test('malformed recipe tags are rejected', () => {
  const storm = recipeById('storm-4');
  assert.ok(storm);
  const tag = recipeTag(storm);
  const bad = [
    { ...tag, special: 'hurricane' },
    { ...tag, id: 'Not An Id' },
    { ...tag, title: '' },
    { ...tag, promise: 'x'.repeat(200) },
    { ...tag, special: undefined },
    'storm-4',
  ];
  for (const recipe of bad) assert.equal(parseSheetDescriptor(roundTrip({ ...SHEET, recipe })), null, JSON.stringify(recipe));
  assert.deepEqual(parseSheetDescriptor(roundTrip({ ...SHEET, recipe: tag }))?.recipe, tag);
});

test('practice sheets never come from the server', () => {
  assert.equal(parseSheetDescriptor(roundTrip({ ...SHEET, kind: 'practice' })), null);
  assert.equal(parsePostBinding(roundTrip({ kind: 'practice', sheet: SHEET })), null);
});

test('tomorrow’s preview parses, and an old server without one is still understood', () => {
  assert.deepEqual(parseSheetResponse(roundTrip(RESPONSE)), RESPONSE);
  assert.equal(parseSheetResponse(roundTrip(without(RESPONSE, 'tomorrow')))?.tomorrow, null);
});

test('a malformed preview is rejected', () => {
  const preview = RESPONSE.tomorrow;
  assert.ok(preview);
  for (const bad of [
    { ...preview, stars: 6 },
    { ...preview, stars: '2' },
    { ...preview, dateKey: '2026-02-31' },
    { ...preview, recipe: { id: 'x' } },
    { ...preview, promise: null },
  ]) {
    assert.equal(parseDayPreview(roundTrip(bad)), undefined, JSON.stringify(bad));
    assert.equal(parseSheetResponse(roundTrip({ ...RESPONSE, tomorrow: bad })), null);
  }
  const sunday = dayPreview('calendar', '2026-12-06');
  assert.deepEqual(parseDayPreview(roundTrip(sunday)), sunday);
  assert.equal(sunday.stars, null);
});
