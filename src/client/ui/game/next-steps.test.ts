import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySheet } from '../../../shared/puzzle/daily.ts';
import type { BookEntry, BookStatus, SheetDescriptor } from '../../../shared/protocol/api.ts';
import { nextSteps, trapToSpring, type NextStepsInput } from './next-steps.ts';

const SIGNED_IN: NextStepsInput = {
  sheetKind: 'daily',
  signedIn: true,
  trapToSpring: false,
  trapSetToday: false,
  thread: true,
  community: true,
};

const all = (steps: ReturnType<typeof nextSteps>) =>
  [steps.primary, ...steps.secondary, ...steps.more, ...steps.quiet].filter((step) => step !== null);

test('someone else’s trap comes first, with setting one’s own still in sight', () => {
  const steps = nextSteps({ ...SIGNED_IN, trapToSpring: true });
  assert.equal(steps.primary, 'spring-trap');
  assert.deepEqual(steps.secondary, ['set-trap']);
  assert.deepEqual(steps.more, ['thread', 'book', 'practice', 'flair']);
  assert.deepEqual(steps.quiet, ['join']);
});

test('with no trap to spring, setting one is the call, and it is not offered twice', () => {
  const steps = nextSteps(SIGNED_IN);
  assert.equal(steps.primary, 'set-trap');
  assert.deepEqual(steps.secondary, []);
});

test('once today’s trap is set, the Book is the call and setting another is not offered', () => {
  const steps = nextSteps({ ...SIGNED_IN, trapSetToday: true });
  assert.equal(steps.primary, 'book');
  assert.ok(!all(steps).includes('set-trap'));
  assert.deepEqual(steps.more, ['thread', 'practice', 'flair']);
});

test('signed out: the Book is the call, a trap stays in sight, sign-in is a quiet link, and there is no flair', () => {
  const steps = nextSteps({ ...SIGNED_IN, signedIn: false });
  assert.equal(steps.primary, 'book');
  assert.deepEqual(steps.secondary, ['set-trap']);
  assert.ok(!steps.more.includes('flair'));
  assert.deepEqual(steps.quiet, ['join', 'sign-in']);
});

test('after a trap there is no flair; without a post or a subreddit, neither is offered', () => {
  const steps = nextSteps({ ...SIGNED_IN, sheetKind: 'trap', thread: false, community: false });
  assert.deepEqual(steps.more, ['book', 'practice']);
  assert.deepEqual(steps.quiet, []);
});

test('while the Book is still being read, no call to act is offered, so none can change under a finger', () => {
  for (const signedIn of [true, false]) {
    const steps = nextSteps({ ...SIGNED_IN, signedIn, trapToSpring: null });
    assert.equal(steps.primary, null);
    assert.deepEqual(steps.secondary, []);
    assert.ok(steps.more.includes('book'), 'the Book stays a tap away meanwhile');
  }
});

test('every step appears once, and once the Book is read there is always exactly one primary', () => {
  for (const signedIn of [true, false])
    for (const trap of [true, false])
      for (const setToday of [true, false]) {
        const next = nextSteps({ ...SIGNED_IN, signedIn, trapToSpring: trap, trapSetToday: setToday });
        assert.notEqual(next.primary, null);
        const steps = all(next);
        assert.equal(new Set(steps).size, steps.length, steps.join());
      }
});

const SHEET = buildDailySheet('2026-12-03', 'seed', 'calendar', '2026-11-25');
const trap = (id: string, author: string, status: BookStatus = 'unplayed', mine = false): BookEntry => ({
  sheet: { ...SHEET, id, kind: 'trap', author, recipe: null } satisfies SheetDescriptor,
  status,
  stats: { hands: 0, cleans: 0, caught: 0 },
  inTheRunning: false,
  mine,
});

test('the trap to spring is the newest untried one, never the sheet just played', () => {
  const traps = [trap('t3', 'reed', 'clean'), trap('t2', 'moss'), trap('t1', 'fern')];
  assert.equal(trapToSpring(traps, 'daily')?.id, 't2');
  assert.equal(trapToSpring(traps, 't2')?.id, 't1');
  assert.equal(trapToSpring([trap('t3', 'reed', 'playing')], 'daily'), null);
});

test('the player’s own traps are never offered, however old', () => {
  const traps = [trap('mine-new', 'me', 'clean', true), trap('mine-old', 'me', 'unplayed', true), trap('t1', 'fern')];
  assert.equal(trapToSpring(traps, 'daily')?.id, 't1');
  assert.equal(trapToSpring([trap('mine-old', 'me', 'unplayed', true)], 'daily'), null);
});
