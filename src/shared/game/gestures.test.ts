import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../puzzle/moves.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import { resolveCircle, resolveDrag } from './gestures.ts';
import type { SheetPoint } from './session.ts';

const EYE = { x: 6, y: 7.5 };

const spec = (moves: readonly Move[]): SheetSpec => ({
  paletteId: '',
  ground: { family: 'bands', period: 1, angle: 0, amplitude: 0, wavelength: 1 },
  moves,
  stars: 1,
});

/** A drop, then a swirl on top of it whose eye sits at EYE. */
const SWIRLED = spec([
  { kind: 'drop', x: 6, y: 9.5, size: 'L', ink: 2 },
  { kind: 'swirl', x: EYE.x, y: EYE.y, turn: 1 },
]);

const line = (from: SheetPoint, to: SheetPoint, points = 16): SheetPoint[] =>
  Array.from({ length: points }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / (points - 1),
    y: from.y + ((to.y - from.y) * i) / (points - 1),
  }));

const arc = (radius: number, from: number, sweep: number, points = 32): SheetPoint[] =>
  Array.from({ length: points }, (_, i) => {
    const a = from + (sweep * i) / (points - 1);
    return { x: EYE.x + radius * Math.cos(a), y: EYE.y + radius * Math.sin(a) };
  });

test('a straight swipe passing close to a swirl eye is never read as circling it', () => {
  // Most of a cell from the eye, four cells long: it turns 136° around the eye at a fairly even distance.
  const swipe = line({ x: EYE.x - 2, y: EYE.y + 0.8 }, { x: EYE.x + 2, y: EYE.y + 0.8 });
  assert.equal(resolveCircle(SWIRLED, 2, swipe), null);
});

test('a circle around the eye undoes the swirl, against its turn', () => {
  assert.deepEqual(resolveDrag(SWIRLED, 2, arc(1.6, 0, -Math.PI * 1.2)), { type: 'unswirl', move: 1, against: true });
  assert.deepEqual(resolveDrag(SWIRLED, 2, arc(1.6, 0, Math.PI * 1.2)), { type: 'unswirl', move: 1, against: false });
});

test('a circle that only just reaches the minimum sweep still reads as a circle', () => {
  const sweep = (-115 * Math.PI) / 180;
  assert.equal(resolveCircle(SWIRLED, 2, arc(1.2, 1, sweep))?.type, 'unswirl');
});
