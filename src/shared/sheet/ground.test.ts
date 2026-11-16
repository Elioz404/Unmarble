import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_FAMILIES, groundCrossGradient, groundCrossPhase, groundPhase, groundPhaseGradient, type Ground } from './ground.ts';

const STEP = 1e-6;
const TOLERANCE = 1e-5;

test("each family's phase gradient matches finite differences of its phase", () => {
  const out = { x: 0, y: 0 };
  for (const family of GROUND_FAMILIES) {
    for (const angle of [0, 30, 90, 150]) {
      const ground: Ground = { family, period: 1.3, angle, amplitude: 0.7, wavelength: 6 };
      for (let i = 0; i < 200; i++) {
        const x = (i * 0.731) % 12;
        const y = (i * 0.377) % 16;
        const fields: [(x: number, y: number) => number, () => { x: number; y: number }][] = [
          [(px, py) => groundPhase(ground, px, py), () => groundPhaseGradient(ground, x, y, out)],
          [(px, py) => groundCrossPhase(ground, px, py) ?? 0, () => groundCrossGradient(ground, out)],
        ];
        for (const [phase, gradient] of fields) {
          const gx = (phase(x + STEP, y) - phase(x - STEP, y)) / (2 * STEP);
          const gy = (phase(x, y + STEP) - phase(x, y - STEP)) / (2 * STEP);
          // A chevron's apex is a crease: there the two one-sided slopes differ.
          const crease = Math.abs((phase(x + STEP, y) - phase(x, y)) / STEP - gx) > TOLERANCE;
          if (crease) continue;
          const got = gradient();
          assert.ok(Math.abs(got.x - gx) < TOLERANCE && Math.abs(got.y - gy) < TOLERANCE, `${family} ${angle}° at (${x}, ${y})`);
        }
      }
    }
  }
});
