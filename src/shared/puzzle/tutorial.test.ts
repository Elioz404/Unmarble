import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from './tutorial.ts';
import { isReadable } from './generator.ts';
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
