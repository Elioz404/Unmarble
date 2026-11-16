import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Random } from '../math/random.ts';
import type { FieldOp } from './field-ops.ts';
import { fieldScratchJ, sampleField, sampleFieldJ } from './field.ts';

/** Finite-difference step (cells) and the agreement asked of the exact Jacobian, relative to its size. */
const STEP = 1e-6;
const TOLERANCE = 1e-3;
const STACKS = 40;
const POINTS = 60;

const randomOps = (random: Random): FieldOp[] =>
  Array.from({ length: random.int(1, 6) }, (_, source): FieldOp => {
    const kind = random.pick(['drop', 'stroke', 'swirl', 'suction'] as const);
    const cx = random.range(1, 11);
    const cy = random.range(1, 15);
    if (kind === 'drop') return { type: 'drop', cx, cy, r: random.range(0.8, 2.6), ink: random.int(0, 3), source };
    if (kind === 'suction') return { type: 'suction', cx, cy, r: random.range(0.8, 2), source };
    const sign = random.chance(0.5) ? 1 : -1;
    if (kind === 'swirl') return { type: 'swirl', cx, cy, turn: sign * random.range(0.5, 3), falloff: random.range(0.5, 2), source };
    const angle = random.range(0, Math.PI * 2);
    return {
      type: 'stroke',
      bx: cx,
      by: cy,
      ux: Math.cos(angle),
      uy: Math.sin(angle),
      shift: sign * random.range(0.5, 2),
      falloff: random.range(0.8, 2.5),
      source,
    };
  });

/** Where a screen point lands (ground point, or the ink's own coordinates), or null on another sheet region. */
const landing = (ops: readonly FieldOp[], x: number, y: number, region: string): readonly [number, number] | null => {
  const s = sampleField(ops, x, y);
  if (s.kind === 'ground') return region === 'ground' ? [s.x, s.y] : null;
  return region === `ink:${s.opIndex}` ? [s.lx, s.ly] : null;
};

test('the pull-back Jacobian matches finite differences wherever the field is smooth', () => {
  const random = new Random('field-jacobian');
  let checked = 0;
  for (let stack = 0; stack < STACKS; stack++) {
    const ops = randomOps(random);
    for (let k = 0; k < POINTS; k++) {
      const x = random.range(0, 12);
      const y = random.range(0, 16);
      const s = sampleFieldJ(ops, x, y, fieldScratchJ());
      const region = s.kind === 'ground' ? 'ground' : `ink:${s.opIndex}`;
      const exact = [
        [s.jxx, s.jxy],
        [s.jyx, s.jyy],
      ];
      for (const [axis, dx, dy] of [
        [0, STEP, 0],
        [1, 0, STEP],
      ] as const) {
        const ahead = landing(ops, x + dx, y + dy, region);
        const behind = landing(ops, x - dx, y - dy, region);
        const here = landing(ops, x, y, region);
        // Across an outline, a stroke's crease or the rim, the map has no derivative to compare.
        if (!ahead || !behind || !here) continue;
        for (const row of [0, 1] as const) {
          const forward = ((ahead[row] as number) - (here[row] as number)) / STEP;
          const backward = ((here[row] as number) - (behind[row] as number)) / STEP;
          const scale = Math.max(1, Math.abs(forward));
          if (Math.abs(forward - backward) > TOLERANCE * scale) continue;
          const central = (forward + backward) / 2;
          const got = exact[row]?.[axis] as number;
          assert.ok(Math.abs(got - central) <= TOLERANCE * scale, `J[${row}][${axis}] = ${got}, finite differences ${central}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > STACKS * POINTS * 3, `only ${checked} entries were smooth enough to check`);
});

test('carrying the Jacobian changes nothing about what a point shows', () => {
  const random = new Random('field-jacobian-identity');
  const scratch = fieldScratchJ();
  for (let stack = 0; stack < STACKS; stack++) {
    const ops = randomOps(random);
    for (let k = 0; k < POINTS; k++) {
      const x = random.range(0, 12);
      const y = random.range(0, 16);
      const plain = sampleField(ops, x, y);
      const carried = sampleFieldJ(ops, x, y, scratch);
      assert.equal(carried.kind, plain.kind);
      if (plain.kind === 'ground') {
        assert.equal(carried.x, plain.x);
        assert.equal(carried.y, plain.y);
      } else {
        assert.equal(carried.opIndex, plain.opIndex);
        assert.equal(carried.ink, plain.ink);
        assert.equal(carried.source, plain.source);
        assert.equal(carried.depth, plain.depth);
        assert.equal(carried.lx, plain.lx);
        assert.equal(carried.ly, plain.ly);
      }
    }
  }
});
