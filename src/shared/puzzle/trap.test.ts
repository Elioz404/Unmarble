import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ground } from '../sheet/ground.ts';
import type { Move } from './moves.ts';
import { checkTrap } from './trap.ts';

const BANDS: Ground = { family: 'bands', period: 1, angle: 0, amplitude: 0, wavelength: 1 };

test('a trap whose last move is the roundest drop is fair but plain', () => {
  const plain: Move[] = [
    { kind: 'drop', x: 5, y: 9, size: 'L', ink: 0 },
    { kind: 'drop', x: 7.5, y: 8, size: 'M', ink: 3 },
    { kind: 'drop', x: 6.5, y: 6, size: 'S', ink: 1 },
  ];
  const check = checkTrap(plain, BANDS);
  assert.equal(check.problem, null);
  assert.equal(check.devious, false);
});

test('a trap that hides a fold on top of round drops is devious', () => {
  const devious: Move[] = [
    { kind: 'drop', x: 4, y: 8, size: 'L', ink: 0 },
    { kind: 'drop', x: 8, y: 8, size: 'M', ink: 1 },
    { kind: 'stroke', x: 6, y: 8, heading: 90 },
  ];
  assert.equal(checkTrap(devious, BANDS).devious, true);
});
