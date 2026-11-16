import { ROTATION } from '../config.ts';
import { Random } from '../math/random.ts';
import { dateKeyOfDay, dayNumberOf, weekdayOf, type DateKey } from '../time/calendar.ts';
import { recipeById, specialTier, type Recipe, type SpecialId } from './recipes.ts';

/**
 * Which recipe each day features: pure and deterministic in a calendar seed
 * and the date, and it costs no generation.
 *
 * The calendar seed is derived from the installation secret on the server
 * (never the day seed), so announcing recipes reveals nothing about a sheet.
 *
 *  - Each weekday walks its own chain of recipes, one per week, never
 *    repeating one within 3 consecutive weeks, and favouring the ones it
 *    has not seen for longest.
 *  - Special days fall one per block of 8–12 days (the lengths come from the
 *    seed), never on a Sunday, never on a block's first or last day (so at
 *    least 3 days apart), never the same special twice in a row, and never
 *    on a weekday that showed the same special within 3 weeks. Weekdays
 *    behind on specials are favoured, so specials spread evenly over their
 *    weekdays. A special overrides its day without consuming the weekday's
 *    chain.
 *
 * The catalogue can change without breaking those rules: a change appends a
 * version starting at least two days after its deploy (so an announced
 * "tomorrow" never changes), and each version hands its last recipes per
 * weekday, and its last special, to the next. Old versions stay here, frozen,
 * so the past calendar stays reproducible.
 */
export type CalendarVersion = {
  /** The first day this version decides. */
  readonly from: DateKey;
  /** Recipe ids per weekday (0 = Sunday … 6 = Saturday), in this order. */
  readonly weekdays: Readonly<Record<number, readonly string[]>>;
  readonly specials: readonly SpecialId[];
};

/**
 * Sorted by `from`. Frozen once a version's `from` has passed: append, never edit.
 * A new version's `from` is its deploy day + `ROTATION.versionLeadDays` or later;
 * `npm run deploy` refuses to upload one that starts sooner (`tools/check-calendar.ts`).
 */
export const CALENDAR_VERSIONS: readonly CalendarVersion[] = [
  {
    from: '2026-11-18',
    weekdays: {
      0: ['mixed', 'mixed-old-fold', 'mixed-swirl-last', 'mixed-fold-last', 'mixed-twins'],
      1: ['buried-fold', 'old-fold', 'fold-on-top', 'two-of-a-kind'],
      2: ['crescent', 'deep-fold', 'fold-last', 'first-swirl'],
      3: ['crossed-folds', 'old-and-new-fold', 'two-buried-folds', 'parallel-folds'],
      4: ['false-round', 'swirl-false-round', 'under-two-folds', 'oldest-fold'],
      5: ['twins', 'swirl-on-top', 'fold-over-swirl', 'buried-swirl'],
      6: ['full-set', 'swirl-crown', 'two-last-folds', 'saturday-twins'],
    },
    specials: ['ink-only', 'folds-only', 'storm'],
  },
];

const WEEK = 7;
const SUNDAY = 0;

/** One block of days holding at most one special day. */
type Block = {
  readonly start: number;
  readonly length: number;
  /** The special day in it (a day number) and the tier it shows, if any. */
  readonly special: { readonly kind: SpecialId; readonly day: number; readonly recipeId: string } | null;
};

/** Everything walked so far for one seed and one list of versions: chains per (version, weekday), blocks per version. */
type Walk = { readonly chains: Map<string, string[]>; readonly blocks: Map<number, Block[]> };

const walks = new WeakMap<readonly CalendarVersion[], Map<string, Walk>>();

const walkOf = (seed: string, versions: readonly CalendarVersion[]): Walk => {
  let bySeed = walks.get(versions);
  if (!bySeed) {
    bySeed = new Map();
    walks.set(versions, bySeed);
  }
  let walk = bySeed.get(seed);
  if (!walk) {
    walk = { chains: new Map(), blocks: new Map() };
    bySeed.set(seed, walk);
  }
  return walk;
};

const versionStart = (versions: readonly CalendarVersion[], k: number): number =>
  dayNumberOf((versions[k] as CalendarVersion).from);

const versionEnd = (versions: readonly CalendarVersion[], k: number): number =>
  k + 1 < versions.length ? versionStart(versions, k + 1) : Infinity;

/** The version deciding a day, or -1 before the first one. */
const versionAt = (versions: readonly CalendarVersion[], day: number): number =>
  versions.reduce((found, _, k) => (versionStart(versions, k) <= day ? k : found), -1);

/** Weighted pick of one of `candidates` (never empty): each weighs `weightOf` it. */
const weightedPick = <T>(rng: Random, candidates: readonly T[], weightOf: (candidate: T) => number): T => {
  const total = candidates.reduce((sum, c) => sum + weightOf(c), 0);
  let u = rng.next() * total;
  for (const candidate of candidates) {
    u -= weightOf(candidate);
    if (u < 0) return candidate;
  }
  return candidates[candidates.length - 1] as T;
};

const weekdayOfDay = (day: number): number => weekdayOf(dateKeyOfDay(day));

/** The first day number on or after `day` that falls on `weekday`. */
const firstOnWeekday = (day: number, weekday: number): number => day + ((weekday - weekdayOfDay(day) + WEEK) % WEEK);

/**
 * A weekday's history up to `until` (a day number) under version `k`: the
 * previous version's last recipes on that weekday (they carry the no-repeat
 * rule across a catalogue change), then one recipe id per occurrence of the
 * weekday in version `k`. Its last entry is the recipe of `until`'s week.
 */
const historyOf = (
  seed: string,
  versions: readonly CalendarVersion[],
  k: number,
  weekday: number,
  until: number,
): readonly string[] => {
  const walk = walkOf(seed, versions);
  const key = `${k}:${weekday}`;
  let chain = walk.chains.get(key);
  if (!chain) {
    chain = [];
    walk.chains.set(key, chain);
  }
  const first = firstOnWeekday(versionStart(versions, k), weekday);
  const ids = (versions[k] as CalendarVersion).weekdays[weekday] ?? [];
  const handoff = k > 0 ? historyOf(seed, versions, k - 1, weekday, first - WEEK).slice(-ROTATION.noRepeat) : [];
  while (first + WEEK * chain.length <= until) {
    const history = [...handoff, ...chain];
    const recent = history.slice(-ROTATION.noRepeat);
    const candidates = ids.filter((id) => !recent.includes(id));
    // The longer a recipe has rested, the likelier it returns.
    const age = (id: string) => {
      const lastUse = history.lastIndexOf(id);
      return lastUse < 0 ? ROTATION.maxAgeWeight : Math.min(ROTATION.maxAgeWeight, history.length - lastUse);
    };
    chain.push(weightedPick(new Random(`${seed}:recipe:${k}:${weekday}:${chain.length}`), candidates, age));
  }
  const weeks = Math.max(0, Math.floor((until - first) / WEEK) + 1);
  return [...handoff, ...chain.slice(0, weeks)];
};

type SpecialDay = NonNullable<Block['special']>;

/**
 * The specials of version `k`'s `blocks` (newest first), then the previous
 * versions', back to the first one that falls before `since` (a day number).
 * That one is still included, so the newest special is always there.
 */
const specialsSince = (
  seed: string,
  versions: readonly CalendarVersion[],
  k: number,
  blocks: readonly Block[],
  since: number,
): SpecialDay[] => {
  const found: SpecialDay[] = [];
  for (let b = blocks.length - 1; b >= 0; b--) {
    const special = blocks[b]?.special;
    if (!special) continue;
    found.push(special);
    if (special.day < since) return found;
  }
  if (k === 0) return found;
  const earlier = blocksOf(seed, versions, k - 1, versionStart(versions, k) - 1);
  return [...found, ...specialsSince(seed, versions, k - 1, earlier, since)];
};

/** A day that may hold a special, and a special it may hold. */
type SpecialOption = { readonly day: number; readonly kind: SpecialId };

/** How many specials each weekday has shown in `blocks`, counting every weekday some special of `kinds` can fall on. */
const specialsPerWeekday = (blocks: readonly Block[], kinds: readonly SpecialId[]): Map<number, number> => {
  const shown = new Map<number, number>();
  for (let weekday = 0; weekday < WEEK; weekday++) {
    if (kinds.some((kind) => specialTier(kind, weekday) !== null)) shown.set(weekday, 0);
  }
  for (const { special } of blocks) {
    if (!special) continue;
    const weekday = weekdayOfDay(special.day);
    shown.set(weekday, (shown.get(weekday) ?? 0) + 1);
  }
  return shown;
};

/**
 * Version `k`'s special blocks, up to the one holding `until` (a day number).
 * Each block draws a day and a special with a tier on it together, favouring
 * the weekdays that have shown the fewest specials so far in the version, so
 * specials spread evenly over every weekday that has one (a special with a
 * single tier would otherwise crowd its weekday, since no special may follow
 * itself). A special never repeats the one before, nor falls on a weekday
 * that showed the same special in the previous `ROTATION.noRepeat` weeks: a
 * weekday never shows any sheet twice within 3 consecutive weeks.
 *
 * A block's draws never depend on where the version ends, so appending a
 * version changes no day before it: a special that would fall past the end
 * is simply dropped, and the next version's first special keeps its distance.
 */
const blocksOf = (seed: string, versions: readonly CalendarVersion[], k: number, until: number): readonly Block[] => {
  const walk = walkOf(seed, versions);
  let blocks = walk.blocks.get(k);
  if (!blocks) {
    blocks = [];
    walk.blocks.set(k, blocks);
  }
  const end = versionEnd(versions, k);
  const nextStart = (): number => {
    const last = blocks.at(-1);
    return last ? last.start + last.length : versionStart(versions, k);
  };
  const window = WEEK * ROTATION.noRepeat;
  const { specials } = versions[k] as CalendarVersion;
  while (nextStart() <= until && nextStart() < end) {
    const start = nextStart();
    const rng = new Random(`${seed}:specials:${k}:${blocks.length}`);
    const length = rng.int(ROTATION.specialBlock.min, ROTATION.specialBlock.max);
    const recent = specialsSince(seed, versions, k, blocks, start - window);
    const previous = recent[0] ?? null;
    const options: SpecialOption[] = [];
    for (let offset = ROTATION.specialInset; offset < length - ROTATION.specialInset; offset++) {
      const day = start + offset;
      const weekday = weekdayOfDay(day);
      if (weekday === SUNDAY || (previous && day - previous.day < ROTATION.specialGap)) continue;
      const shownLately = (kind: SpecialId) =>
        recent.some((r) => r.kind === kind && weekdayOfDay(r.day) === weekday && day - r.day <= window);
      for (const kind of specials) {
        if (kind !== previous?.kind && specialTier(kind, weekday) !== null && !shownLately(kind)) options.push({ day, kind });
      }
    }
    if (options.length === 0) {
      blocks.push({ start, length, special: null });
      continue;
    }
    // Weekdays behind on specials catch up: each special a weekday has shown beyond the fewest lowers its odds.
    const shown = specialsPerWeekday(blocks, specials);
    const fewest = Math.min(...shown.values());
    const odds = (o: SpecialOption) => ROTATION.specialCatchUp ** ((shown.get(weekdayOfDay(o.day)) ?? 0) - fewest);
    const { day, kind } = weightedPick(rng, options, odds);
    const recipeId = (specialTier(kind, weekdayOfDay(day)) as Recipe).id;
    blocks.push({ start, length, special: day < end ? { kind, day, recipeId } : null });
  }
  return blocks;
};

/** The recipe id a day features under `versions`, or null before the first version. */
export const recipeIdForDay = (
  calendarSeed: string,
  dateKey: DateKey,
  versions: readonly CalendarVersion[] = CALENDAR_VERSIONS,
): string | null => {
  const day = dayNumberOf(dateKey);
  const k = versionAt(versions, day);
  if (k < 0) return null;
  const block = blocksOf(calendarSeed, versions, k, day).find((b) => b.start <= day && day < b.start + b.length);
  if (block?.special?.day === day) return block.special.recipeId;
  return historyOf(calendarSeed, versions, k, weekdayOf(dateKey), day).at(-1) ?? null;
};

/** The recipe a day features, or null before the first calendar version (the legacy weekly templates). */
export const recipeForDay = (calendarSeed: string, dateKey: DateKey): Recipe | null => {
  const id = recipeIdForDay(calendarSeed, dateKey);
  return id === null ? null : recipeById(id);
};
