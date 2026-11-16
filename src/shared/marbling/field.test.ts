import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullDrop, pullStroke, pushDrop, pushStroke, type StrokeOp } from './field-ops.ts';
import { pullThrough, pushThrough, sampleField } from './field.ts';
import { moveToOp, type Move } from '../puzzle/moves.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('a drop is an exact bijection outside its disk', () => {
  for (let i = 0; i < 200; i++) {
    const p = { x: Math.sin(i) * 7 + 6, y: Math.cos(i * 1.3) * 9 + 8 };
    const q = { ...p };
    pushDrop(5, 7, 1.8, q);
    assert.ok(Math.hypot(q.x - 5, q.y - 7) > 1.8);
    assert.ok(pullDrop(5, 7, 1.8, q));
    close(q.x, p.x);
    close(q.y, p.y);
  }
});

test('a drop preserves area: the ring between r and R receives the old disk of radius √(R²−r²)', () => {
  const p = { x: 5 + 1, y: 7 };
  pushDrop(5, 7, 2, p);
  close(Math.hypot(p.x - 5, p.y - 7), Math.sqrt(1 + 4));
});

test('a stroke is undone exactly by the same stroke with negative shift', () => {
  const op: StrokeOp = { type: 'stroke', bx: 6, by: 8, ux: Math.SQRT1_2, uy: Math.SQRT1_2, shift: 1.6, falloff: 1.8, source: 0 };
  for (let i = 0; i < 200; i++) {
    const p = { x: (i % 13) - 1, y: (i % 17) - 1 };
    const q = { ...p };
    pushStroke(op, q);
    pullStroke(op, q);
    close(q.x, p.x);
    close(q.y, p.y);
  }
});

test('sampling inside the top drop returns its ink with depth < 1', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 4, y: 5, size: 'L', ink: 0 },
    { kind: 'drop', x: 6, y: 6, size: 'M', ink: 2 },
  ];
  const ops = moves.map((m, i) => moveToOp(m, i));
  const sample = sampleField(ops, 6.2, 6.1);
  assert.equal(sample.kind, 'ink');
  if (sample.kind === 'ink') {
    assert.equal(sample.source, 1);
    assert.ok(sample.depth < 1);
  }
});

test('pushThrough and pullThrough are inverses across a mixed stack', () => {
  const moves: Move[] = [
    { kind: 'drop', x: 4, y: 5, size: 'L', ink: 0 },
    { kind: 'stroke', x: 6, y: 6, heading: 30 },
    { kind: 'drop', x: 8, y: 10, size: 'S', ink: 1 },
  ];
  const ops = moves.map((m, i) => moveToOp(m, i));
  const p = { x: 1.3, y: 14.2 };
  const q = pushThrough(ops, 0, ops.length, { ...p });
  assert.ok(pullThrough(ops, 0, ops.length, q));
  close(q.x, p.x, 1e-8);
  close(q.y, p.y, 1e-8);
});

test('a swirl is undone exactly by the same swirl turning the other way', () => {
  const swirl = moveToOp({ kind: 'swirl', x: 6, y: 8, turn: 1 }, 0);
  const back = moveToOp({ kind: 'swirl', x: 6, y: 8, turn: -1 }, 1);
  for (let i = 0; i < 200; i++) {
    const p = { x: (i % 13) - 0.5, y: (i % 17) - 0.5 };
    const q = pushThrough([swirl, back], 0, 2, { ...p });
    close(q.x, p.x, 1e-9);
    close(q.y, p.y, 1e-9);
  }
});
