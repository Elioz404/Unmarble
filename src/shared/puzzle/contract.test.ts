import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ground } from '../sheet/ground.ts';
import { diagnoseReadability } from './contract.ts';
import type { Move } from './moves.ts';

const BANDS: Ground = { family: 'bands', period: 1, angle: 0, amplitude: 0, wavelength: 1 };

test('a drop that falls inside an earlier drop of its own ink is refused as one merged blob', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 6, y: 8, size: 'L', ink: 1 },
    { kind: 'drop', x: 6.5, y: 8, size: 'S', ink: 1 },
  ];
  assert.deepEqual(diagnoseReadability(moves, BANDS), { kind: 'merged-ink', move: 1 });
});

test('the same drop in another ink is a ring, not a merge', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 6, y: 8, size: 'L', ink: 1 },
    { kind: 'drop', x: 6.5, y: 8, size: 'S', ink: 2 },
  ];
  assert.notEqual(diagnoseReadability(moves, BANDS)?.kind, 'merged-ink');
});

test('a fold that only clips a corner of the paper is refused as too short', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 6, y: 8, size: 'L', ink: 0 },
    // Diagonal through a point near the top-left corner: its seam is a few cells long.
    { kind: 'stroke', x: 1, y: 1, heading: 135 },
  ];
  assert.deepEqual(diagnoseReadability(moves, BANDS), { kind: 'short-fold', move: 1 });
});
