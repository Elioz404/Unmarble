import type { SheetDescriptor } from '../protocol/api.ts';
import { getPalette } from '../sheet/palettes.ts';
import { isDateKey, paletteIdForDay, sheetNumberOf, weekdayOf, type DateKey } from '../time/calendar.ts';
import { generateSheet } from './generator.ts';
import { templateForWeekday } from './templates.ts';

/**
 * The daily sheet: one per UTC day, identical for every player, generated
 * deterministically from the date and a secret seed (so it cannot be
 * predicted ahead of time from the public code).
 */

const ID_PREFIX = 'd-';

export const dailySheetId = (dateKey: DateKey): string => `${ID_PREFIX}${dateKey}`;

export const dateKeyOfSheetId = (id: string): DateKey | null => {
  if (!id.startsWith(ID_PREFIX)) return null;
  const key = id.slice(ID_PREFIX.length);
  return isDateKey(key) ? key : null;
};

/**
 * The daily sheet of `dateKey` in a community whose first sheet fell on
 * `firstDay` (which only sets its number).
 */
export const buildDailySheet = (
  dateKey: DateKey,
  seed: string,
  firstDay: DateKey,
  name: string | null = null,
): SheetDescriptor => {
  const number = sheetNumberOf(dateKey, firstDay);
  const template = templateForWeekday(weekdayOf(dateKey));
  const palette = getPalette(paletteIdForDay(dateKey));
  const { spec } = generateSheet(`${seed}:${dateKey}`, template, palette.id);
  return {
    id: dailySheetId(dateKey),
    kind: 'daily',
    author: null,
    number,
    dateKey,
    weekday: template.title,
    paletteName: palette.name,
    spec,
    name,
  };
};

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
  weekday: templateForWeekday(weekdayOf(dateKey)).title,
  paletteName: getPalette(trap.spec.paletteId).name,
  spec: trap.spec,
  name: null,
});
