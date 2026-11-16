import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameThreshold, parseSheetName } from './sheet-name.ts';

test('accepts short names and normalises their case', () => {
  assert.equal(parseSheetName("grandma's jellyfish"), "Grandma's Jellyfish");
  assert.equal(parseSheetName('  MOTH   '), 'Moth');
  assert.equal(parseSheetName('Moss-Eaten Owl.'), 'Moss-eaten Owl');
});

test('rejects long, symbolic or blocked replies', () => {
  assert.equal(parseSheetName('this is far too many words'), null);
  assert.equal(parseSheetName('https://example.com'), null);
  assert.equal(parseSheetName('nice 10/10'), null);
  assert.equal(parseSheetName('holy shit'), null);
  assert.equal(parseSheetName('Extraordinarily Unbelievable Cephalopod'), null);
});

test('the vote threshold grows with the audience', () => {
  assert.equal(nameThreshold(3), 2);
  assert.ok(nameThreshold(500) > nameThreshold(50));
});
