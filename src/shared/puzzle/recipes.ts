import type { GroundFamily } from '../sheet/ground.ts';
import type { Feature } from './features.ts';
import type { Stars } from './sheet.ts';

/**
 * The recipe catalogue: what each day's sheet features, as pure data.
 *
 * Every weekday keeps its stars and its band of move counts, and rotates a
 * few recipes inside that band (see `calendar-recipes.ts`). Recipes of the
 * same weekday are mutually exclusive by construction: each has a signature
 * of required and forbidden features that no sheet of a sibling can satisfy.
 * Signatures use what a player sees first (what is on top, how deep a fold
 * lies, whether folds cross, twins, a false round); twists that most sheets
 * have anyway, such as rings and crescents, stay in the background.
 *
 * About one day in ten is a special with its own rule. Specials show the
 * stars of what they are, not of the weekday they replace.
 *
 * Every recipe except Ink Only defeats the "roundest drop fell last"
 * shortcut at least once. Ink Only is the declared exception: a rest day.
 */

export type SpecialId = 'ink-only' | 'folds-only' | 'storm';

export const SPECIAL_IDS: readonly SpecialId[] = ['ink-only', 'folds-only', 'storm'];

export type Recipe = {
  /** Stable, kebab-case; part of the generator's seed, so never renamed. */
  readonly id: string;
  /** The weekday it belongs to: 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
  readonly special: SpecialId | null;
  /** Public, Title Case, at most `RECIPE_TEXT.title` characters. */
  readonly title: string;
  /** Public: what a player can see, lower case, no final full stop, at most `RECIPE_TEXT.promise` characters. */
  readonly promise: string;
  readonly stars: Stars;
  readonly moves: readonly [min: number, max: number];
  readonly strokes: readonly [min: number, max: number];
  readonly swirls: readonly [min: number, max: number];
  readonly inks: number;
  /** All required. */
  readonly features: readonly Feature[];
  /** None may hold. */
  readonly forbid: readonly Feature[];
  readonly grounds: readonly GroundFamily[];
  /** Weakest covered mark allowed, in evidence strength. */
  readonly minMargin: number;
  /** Every drop falls before every fold (Folds Only). */
  readonly order?: 'drops-first';
  /** Every fold after the first follows the first one's heading. */
  readonly parallel?: boolean;
};

/** What a sheet carries about its recipe: enough to title and announce it. */
export type RecipeTag = {
  readonly id: string;
  readonly title: string;
  readonly promise: string;
  readonly special: SpecialId | null;
};

/**
 * What the generator reads from a recipe. The legacy weekly templates
 * (`templates.ts`) are one too, without the signature's extras.
 */
export type SheetTemplate = Pick<
  Recipe,
  'id' | 'title' | 'promise' | 'stars' | 'moves' | 'strokes' | 'swirls' | 'inks' | 'features' | 'grounds' | 'minMargin'
> &
  Partial<Pick<Recipe, 'forbid' | 'order' | 'parallel'>>;

/** Longest public strings: titles fit a post title, promises fit the teaser line, ids stay short in post data. */
export const RECIPE_TEXT = Object.freeze({ id: 24, title: 24, promise: 45 });

/** Ground families by liveliness: calm papers for easy days, lively ones for hard days. */
export const GROUNDS = Object.freeze({
  CALM: ['bands', 'combed'],
  RULED: ['bands', 'combed', 'grid'],
  ALL: ['bands', 'combed', 'grid', 'chevron', 'waves', 'rings'],
  LIVELY: ['waves', 'chevron', 'rings'],
} satisfies Record<string, readonly GroundFamily[]>);

/** What a weekday's recipes share: its difficulty, its paper and how many moves of each form. */
export type Band = Pick<Recipe, 'stars' | 'moves' | 'strokes' | 'swirls' | 'inks' | 'grounds' | 'minMargin'>;

/** Indexed by UTC weekday: 0 = Sunday … 6 = Saturday. */
const BANDS: readonly Band[] = [
  { stars: 3, moves: [5, 6], strokes: [1, 1], swirls: [1, 1], inks: 3, grounds: GROUNDS.ALL, minMargin: 1.4 },
  { stars: 1, moves: [4, 4], strokes: [1, 1], swirls: [0, 0], inks: 3, grounds: GROUNDS.CALM, minMargin: 2.4 },
  { stars: 2, moves: [5, 5], strokes: [1, 1], swirls: [0, 0], inks: 3, grounds: GROUNDS.RULED, minMargin: 2 },
  { stars: 2, moves: [5, 5], strokes: [2, 2], swirls: [0, 0], inks: 3, grounds: GROUNDS.RULED, minMargin: 1.7 },
  { stars: 3, moves: [6, 6], strokes: [1, 2], swirls: [0, 0], inks: 3, grounds: GROUNDS.ALL, minMargin: 1.25 },
  { stars: 4, moves: [6, 7], strokes: [1, 2], swirls: [1, 1], inks: 3, grounds: GROUNDS.ALL, minMargin: 1.25 },
  { stars: 5, moves: [7, 8], strokes: [2, 2], swirls: [1, 1], inks: 4, grounds: GROUNDS.LIVELY, minMargin: 1.2 },
];

export const bandForWeekday = (weekday: number): Band => {
  const band = BANDS[((weekday % 7) + 7) % 7];
  if (!band) throw new RangeError(`No band for weekday ${weekday}`);
  return band;
};

/** Twins are a reading of their own: only recipes that feature them allow them. */
const NO_TWINS: readonly Feature[] = ['twin-inks'];

type Overrides = Pick<Recipe, 'title' | 'promise' | 'features'> & Partial<Omit<Recipe, 'id' | 'weekday' | 'special'>>;

/** A weekday recipe: its band, overridden only where the catalogue says (always inside the band). */
const recipe = (weekday: number, id: string, overrides: Overrides): Recipe => ({
  id,
  weekday,
  special: null,
  forbid: NO_TWINS,
  ...bandForWeekday(weekday),
  ...overrides,
});

/** A special's tier on one weekday: its own rule, from that weekday's band (no unannounced twins either). */
const special = (weekday: number, id: string, kind: SpecialId, overrides: Overrides): Recipe => ({
  ...recipe(weekday, id, overrides),
  special: kind,
});

const STORM = { title: 'Storm', promise: 'two swirls, turning opposite ways' } as const;

/** Weekday recipes from Monday to Sunday, then the specials' tiers. */
export const RECIPES: readonly Recipe[] = [
  recipe(1, 'buried-fold', { title: 'Buried Fold', promise: 'the round drop, and one buried fold', features: ['top-drop', 'mid-seam'] }),
  recipe(1, 'old-fold', { title: 'Early Fold', promise: 'an early fold, bent by two drops', features: ['top-drop', 'deep-seam'] }),
  recipe(1, 'fold-on-top', { title: 'Last Fold', promise: 'nothing round on top: a fold came last', features: ['top-seam'] }),
  recipe(1, 'two-of-a-kind', {
    title: 'Two of a Kind',
    promise: 'two drops of one ink, side by side',
    features: ['top-drop', 'buried-seam', 'twin-inks'],
    forbid: [],
  }),

  // The crescent is honest but not what sets it apart: the mid-depth fold under a round top does.
  recipe(2, 'crescent', { title: 'Crescent', promise: 'a drop squeezed into a crescent', features: ['top-drop', 'mid-seam', 'crescent'] }),
  recipe(2, 'deep-fold', { title: 'Deep Fold', promise: 'an early fold, bent by three drops', features: ['top-drop', 'deep-seam'] }),
  recipe(2, 'fold-last', { title: 'Fold Last', promise: 'a fold drawn over everything', features: ['top-seam'] }),
  recipe(2, 'first-swirl', {
    title: 'First Swirl',
    promise: 'one gentle swirl, turned last',
    swirls: [1, 1],
    features: ['top-swirl', 'buried-seam'],
  }),

  recipe(3, 'crossed-folds', {
    title: 'Crossed Folds',
    promise: 'two folds crossing: which is on top?',
    features: ['fold-pair', 'crossed-seams'],
  }),
  recipe(3, 'old-and-new-fold', {
    title: 'Old Fold, New Fold',
    promise: 'a fold on top, another deep below',
    features: ['split-folds', 'crossed-seams'],
  }),
  recipe(3, 'two-buried-folds', {
    title: 'Two Buried Folds',
    promise: 'a round drop over two hidden folds',
    features: ['top-drop', 'two-buried-seams', 'crossed-seams'],
  }),
  // Crossed seams occur in most two-fold sheets, so only their absence is a recipe: the seams never
  // meet anywhere on the paper (which also rules out every crossed sibling).
  recipe(3, 'parallel-folds', {
    title: 'Parallel Folds',
    promise: 'two folds that never cross',
    parallel: true,
    features: [],
    forbid: ['twin-inks', 'seams-meet'],
  }),

  recipe(4, 'false-round', { title: 'False Round', promise: 'a drop that looks round but isn’t', features: ['top-seam', 'decoy'] }),
  recipe(4, 'swirl-false-round', {
    title: 'Swirl and False Round',
    promise: 'a swirl last, and a false round',
    strokes: [1, 1],
    swirls: [1, 1],
    features: ['top-swirl', 'buried-seam', 'swirl-decoy'],
  }),
  recipe(4, 'under-two-folds', {
    title: 'Under Two Folds',
    promise: 'the round drop hides two folds',
    strokes: [2, 2],
    features: ['top-drop', 'two-buried-seams'],
  }),
  recipe(4, 'oldest-fold', {
    title: 'Oldest Fold',
    promise: 'an early fold, bent by four drops',
    strokes: [1, 1],
    features: ['top-drop', 'deep-seam'],
    forbid: ['twin-inks', 'two-buried-seams'],
  }),

  recipe(5, 'twins', {
    title: 'Twins',
    promise: 'two drops of one ink, and a swirl',
    features: ['top-drop', 'buried-seam', 'twin-inks'],
    forbid: [],
  }),
  recipe(5, 'swirl-on-top', { title: 'Swirl on Top', promise: 'a swirl turned last, over the folds', features: ['top-swirl', 'buried-seam'] }),
  recipe(5, 'fold-over-swirl', { title: 'Fold Over a Swirl', promise: 'a fold drawn across a swirl', features: ['top-seam', 'buried-swirl'] }),
  recipe(5, 'buried-swirl', { title: 'Buried Swirl', promise: 'a round drop over a hidden swirl', features: ['top-drop', 'buried-seam'] }),

  recipe(6, 'full-set', { title: 'Full Set', promise: 'a fold last, an old fold, a false round', features: ['split-folds', 'decoy'] }),
  recipe(6, 'swirl-crown', { title: 'Swirl Crown', promise: 'a swirl turned last, over two folds', features: ['top-swirl', 'buried-seam'] }),
  recipe(6, 'two-last-folds', {
    title: 'Two Last Folds',
    promise: 'the last two moves were folds',
    features: ['fold-pair'],
    forbid: ['twin-inks', 'decoy'],
  }),
  recipe(6, 'saturday-twins', {
    title: 'Saturday Twins',
    promise: 'twins under two folds and a swirl',
    features: ['top-drop', 'buried-seam', 'twin-inks'],
    forbid: [],
  }),

  recipe(0, 'mixed', { title: 'Mixed Sheet', promise: 'a round drop over a fold and a swirl', features: ['top-drop', 'mid-seam'] }),
  recipe(0, 'mixed-old-fold', { title: 'Mixed, Early Fold', promise: 'an early fold, and a swirl', features: ['top-drop', 'deep-seam'] }),
  recipe(0, 'mixed-swirl-last', {
    title: 'Mixed, Swirl Last',
    promise: 'a buried fold, and a swirl on top',
    features: ['top-swirl', 'buried-seam'],
  }),
  recipe(0, 'mixed-fold-last', { title: 'Mixed, Fold Last', promise: 'a swirl, and a fold drawn last', features: ['top-seam'] }),
  recipe(0, 'mixed-twins', {
    title: 'Mixed Twins',
    promise: 'two of one ink, a fold and a swirl',
    features: ['top-drop', 'buried-seam', 'twin-inks'],
    forbid: [],
  }),

  // Drops only never fool the naive reader: a declared rest day, shown as one star, and longer rather than harder.
  special(1, 'ink-only', 'ink-only', {
    title: 'Ink Only',
    promise: 'a rest day: six drops, nothing else',
    moves: [6, 6],
    strokes: [0, 0],
    // Four inks for six drops: fewer same-ink pairs to fall side by side as unannounced twins.
    inks: 4,
    features: ['ink-only'],
  }),
  // Three folds lie outside every weekday band, so it never duplicates an ordinary recipe.
  special(4, 'folds-only', 'folds-only', {
    title: 'Folds Only',
    promise: 'the ink fell first, then three folds',
    strokes: [3, 3],
    grounds: GROUNDS.RULED,
    order: 'drops-first',
    features: ['folds-only'],
  }),
  special(5, 'storm-4', 'storm', { ...STORM, strokes: [1, 1], swirls: [2, 2], features: ['twin-swirls', 'opposite-swirls'] }),
  special(6, 'storm-5', 'storm', { ...STORM, strokes: [2, 2], swirls: [2, 2], features: ['twin-swirls', 'opposite-swirls'] }),
];

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export const recipeById = (id: string): Recipe | null => BY_ID.get(id) ?? null;

/** Every recipe of a difficulty: weekday recipes in weekday order (Monday first), then specials. */
export const recipesForStars = (stars: Stars): readonly Recipe[] => RECIPES.filter((r) => r.stars === stars);

/** A special's tier on a weekday, or null where that special does not fall. */
export const specialTier = (kind: SpecialId, weekday: number): Recipe | null =>
  RECIPES.find((r) => r.special === kind && r.weekday === weekday) ?? null;

export const recipeTag = (r: Recipe): RecipeTag => ({ id: r.id, title: r.title, promise: r.promise, special: r.special });

/**
 * A Sunday is announced generically: it may be a mixed sheet or the week's
 * best community trap, which is only decided on the day.
 */
export const SUNDAY_PROMISE = 'a mixed sheet, or the week’s best trap';
