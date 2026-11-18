import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES } from '../../shared/puzzle/recipes.ts';
import { COPY } from './copy.ts';

test('every recipe promise reads as one sentence on the card: capitalised, ending in one stop', () => {
  for (const { id, promise } of RECIPES) {
    const line = COPY.cardPromise(promise);
    assert.match(line, /^[A-Z]/, id);
    assert.match(line, /[^.?!][.?!]$/, `${id}: "${line}"`);
  }
  assert.equal(COPY.cardPromise('two folds crossing: which is on top?'), 'Two folds crossing: which is on top?');
  assert.equal(COPY.cardPromise('an early fold, bent by two drops'), 'An early fold, bent by two drops.');
});

test('when the Apprentice trusted one drop while another lay on top, the line says "another drop"', () => {
  assert.match(COPY.apprentice.fellFor(2, 'drop', true), /another drop lay on top/);
  assert.match(COPY.apprentice.fellFor(2, 'stroke', true), /a fold lay on top/);
});
