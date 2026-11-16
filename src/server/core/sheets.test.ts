import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { recipeForDay } from '../../shared/puzzle/calendar-recipes.ts';
import { SUNDAY_PROMISE } from '../../shared/puzzle/recipes.ts';
import { addDays, weekdayOf, type DateKey } from '../../shared/time/calendar.ts';
import { keys } from './keys.ts';
import { SheetService } from './sheets.ts';
import { MemoryStore } from './store.ts';

const SECRET = 'a1'.repeat(32);
const SUNDAY = 0;
const noon = (dateKey: DateKey): number => Date.parse(`${dateKey}T12:00:00Z`);

const setup = async (start: DateKey) => {
  const clock = { now: noon(start) };
  const store = new MemoryStore();
  await store.set(keys.secret(), SECRET);
  return { clock, sheets: new SheetService(store, () => clock.now) };
};

/** Tomorrow's preview, then the sheet the server makes when tomorrow comes. */
const announcedThenMade = async (sheets: SheetService, clock: { now: number }, day: DateKey) => {
  clock.now = noon(day);
  const preview = await sheets.tomorrow();
  clock.now = noon(addDays(day, 1));
  return { preview, sheet: await sheets.todaySheet() };
};

test('tomorrow’s preview is the recipe the next day’s sheet uses', async () => {
  const start = '2026-11-30';
  const { clock, sheets } = await setup(start);
  for (let i = 0; i < 7; i++) {
    const { preview, sheet } = await announcedThenMade(sheets, clock, addDays(start, i));
    assert.equal(preview.dateKey, sheet.dateKey);
    assert.equal(preview.weekday, sheet.weekday);
    if (weekdayOf(sheet.dateKey) === SUNDAY) {
      assert.deepEqual(preview, { dateKey: sheet.dateKey, weekday: 'Sunday', stars: null, recipe: null, promise: SUNDAY_PROMISE });
      continue;
    }
    assert.ok(sheet.recipe, `${sheet.dateKey} has a recipe`);
    assert.deepEqual(preview.recipe, sheet.recipe);
    assert.equal(preview.promise, sheet.recipe.promise);
    assert.equal(preview.stars, sheet.spec.stars);
  }
});

test('a special day is announced with its own stars', async () => {
  // The service's calendar seed, recomputed here only to find the first special day ahead.
  const calendarSeed = createHmac('sha256', SECRET).update('calendar').digest('hex');
  let day: DateKey = '2026-11-30';
  while (!recipeForDay(calendarSeed, addDays(day, 1))?.special) day = addDays(day, 1);
  const { clock, sheets } = await setup(day);
  const { preview, sheet } = await announcedThenMade(sheets, clock, day);
  assert.ok(preview.recipe?.special, 'announced as a special');
  assert.deepEqual(preview.recipe, sheet.recipe);
  assert.equal(preview.stars, sheet.spec.stars);
});
