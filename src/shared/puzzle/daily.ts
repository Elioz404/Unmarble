import type { DayPreview, SheetDescriptor } from '../protocol/api.ts';
import { getPalette } from '../sheet/palettes.ts';
import { isDateKey, paletteIdForDay, sheetNumberOf, weekdayNameOf, weekdayOf, type DateKey } from '../time/calendar.ts';
import { recipeForDay } from './calendar-recipes.ts';
import { generateSheet } from './generator.ts';
import { recipeTag } from './recipes.ts';
import { templateForWeekday, templatePreview } from './templates.ts';

/**
 * The daily sheet: one per UTC day, identical for every player, generated
 * deterministically from the date and a secret seed (so it cannot be
 * predicted ahead of time from the public code).
 */

const ID_PREFIX = 'd-';
const SUNDAY = 0;

export const dailySheetId = (dateKey: DateKey): string => `${ID_PREFIX}${dateKey}`;

export const dateKeyOfSheetId = (id: string): DateKey | null => {
  if (!id.startsWith(ID_PREFIX)) return null;
  const key = id.slice(ID_PREFIX.length);
  return isDateKey(key) ? key : null;
};

/**
 * The daily sheet of `dateKey` in a community whose first sheet fell on
 * `firstDay` (which only sets its number). `seed` is the day's secret seed;
 * `calendarSeed` decides its recipe (the legacy weekly template before the
 * first calendar version).
 */
export const buildDailySheet = (dateKey: DateKey, seed: string, calendarSeed: string, firstDay: DateKey): SheetDescriptor => {
  const recipe = recipeForDay(calendarSeed, dateKey);
  const palette = getPalette(paletteIdForDay(dateKey));
  const { spec } = generateSheet(`${seed}:${dateKey}`, recipe ?? templateForWeekday(weekdayOf(dateKey)), palette.id);
  return {
    id: dailySheetId(dateKey),
    kind: 'daily',
    author: null,
    number: sheetNumberOf(dateKey, firstDay),
    dateKey,
    weekday: weekdayNameOf(dateKey),
    paletteName: palette.name,
    spec,
    name: null,
    recipe: recipe ? recipeTag(recipe) : null,
  };
};

/**
 * What a day will ask, announced the day before: its recipe, with its own
 * stars. A Sunday's recipe is kept for the day (it may be the week's trap).
 */
export const dayPreview = (calendarSeed: string, dateKey: DateKey): DayPreview => {
  const recipe = weekdayOf(dateKey) === SUNDAY ? null : recipeForDay(calendarSeed, dateKey);
  if (!recipe) return templatePreview(dateKey);
  return { dateKey, weekday: weekdayNameOf(dateKey), stars: recipe.stars, recipe: recipeTag(recipe), promise: recipe.promise };
};

/** A Sunday that no trap qualified for: the mixed sheet the generator made instead of a featured trap. */
export const isMixedSunday = (sheet: SheetDescriptor): boolean =>
  sheet.kind === 'daily' && sheet.author === null && weekdayOf(sheet.dateKey) === SUNDAY;

/**
 * A Sunday sheet chosen from the community: the week's best trap, republished
 * as the daily sheet with its maker credited.
 */
export const featuredDailySheet = (dateKey: DateKey, trap: SheetDescriptor, firstDay: DateKey): SheetDescriptor => ({
  id: dailySheetId(dateKey),
  kind: 'daily',
  author: trap.author,
  number: sheetNumberOf(dateKey, firstDay),
  dateKey,
  weekday: weekdayNameOf(dateKey),
  paletteName: getPalette(trap.spec.paletteId).name,
  spec: trap.spec,
  name: null,
  recipe: null,
});
