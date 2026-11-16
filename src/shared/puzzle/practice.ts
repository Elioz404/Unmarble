import { Random } from '../math/random.ts';
import type { SheetDescriptor } from '../protocol/api.ts';
import { PALETTES } from '../sheet/palettes.ts';
import { weekdayNameOf, type DateKey } from '../time/calendar.ts';
import { searchSheet } from './generator.ts';
import { recipesForStars, recipeTag, type Recipe } from './recipes.ts';
import type { Stars } from './sheet.ts';

/**
 * Practice sheets: unlimited, made on the player's device from a random seed
 * with the same catalogue and the same contract as the daily sheets. They are
 * unranked, count toward no streak and are never sent to the server, which
 * rejects the `practice` kind in every payload it reads.
 */

/** What the player asked for: a difficulty, maybe one recipe of it, and the seed that makes the sheet. */
export type PracticeRequest = {
  readonly stars: Stars;
  /** One recipe of that difficulty, or null for any. */
  readonly recipeId: string | null;
  /** Hex, drawn on the device; the same request always makes the same sheet. */
  readonly seed: string;
};

/** A search for one practice sheet, run in slices: null until the sheet is found. */
export type PracticeSearch = { step(budgetMs: number): SheetDescriptor | null };

const ID_PREFIX = 'p-';

/**
 * The recipe a practice sheet follows: the one asked for, or one of the
 * difficulty's pool drawn from the seed, avoiding `avoid` (the recipe just
 * played) whenever the pool has another.
 */
export const practiceRecipe = (request: PracticeRequest, avoid: string | null): Recipe => {
  const pool = recipesForStars(request.stars);
  const asked = pool.find((r) => r.id === request.recipeId);
  if (asked) return asked;
  const fresh = pool.filter((r) => r.id !== avoid);
  return new Random(`${request.seed}:recipe`).pick(fresh.length > 0 ? fresh : pool);
};

/**
 * Searches for the practice sheet of `request` under `recipe`, dated `today`.
 * The random stream is fixed by the seed, so the sheet never depends on how
 * the search was sliced. Throws a `GenerationError` past the generator's limit.
 */
export const searchPractice = (
  request: PracticeRequest,
  recipe: Recipe,
  today: DateKey,
  clock?: () => number,
): PracticeSearch => {
  const palette = new Random(`${request.seed}:palette`).pick(PALETTES);
  const search = searchSheet(`practice:${request.seed}`, recipe, palette.id, clock);
  return {
    step: (budgetMs) => {
      const found = search.step(budgetMs);
      if (!found) return null;
      return {
        id: `${ID_PREFIX}${recipe.id}-${request.seed}`,
        kind: 'practice',
        author: null,
        // Practice sheets belong to no day of the calendar, so they have no sheet number.
        number: 0,
        dateKey: today,
        weekday: weekdayNameOf(today),
        paletteName: palette.name,
        spec: found.spec,
        name: null,
        recipe: recipeTag(recipe),
      };
    },
  };
};

/** The practice sheet of `request` under `recipe`, in one go (tests and tools). */
export const buildPracticeSheet = (request: PracticeRequest, recipe: Recipe, today: DateKey): SheetDescriptor => {
  const search = searchPractice(request, recipe, today);
  for (;;) {
    const sheet = search.step(Infinity);
    if (sheet) return sheet;
  }
};
