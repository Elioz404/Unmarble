import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, replaySession, startSession, type PlayerAction } from './session.ts';
import { resolveSwipe, resolveTap } from './gestures.ts';
import { rankScore, resultOf } from './scoring.ts';
import { headingVector, type Move } from '../puzzle/moves.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import { RULES } from '../config.ts';

const moves: Move[] = [
  { kind: 'drop', x: 5, y: 8, size: 'L', ink: 0 },
  { kind: 'drop', x: 7.5, y: 8, size: 'M', ink: 1 },
  { kind: 'stroke', x: 6, y: 8, heading: 90 },
];
const spec: SheetSpec = {
  paletteId: 'harbor-cobalt',
  ground: { family: 'bands', period: 1.2, angle: 0, amplitude: 0, wavelength: 6 },
  moves,
  stars: 1,
};

test('unmarbling top-down in the right direction cleans the sheet', () => {
  let state = startSession(spec);
  const actions: PlayerAction[] = [
    { type: 'unstroke', move: 2, against: true },
    { type: 'absorb', move: 1 },
    { type: 'absorb', move: 0 },
  ];
  actions.forEach((action, i) => {
    const t = applyAction(spec, state, action, (i + 1) * 1000);
    assert.equal(t.verdict, 'correct');
    state = t.state;
  });
  assert.equal(state.status, 'clean');
  assert.equal(resultOf(state).durationMs, 3000);
});

test('acting on a covered move, or dragging a seam with its grain, is a blot', () => {
  let state = startSession(spec);
  assert.equal(applyAction(spec, state, { type: 'absorb', move: 1 }, 1).verdict, 'blot');
  state = applyAction(spec, state, { type: 'unstroke', move: 2, against: false }, 2).state;
  assert.equal(state.blots, 1);
  assert.equal(state.remaining, 3);
});

test('enough blots tear the sheet and further actions are ignored', () => {
  let state = startSession(spec);
  for (let i = 0; i < RULES.maxBlots; i++) state = applyAction(spec, state, { type: 'absorb', move: 0 }, i).state;
  assert.equal(state.status, 'torn');
  assert.equal(applyAction(spec, state, { type: 'unstroke', move: 2, against: true }, 99).verdict, 'ignored');
});

test('the magnifier works once and is recorded', () => {
  let state = startSession(spec);
  state = applyAction(spec, state, { type: 'magnify' }, 1).state;
  assert.equal(state.magnified, true);
  assert.equal(applyAction(spec, state, { type: 'magnify' }, 2).verdict, 'ignored');
});

test('replaying a log reproduces the state', () => {
  const log = [
    { action: { type: 'absorb', move: 0 } as const, at: 10, point: null },
    { action: { type: 'unstroke', move: 2, against: true } as const, at: 20, point: null },
  ];
  const state = replaySession(spec, log);
  assert.equal(state.blots, 1);
  assert.equal(state.remaining, 2);
});

test('rank scores order clean before torn, fewer blots first, then time', () => {
  const base = { clean: true, blots: 0, magnified: false, durationMs: 60_000, moves: 3 };
  assert.ok(rankScore(base) < rankScore({ ...base, durationMs: 61_000 }));
  assert.ok(rankScore({ ...base, durationMs: 900_000 }) < rankScore({ ...base, blots: 1 }));
  assert.ok(rankScore({ ...base, blots: 2 }) < rankScore({ ...base, clean: false, blots: 0 }));
});

test('a tap on the top drop resolves to that drop; on bare ground to nothing', () => {
  assert.deepEqual(resolveTap(spec, 2, { x: 7.6, y: 8 }), { type: 'absorb', move: 1 });
  assert.equal(resolveTap(spec, 2, { x: 1, y: 1 }), null);
});

test('a swipe along the seam resolves to the stroke and reads its direction', () => {
  const u = headingVector(90);
  const from = { x: 6 + u.x * 3, y: 8 + u.y * 3 };
  const to = { x: 6 - u.x * 3, y: 8 - u.y * 3 };
  assert.deepEqual(resolveSwipe(spec, 3, from, to), { type: 'unstroke', move: 2, against: true });
  assert.deepEqual(resolveSwipe(spec, 3, to, from), { type: 'unstroke', move: 2, against: false });
  assert.equal(resolveSwipe(spec, 3, { x: 1, y: 2 }, { x: 1, y: 2.5 }), null);
});

test('regression: a swipe beside the top seam never resolves to a nearby buried seam', () => {
  // Two near-parallel seams: buried stroke 1 and top stroke 2, half a cell apart.
  const tight: SheetSpec = {
    ...spec,
    moves: [
      { kind: 'drop', x: 6, y: 9, size: 'L', ink: 0 },
      { kind: 'stroke', x: 4.5, y: 7, heading: 0 },
      { kind: 'stroke', x: 8.5, y: 7.5, heading: 180 },
    ],
  };
  const action = resolveSwipe(tight, 3, { x: 7, y: 7.5 }, { x: 10, y: 7.5 });
  assert.deepEqual(action, { type: 'unstroke', move: 2, against: true });
});
