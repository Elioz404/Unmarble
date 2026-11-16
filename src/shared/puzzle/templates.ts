import type { DayPreview } from '../protocol/api.ts';
import { weekdayNameOf, weekdayOf, type DateKey } from '../time/calendar.ts';
import { GROUNDS, SUNDAY_PROMISE, type SheetTemplate } from './recipes.ts';

/**
 * The weekly templates sheets were made from before recipes (see
 * `recipes.ts`): one fixed template per weekday. They still decide the days
 * before the first calendar version, and the "tomorrow" teaser of a client
 * talking to a server that does not announce it yet. Frozen: never edited.
 */
const { CALM, RULED, ALL, LIVELY } = GROUNDS;

/**
 * Indexed by UTC weekday: 0 = Sunday … 6 = Saturday. The week climbs from one
 * drop-and-fold reading on Monday to every form at once on Saturday; swirls
 * arrive late in the week, once the basic readings are warm.
 */
export const WEEKLY_TEMPLATES: readonly SheetTemplate[] = [
  { id: 'sunday', title: 'Sunday', promise: 'a mixed sheet, or the week’s best trap', stars: 3, moves: [5, 6], strokes: [1, 1], swirls: [1, 1], inks: 3, features: ['buried-seam', 'crescent'], grounds: ALL, minMargin: 1.4 },
  { id: 'monday', title: 'Monday', promise: 'the round drop, and one buried fold', stars: 1, moves: [4, 4], strokes: [1, 1], swirls: [0, 0], inks: 3, features: ['buried-seam'], grounds: CALM, minMargin: 2.4 },
  { id: 'tuesday', title: 'Tuesday', promise: 'a drop squeezed into a crescent', stars: 2, moves: [5, 5], strokes: [1, 1], swirls: [0, 0], inks: 3, features: ['buried-seam', 'crescent'], grounds: RULED, minMargin: 2 },
  { id: 'wednesday', title: 'Wednesday', promise: 'two folds crossing: which is on top?', stars: 2, moves: [5, 5], strokes: [2, 2], swirls: [0, 0], inks: 3, features: ['crossed-seams'], grounds: RULED, minMargin: 1.7 },
  { id: 'thursday', title: 'Thursday', promise: 'a fold on top, and a drop that only looks round', stars: 3, moves: [6, 6], strokes: [1, 2], swirls: [0, 0], inks: 3, features: ['top-seam', 'decoy'], grounds: ALL, minMargin: 1.25 },
  { id: 'friday', title: 'Friday', promise: 'two drops of the same ink, and a swirl', stars: 4, moves: [6, 7], strokes: [1, 2], swirls: [1, 1], inks: 3, features: ['twin-inks', 'buried-seam'], grounds: ALL, minMargin: 1.25 },
  { id: 'saturday', title: 'Saturday', promise: 'everything at once', stars: 5, moves: [7, 8], strokes: [2, 2], swirls: [1, 1], inks: 4, features: ['top-seam', 'decoy', 'crescent'], grounds: LIVELY, minMargin: 1.2 },
];

export const templateForWeekday = (weekday: number): SheetTemplate => {
  const template = WEEKLY_TEMPLATES[((weekday % 7) + 7) % 7];
  if (!template) throw new RangeError(`No template for weekday ${weekday}`);
  return template;
};

const SUNDAY = 0;

/**
 * What a day asks under the weekly templates. A Sunday stays generic: it may
 * be the week's best trap, decided only on the day, at its own difficulty.
 */
export const templatePreview = (dateKey: DateKey): DayPreview => {
  const weekday = weekdayNameOf(dateKey);
  if (weekdayOf(dateKey) === SUNDAY) return { dateKey, weekday, stars: null, recipe: null, promise: SUNDAY_PROMISE };
  const template = templateForWeekday(weekdayOf(dateKey));
  return { dateKey, weekday, stars: template.stars, recipe: null, promise: template.promise };
};
