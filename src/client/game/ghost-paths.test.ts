import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHEET } from '../../shared/config.ts';
import { groundCrossPhase, groundPhase, type Ground } from '../../shared/sheet/ground.ts';
import { groundRulings } from './ghost-paths.ts';

/** Half a device pixel on the sharpest phone sheet we draw (about 1080 device pixels across), in cells. */
const HALF_PIXEL = 0.5 * (SHEET.cols / 1080);

const GROUNDS: readonly Ground[] = [
  { family: 'bands', period: 1.3, angle: 30, amplitude: 0, wavelength: 6 },
  { family: 'combed', period: 0.62, angle: 90, amplitude: 0, wavelength: 6 },
  { family: 'chevron', period: 1.2, angle: 60, amplitude: 0.85, wavelength: 6 },
  { family: 'waves', period: 1.1, angle: 0, amplitude: 0.95, wavelength: 5 },
  { family: 'grid', period: 1.4, angle: 120, amplitude: 0, wavelength: 6 },
  { family: 'rings', period: 1.1, angle: 0, amplitude: 0, wavelength: 6 },
];

/** Distance (cells) from a point to the nearest ruling of a phase field, to first order. */
const offset = (phase: (x: number, y: number) => number, x: number, y: number): number => {
  const h = 1e-5;
  const gx = (phase(x + h, y) - phase(x - h, y)) / (2 * h);
  const gy = (phase(x, y + h) - phase(x, y - h)) / (2 * h);
  const v = phase(x, y);
  return Math.abs(v - Math.round(v)) / Math.hypot(gx, gy);
};

for (const ground of GROUNDS) {
  test(`the Lens tracing of ${ground.family} lies on the true rulings within half a device pixel`, () => {
    const phases = [(x: number, y: number) => groundPhase(ground, x, y)];
    if (ground.family === 'grid') phases.push((x, y) => groundCrossPhase(ground, x, y) ?? 0);
    const segments = groundRulings(ground);
    assert.ok(segments.length > 0);
    for (const [x0, y0, x1, y1] of segments) {
      // The worst point of a chord is near its middle; it must sit on one of the fields' rulings.
      for (const t of [0, 0.5, 1]) {
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        const best = Math.min(...phases.map((phase) => offset(phase, x, y)));
        assert.ok(best < HALF_PIXEL, `${ground.family}: (${x.toFixed(3)}, ${y.toFixed(3)}) is ${best.toFixed(4)} cells off`);
      }
    }
  });
}

test('the Lens tracing draws every ruling across the whole sheet', () => {
  const ground: Ground = { family: 'bands', period: 1.3, angle: 0, amplitude: 0, wavelength: 6 };
  const length = groundRulings(ground).reduce((sum, [x0, y0, x1, y1]) => sum + Math.hypot(x1 - x0, y1 - y0), 0);
  // Horizontal rulings every period, each the full sheet wide.
  const rulings = Math.floor(SHEET.rows / 2 / ground.period) * 2 + 1;
  assert.ok(Math.abs(length - rulings * SHEET.cols) < 1e-6, `${length} vs ${rulings * SHEET.cols}`);
});
