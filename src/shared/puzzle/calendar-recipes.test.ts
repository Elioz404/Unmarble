import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ROTATION } from '../config.ts';
import { addDays, dayNumberOf, weekdayOf, type DateKey } from '../time/calendar.ts';
import { CALENDAR_VERSIONS, recipeForDay, recipeIdForDay, type CalendarVersion } from './calendar-recipes.ts';
import { recipeById } from './recipes.ts';

const SUNDAY = 0;
const SECRETS = ['a1', 'b2', 'c3'].map((pair) => pair.repeat(32));
const seedOf = (secret: string) => createHmac('sha256', secret).update('calendar').digest('hex');
const SEEDS = SECRETS.map(seedOf);
const YEAR = 365;
/** Specials land on about one day in ten. */
const SPECIAL_SHARE = Object.freeze({ min: 0.08, max: 0.12 });
/** Today's specials spread over the four weekdays that have them: none takes more than a third. */
const MAX_WEEKDAY_SPECIALS = 1 / 3;
/** A version with shorter blocks shows at least this many times the specials of the usual cadence. */
const DENSE_GAIN = 1.25;

const FIRST = CALENDAR_VERSIONS[0] as CalendarVersion;

type Day = { readonly key: DateKey; readonly id: string };

const daysFrom = (seed: string, start: DateKey, count: number, versions?: readonly CalendarVersion[]): Day[] =>
  Array.from({ length: count }, (_, i) => {
    const key = addDays(start, i);
    const id = recipeIdForDay(seed, key, versions);
    if (id === null) throw new Error(`no recipe on ${key}`);
    return { key, id };
  });

const isSpecial = (id: string): boolean => {
  const r = recipeById(id);
  // Ids the test invents (a simulated new recipe) are weekday recipes.
  return r !== null && r.special !== null;
};

/** Every rule of the rotation, checked over a run of days. */
const assertRotation = (days: readonly Day[], label: string): void => {
  const specials = days.filter((d) => isSpecial(d.id));
  for (let weekday = 0; weekday < 7; weekday++) {
    // What players see, specials included: no sheet comes back within 3 weeks on its weekday.
    const ids = days.filter((d) => weekdayOf(d.key) === weekday).map((d) => d.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j <= i + ROTATION.noRepeat && j < ids.length; j++) {
        assert.notEqual(ids[i], ids[j], `${label}: weekday ${weekday} repeats ${ids[i]} within 3 weeks`);
      }
    }
  }
  const share = specials.length / days.length;
  assert.ok(share >= SPECIAL_SHARE.min && share <= SPECIAL_SHARE.max, `${label}: special share ${share}`);
  for (const [i, day] of specials.entries()) {
    assert.notEqual(weekdayOf(day.key), SUNDAY, `${label}: a special on Sunday ${day.key}`);
    assert.equal(recipeById(day.id)?.weekday, weekdayOf(day.key), `${label}: ${day.id} on its own weekday`);
    const previous = specials[i - 1];
    if (!previous) continue;
    assert.ok(dayNumberOf(day.key) - dayNumberOf(previous.key) >= ROTATION.specialGap, `${label}: specials ${previous.key} and ${day.key}`);
    assert.notEqual(recipeById(day.id)?.special, recipeById(previous.id)?.special, `${label}: the same special twice in a row`);
  }
};

test('versions are sorted, and every id they list is a weekday recipe of its day', () => {
  for (const [k, version] of CALENDAR_VERSIONS.entries()) {
    const previous = CALENDAR_VERSIONS[k - 1];
    if (previous) assert.ok(previous.from < version.from, 'sorted by first day');
    for (let weekday = 0; weekday < 7; weekday++) {
      const ids = version.weekdays[weekday] ?? [];
      assert.ok(ids.length > ROTATION.noRepeat, 'enough recipes to rotate without repeats');
      for (const id of ids) {
        const r = recipeById(id);
        assert.ok(r, `${id} exists`);
        assert.equal(r.weekday, weekday, `${id} belongs to weekday ${weekday}`);
        assert.equal(r.special, null, `${id} is not a special`);
      }
    }
  }
});

test('a year of recipes keeps every rotation rule, for each secret', () => {
  for (const [i, seed] of SEEDS.entries()) {
    const days = daysFrom(seed, FIRST.from, YEAR);
    assertRotation(days, `secret ${i}`);
    const specials = days.filter((d) => isSpecial(d.id));
    for (let weekday = 0; weekday < 7; weekday++) {
      const own = specials.filter((d) => weekdayOf(d.key) === weekday).length;
      assert.ok(own <= specials.length * MAX_WEEKDAY_SPECIALS, `secret ${i}: weekday ${weekday} has ${own} of ${specials.length} specials`);
    }
  }
});

test('the calendar is deterministic in its seed, and differs between seeds', () => {
  const [a, b] = SEEDS as [string, string];
  const run = (seed: string) => daysFrom(seed, FIRST.from, 60).map((d) => d.id);
  assert.deepEqual(run(a), run(a));
  assert.notDeepEqual(run(a), run(b));
  // A cold walk straight to a far day agrees with one that went day by day (a copy of the versions walks afresh).
  const far = addDays(FIRST.from, 300);
  const cold = recipeIdForDay('cold-seed', far);
  assert.equal(cold, daysFrom('cold-seed', FIRST.from, 301, [...CALENDAR_VERSIONS]).at(-1)?.id);
});

test('days before the first version keep the weekly templates', () => {
  assert.equal(recipeForDay(SEEDS[0] as string, addDays(FIRST.from, -1)), null);
  assert.ok(recipeForDay(SEEDS[0] as string, FIRST.from));
});

test('a catalogue change keeps every rule across the boundary', () => {
  const monday = FIRST.weekdays[1] ?? [];
  const v2: CalendarVersion = {
    from: addDays(FIRST.from, 166),
    weekdays: {
      ...FIRST.weekdays,
      // One Monday recipe removed and a new one added; Wednesday reordered.
      1: ['new-monday', ...monday.filter((id) => id !== 'old-fold')],
      3: [...(FIRST.weekdays[3] ?? [])].reverse(),
    },
    specials: FIRST.specials.filter((s) => s !== 'ink-only'),
  };
  const versions = [FIRST, v2];
  for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
    const days = daysFrom(seed, FIRST.from, 2 * YEAR, versions);
    assertRotation(days, `v2 ${seed}`);
    const after = days.filter((d) => d.key >= v2.from);
    assert.ok(after.every((d) => d.id !== 'old-fold' && d.id !== 'ink-only'), 'the removed ids stop');
    assert.ok(after.some((d) => d.id === 'new-monday'), 'the new id arrives');
    // The first version's days do not change when a later version is appended.
    const before = days.filter((d) => d.key < v2.from);
    assert.deepEqual(before, daysFrom(seed, FIRST.from, before.length, [FIRST]));
  }
});

test('a version that starts later never changes a day before it', () => {
  for (const [k, version] of CALENDAR_VERSIONS.entries()) {
    if (k === 0) continue;
    const earlier = CALENDAR_VERSIONS.slice(0, k);
    const count = dayNumberOf(version.from) - dayNumberOf(FIRST.from);
    for (const seed of SEEDS) assert.deepEqual(daysFrom(seed, FIRST.from, count), daysFrom(seed, FIRST.from, count, earlier));
  }
});

test('every version’s blocks keep a day that may hold a special, and specials stay apart', () => {
  for (const { specialBlock = ROTATION.specialBlock } of CALENDAR_VERSIONS) {
    assert.ok(specialBlock.min > 2 * ROTATION.specialInset + 1, 'a block longer than its two inset ends');
    assert.ok(specialBlock.min <= specialBlock.max);
  }
  assert.ok(2 * ROTATION.specialInset + 1 >= ROTATION.specialGap, 'specials of neighbouring blocks stay specialGap apart');
});

test('shorter blocks bring specials more often, within the rules', () => {
  const dense = CALENDAR_VERSIONS.find((v) => v.specialBlock);
  assert.ok(dense, 'a version with its own blocks');
  const k = CALENDAR_VERSIONS.indexOf(dense);
  const plain = CALENDAR_VERSIONS.map(({ specialBlock: _, ...v }): CalendarVersion => v);
  const days = dayNumberOf(CALENDAR_VERSIONS[k + 1]?.from ?? addDays(dense.from, YEAR)) - dayNumberOf(dense.from);
  const seeds = Array.from({ length: 40 }, (_, i) => `dense-${i}`);
  const count = (versions: readonly CalendarVersion[]) =>
    seeds.reduce((sum, seed) => sum + daysFrom(seed, dense.from, days, versions).filter((d) => isSpecial(d.id)).length, 0);
  assert.ok(count(CALENDAR_VERSIONS) > count(plain) * DENSE_GAIN, 'more specials than the usual cadence');
  for (const seed of seeds) assertRotation(daysFrom(seed, FIRST.from, YEAR), `dense ${seed}`);
});
