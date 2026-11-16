import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureEvidence, UNMISTAKABLE } from './evidence.ts';
import { readSheet } from './analysis.ts';
import type { Move } from './moves.ts';

test('the top move is pristine; a drop pushed by a neighbour reads as oval', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 4, y: 8, size: 'M', ink: 0 },
    { kind: 'drop', x: 6.5, y: 8, size: 'M', ink: 1 },
  ];
  const [first, top] = measureEvidence(moves, 2);
  assert.equal(top?.strength, 0);
  assert.equal(top?.mark, 'none');
  assert.ok((first?.strength ?? 0) > 1, `strength ${first?.strength}`);
});

test('a drop that receives later ink is marked as a ring', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 6, y: 8, size: 'L', ink: 0 },
    { kind: 'drop', x: 6.5, y: 8, size: 'S', ink: 1 },
  ];
  const [first] = measureEvidence(moves, 2);
  assert.equal(first?.mark, 'ring');
  assert.equal(first?.strength, UNMISTAKABLE);
});

test('a seam crossed by a later stroke bends', () => {
  const moves: Move[] = [
    { kind: 'stroke', x: 6, y: 8, heading: 90 },
    { kind: 'stroke', x: 6, y: 8, heading: 0 },
  ];
  const [first, top] = measureEvidence(moves, 2);
  assert.equal(top?.strength, 0);
  assert.ok((first?.strength ?? 0) > 1, `strength ${first?.strength}`);
});

test('far-apart moves leave no evidence, so the sheet is unfair', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 2, y: 2, size: 'S', ink: 0 },
    { kind: 'drop', x: 10, y: 14, size: 'S', ink: 1 },
  ];
  const reading = readSheet(moves);
  assert.equal(reading.fair, false);
});

test('a same-ink drop inside another is not an unmistakable ring', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 6, y: 8, size: 'L', ink: 2 },
    { kind: 'drop', x: 6.5, y: 8.5, size: 'L', ink: 2 },
  ];
  const [first] = measureEvidence(moves, 2);
  assert.notEqual(first?.mark, 'ring');
  assert.ok((first?.strength ?? UNMISTAKABLE) < UNMISTAKABLE);
});
