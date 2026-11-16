/**
 * Developer tool: plays a whole calendar out for a few installation secrets
 * and checks it. For each secret, every day's sheet is generated as the
 * server would make it, then re-checked independently: the full contract,
 * the recipe's signature, the move band and a JSON round trip. It reports
 * the rotation rules (no weekday shows a sheet twice within 3 weeks, specials
 * included; specials: share, spread over weekdays, spacing, never on Sunday,
 * never twice in a row), generation time against the budget, and the
 * variety each weekday gets.
 *
 *   npm run year                       365 days, three sample secrets
 *   npm run year -- 730 <secret> ...   any length, your own secrets
 *
 * Exits with 1 when a sheet fails or a rule is broken; the time budget is
 * reported, not enforced (today's sheet is made by the midnight job, not in
 * a player's request).
 */
import { createHmac } from 'node:crypto';
import { ROTATION } from '../src/shared/config.ts';
import { CALENDAR_VERSIONS } from '../src/shared/puzzle/calendar-recipes.ts';
import { buildDailySheet } from '../src/shared/puzzle/daily.ts';
import { matchesSignature } from '../src/shared/puzzle/features.ts';
import { validateSheet } from '../src/shared/puzzle/generator.ts';
import { recipeById, type Recipe } from '../src/shared/puzzle/recipes.ts';
import { parseSheetSpec } from '../src/shared/puzzle/sheet.ts';
import { addDays, dayNumberOf, WEEKDAY_NAMES, weekdayOf, type DateKey } from '../src/shared/time/calendar.ts';

const SAMPLE_SECRETS = ['a1', 'b2', 'c3'].map((pair) => pair.repeat(32));
/** Generation time the report holds each sheet to, in ms on this machine. */
const BUDGET_MS = 150;
/** The calendar's no-repeat window, in weeks: the recent picks excluded, plus the week itself. */
const NO_REPEAT_WEEKS = ROTATION.noRepeat + 1;
const SHARE = Object.freeze({ min: 0.08, max: 0.12 });
/** No weekday takes more than this share of the specials. */
const MAX_WEEKDAY_SPECIALS = 1 / 3;
const SUNDAY = 0;

const [daysArg, ...secretArgs] = process.argv.slice(2);
const days = Number(daysArg ?? 365);
const secrets = secretArgs.length > 0 ? secretArgs : SAMPLE_SECRETS;
const first = CALENDAR_VERSIONS[0];
if (!first) throw new Error('The calendar has no version');
const start: DateKey = first.from;

// The seeds exactly as the server derives them from an installation secret (`SheetService`).
const daySeed = (secret: string, dateKey: DateKey) => createHmac('sha256', secret).update(dateKey).digest('hex');
const calendarSeed = (secret: string) => createHmac('sha256', secret).update('calendar').digest('hex');

type Day = { readonly key: DateKey; readonly recipe: Recipe; readonly ms: number; readonly shape: string };

const percentile = (sorted: readonly number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

const entropyBits = (ids: readonly string[]): number => {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return -[...counts.values()].reduce((sum, c) => sum + (c / ids.length) * Math.log2(c / ids.length), 0);
};

/** Problems with one generated day, re-checked from the published descriptor. */
const recheck = (recipe: Recipe, sheet: ReturnType<typeof buildDailySheet>): string[] => {
  const problems: string[] = [];
  const { spec } = sheet;
  const reading = validateSheet(spec.moves, spec.ground, recipe);
  if (!reading) problems.push('fails the contract');
  else if (!matchesSignature(recipe, spec.moves, reading)) problems.push('misses its signature');
  if (spec.moves.length < recipe.moves[0] || spec.moves.length > recipe.moves[1]) problems.push('outside its move band');
  if (spec.stars !== recipe.stars) problems.push('wrong stars');
  if (JSON.stringify(parseSheetSpec(JSON.parse(JSON.stringify(spec)))) !== JSON.stringify(spec)) problems.push('no JSON round trip');
  return problems;
};

let broken = 0;
const fail = (line: string) => {
  broken++;
  console.log(`  FAIL ${line}`);
};

// Warm the engine up once, so the first day's time is not the JIT's.
buildDailySheet(start, 'warm-up', 'warm-up', start);

for (const secret of secrets) {
  const calendar = calendarSeed(secret);
  console.log(`\nsecret ${secret.slice(0, 6)}…  ${days} days from ${start}`);
  const run: Day[] = [];
  let failures = 0;
  let invalid = 0;
  for (let i = 0; i < days; i++) {
    const key = addDays(start, i);
    const began = performance.now();
    let sheet: ReturnType<typeof buildDailySheet>;
    try {
      sheet = buildDailySheet(key, daySeed(secret, key), calendar, start);
    } catch (error) {
      failures++;
      fail(`${key}: ${(error as Error).message}`);
      continue;
    }
    const ms = performance.now() - began;
    const recipe = sheet.recipe ? recipeById(sheet.recipe.id) : null;
    if (!recipe) {
      fail(`${key}: no recipe`);
      continue;
    }
    const problems = recheck(recipe, sheet);
    if (problems.length > 0) {
      invalid++;
      fail(`${key} ${recipe.id}: ${problems.join(', ')}`);
    }
    const shape = sheet.spec.moves.map((m) => (m.kind === 'drop' ? `d${m.size}` : m.kind[0])).join('');
    run.push({ key, recipe, ms, shape: `${shape}:${sheet.spec.ground.family}` });
  }

  // Rotation: a weekday never shows the same sheet within 3 consecutive weeks, specials included.
  let repeats = 0;
  for (let weekday = 0; weekday < 7; weekday++) {
    const ids = run.filter((d) => weekdayOf(d.key) === weekday).map((d) => d.recipe.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < Math.min(ids.length, i + NO_REPEAT_WEEKS); j++) {
        if (ids[i] === ids[j]) {
          repeats++;
          fail(`${WEEKDAY_NAMES[weekday]} repeats ${ids[i]} within ${NO_REPEAT_WEEKS} weeks`);
        }
      }
    }
  }

  // Specials.
  const specials = run.filter((d) => d.recipe.special);
  const share = specials.length / Math.max(1, run.length);
  const gaps = specials.slice(1).map((d, i) => dayNumberOf(d.key) - dayNumberOf((specials[i] as Day).key));
  const sundays = specials.filter((d) => weekdayOf(d.key) === SUNDAY).length;
  const twiceInARow = specials.slice(1).filter((d, i) => d.recipe.special === (specials[i] as Day).recipe.special).length;
  if (share < SHARE.min || share > SHARE.max) fail(`special share ${(share * 100).toFixed(1)}%`);
  if (sundays > 0) fail(`${sundays} specials on a Sunday`);
  if (twiceInARow > 0) fail(`${twiceInARow} specials repeat the one before`);
  if (gaps.some((g) => g < ROTATION.specialGap)) fail(`specials closer than ${ROTATION.specialGap} days`);
  const bySpecial = new Map<string, number>();
  for (const d of specials) bySpecial.set(d.recipe.id, (bySpecial.get(d.recipe.id) ?? 0) + 1);
  // Specials spread over their weekdays: none takes more than a third.
  for (let weekday = 0; weekday < 7; weekday++) {
    const own = specials.filter((d) => weekdayOf(d.key) === weekday).length;
    if (own > specials.length * MAX_WEEKDAY_SPECIALS) fail(`${WEEKDAY_NAMES[weekday]} has ${own} of ${specials.length} specials`);
  }

  // Time.
  const times = run.map((d) => d.ms).sort((a, b) => a - b);
  const worst = run.reduce<Day | null>((w, d) => (!w || d.ms > w.ms ? d : w), null);
  const worstByRecipe = new Map<string, number>();
  for (const d of run) worstByRecipe.set(d.recipe.id, Math.max(worstByRecipe.get(d.recipe.id) ?? 0, d.ms));
  const slowest = [...worstByRecipe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  console.log(`  generation failures ${failures}   invalid sheets ${invalid}   repeats within 3 weeks ${repeats}`);
  console.log(
    `  specials ${specials.length} of ${run.length} (${(share * 100).toFixed(1)}%)   gaps ${Math.min(...gaps)}–${Math.max(...gaps)} days   ` +
      `on Sunday ${sundays}   twice in a row ${twiceInARow}   ${[...bySpecial].map(([id, n]) => `${id} ${n}`).join(', ')}`,
  );
  console.log(
    `  time median ${percentile(times, 0.5).toFixed(0)} ms   p95 ${percentile(times, 0.95).toFixed(0)}   p99 ${percentile(times, 0.99).toFixed(0)}   ` +
      `worst ${worst?.ms.toFixed(0)} ms (${worst?.key} ${worst?.recipe.id}): ${(worst?.ms ?? 0) <= BUDGET_MS ? 'PASS' : 'FAIL'} against ${BUDGET_MS} ms`,
  );
  console.log(`  slowest recipes (worst day): ${slowest.map(([id, ms]) => `${id} ${ms.toFixed(0)} ms`).join(', ')}`);
  console.log('  variety per weekday (recipes used, entropy, distinct move shape + ground):');
  for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
    const own = run.filter((d) => weekdayOf(d.key) === weekday);
    const ids = own.map((d) => d.recipe.id);
    const used = new Set(ids);
    const counts = [...used].map((id) => `${id} ${ids.filter((x) => x === id).length}`).join(', ');
    console.log(
      `    ${(WEEKDAY_NAMES[weekday] ?? '').padEnd(9)} ${used.size} recipes  ${entropyBits(ids).toFixed(2)} bits  ` +
        `${new Set(own.map((d) => d.shape)).size}/${own.length} shapes   ${counts}`,
    );
  }
}

console.log(broken === 0 ? '\nAll checks pass.' : `\n${broken} problems.`);
process.exitCode = broken === 0 ? 0 : 1;
