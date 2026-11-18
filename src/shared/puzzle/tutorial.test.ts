import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardSample, LESSONS, lessonsFor, readingsOf } from './tutorial.ts';
import { generateSheet, isReadable } from './generator.ts';
import { recipeById } from './recipes.ts';
import { readSheet } from './analysis.ts';
import { parseSheetSpec } from './sheet.ts';

for (const lesson of LESSONS) {
  test(`lesson "${lesson.id}" is a valid, fair sheet`, () => {
    assert.ok(parseSheetSpec(lesson.spec), 'parses');
    assert.ok(isReadable(lesson.spec.moves, lesson.spec.ground), 'readable');
    if (lesson.spec.moves.length > 1) {
      assert.ok(readSheet(lesson.spec.moves).fair, 'fair');
      assert.ok(readSheet(lesson.spec.moves).margin >= 2, 'comfortable margin');
    }
  });
}

test('the card specimen is fair and readable', () => {
  const spec = cardSample('harbor-cobalt');
  assert.ok(isReadable(spec.moves, spec.ground));
  assert.ok(readSheet(spec.moves).margin >= 2);
});

test('a twin sheet asks for the twins reading; a recipe that forbids twins never does', () => {
  const twins = recipeById('twins');
  const plain = recipeById('buried-swirl');
  if (!twins || !plain) throw new Error('missing recipes');
  for (const seed of ['alpha', 'beta', 'gamma']) {
    assert.ok(readingsOf(generateSheet(seed, twins, 'cinnabar').spec).has('twins'), 'twins');
    const readings = readingsOf(generateSheet(seed, plain, 'cinnabar').spec);
    assert.ok(!readings.has('twins'), 'no twins');
    assert.deepEqual([...readings].sort(), ['drop', 'stroke', 'swirl']);
  }
});

test('the twins lesson is shown only before a sheet with twins', () => {
  const unseen = () => false;
  const twins = LESSONS.find((lesson) => lesson.teaches === 'twins');
  assert.ok(twins);
  const twinSpec = twins.spec;
  assert.ok(lessonsFor(twinSpec, unseen).includes(twins));
  const roundIsLast = LESSONS.find((lesson) => lesson.id === 'round-is-last');
  assert.ok(roundIsLast && !lessonsFor(roundIsLast.spec, unseen).includes(twins));
});

/** A first sheet with nothing but drops and folds: the seam lesson's own sheet. */
const plainSheet = () => {
  const seam = LESSONS.find((lesson) => lesson.id === 'seam');
  assert.ok(seam);
  return seam.spec;
};

test('each reading is taught by exactly one lesson', () => {
  const taught = LESSONS.map((lesson) => lesson.teaches);
  assert.equal(new Set(taught).size, taught.length);
});

test('lesson ids are kept for good: devices remember them as seen', () => {
  const ids = LESSONS.map((lesson) => lesson.id);
  for (const id of ['round-is-last', 'seam', 'swirl', 'two-centres']) assert.ok(ids.includes(id), id);
});

test('a newcomer meets two lessons before a plain first sheet: drops, then folds', () => {
  assert.deepEqual(
    lessonsFor(plainSheet(), () => false).map((lesson) => lesson.id),
    ['round-is-last', 'seam'],
  );
});

test('a device that saw the retired one-drop lesson is treated like any other', () => {
  const sawOneDrop = (id: string) => id === 'one-drop';
  assert.deepEqual(
    lessonsFor(plainSheet(), sawOneDrop).map((lesson) => lesson.id),
    ['round-is-last', 'seam'],
  );
  const sawBasics = (id: string) => ['one-drop', 'round-is-last', 'seam'].includes(id);
  assert.deepEqual(lessonsFor(plainSheet(), sawBasics), []);
});
