import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tearPath } from './overlay.ts';

/** Length over width of the box aligned with the polyline's principal axis. */
const aspectOf = (points: readonly { x: number; y: number }[]): number => {
  const mx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const my = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const [ux, uy] = [Math.cos(axis), Math.sin(axis)];
  const along = points.map((p) => (p.x - mx) * ux + (p.y - my) * uy);
  const across = points.map((p) => -(p.x - mx) * uy + (p.y - my) * ux);
  const extent = (values: number[]) => Math.max(...values) - Math.min(...values);
  return extent(along) / extent(across);
};

test('every tear is an open slit at least three times longer than wide: never a round mark', () => {
  // Integer seeds (the player's scars) and position-derived ones (everyone else's tears).
  const seeds = [...Array.from({ length: 400 }, (_, i) => i), ...Array.from({ length: 400 }, (_, i) => i + i * 0.731 + 0.37)];
  for (const seed of seeds) {
    for (const length of [0.35, 0.55, 0.7]) {
      const angle = (seed % 7) - 3;
      const path = tearPath(seed, length, angle);
      const first = path[0];
      const last = path[path.length - 1];
      assert.ok(first && last);
      assert.ok(Math.hypot(last.x - first.x, last.y - first.y) > 0.8 * length, `seed ${seed}: the ends stay apart`);
      assert.ok(aspectOf(path) >= 3, `seed ${seed}, length ${length}: aspect ${aspectOf(path).toFixed(2)}`);
    }
  }
});

test('a tear keeps its shape for a given seed', () => {
  assert.deepEqual(tearPath(12.5, 0.5, 1), tearPath(12.5, 0.5, 1));
});
