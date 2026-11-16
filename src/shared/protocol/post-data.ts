import type { DayPreview, SheetDescriptor } from './api.ts';
import { RECIPE_TEXT, SPECIAL_IDS, type RecipeTag } from '../puzzle/recipes.ts';
import { isStars, parseSheetSpec } from '../puzzle/sheet.ts';
import { isDateKey } from '../time/calendar.ts';

/**
 * What each post carries in its post data (≤ 2 KB, public). The in-feed card
 * renders from it with no network call, so the first paint is instant.
 *
 *  - a daily post is bound to one sheet forever, and so is a trap post;
 *  - the Atelier hub post always shows today's sheet (rewritten each night).
 */
export type PostBinding =
  | { readonly kind: 'daily'; readonly sheet: SheetDescriptor }
  | { readonly kind: 'trap'; readonly sheet: SheetDescriptor }
  | { readonly kind: 'atelier'; readonly sheet: SheetDescriptor | null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Recipe ids are kebab-case words. */
const RECIPE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isShortString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/** A recipe tag; null for a malformed one. */
const parseRecipeTag = (value: unknown): RecipeTag | null => {
  if (!isRecord(value)) return null;
  const { id, title, promise, special } = value;
  if (!isShortString(id, RECIPE_TEXT.id) || !RECIPE_ID.test(id)) return null;
  if (!isShortString(title, RECIPE_TEXT.title) || !isShortString(promise, RECIPE_TEXT.promise)) return null;
  const parsedSpecial = special === null ? null : SPECIAL_IDS.find((s) => s === special);
  if (parsedSpecial === undefined) return null;
  return { id, title, promise, special: parsedSpecial };
};

/** Tomorrow's preview as the server sends it; undefined when malformed. */
export const parseDayPreview = (value: unknown): DayPreview | undefined => {
  if (!isRecord(value)) return undefined;
  const { dateKey, weekday, stars, recipe, promise } = value;
  if (!isDateKey(dateKey) || typeof weekday !== 'string' || typeof promise !== 'string') return undefined;
  if (stars !== null && !isStars(stars)) return undefined;
  const parsedRecipe = recipe === null ? null : parseRecipeTag(recipe);
  if (recipe !== null && !parsedRecipe) return undefined;
  return { dateKey, weekday, stars, recipe: parsedRecipe, promise };
};

export const parseSheetDescriptor = (value: unknown): SheetDescriptor | null => {
  if (!isRecord(value)) return null;
  const { id, kind, author, number, dateKey, weekday, paletteName, spec, name, recipe } = value;
  const parsedSpec = parseSheetSpec(spec);
  // Practice sheets exist only on the device that made them: no payload may carry one.
  if (kind !== 'daily' && kind !== 'trap') return null;
  if (typeof id !== 'string' || typeof number !== 'number' || !isDateKey(dateKey)) return null;
  if (typeof weekday !== 'string' || typeof paletteName !== 'string' || !parsedSpec) return null;
  if (name !== null && typeof name !== 'string') return null;
  if (author !== null && typeof author !== 'string') return null;
  // Sheets stored before recipes carry no recipe field at all.
  const parsedRecipe = recipe === undefined || recipe === null ? null : parseRecipeTag(recipe);
  if (recipe !== undefined && recipe !== null && !parsedRecipe) return null;
  return { id, kind, author, number, dateKey, weekday, paletteName, spec: parsedSpec, name, recipe: parsedRecipe };
};

export const parsePostBinding = (value: unknown): PostBinding | null => {
  if (!isRecord(value)) return null;
  if (value.kind === 'daily' || value.kind === 'trap') {
    const sheet = parseSheetDescriptor(value.sheet);
    return sheet ? { kind: value.kind, sheet } : null;
  }
  if (value.kind === 'atelier') {
    return { kind: 'atelier', sheet: value.sheet === null ? null : parseSheetDescriptor(value.sheet) };
  }
  return null;
};
