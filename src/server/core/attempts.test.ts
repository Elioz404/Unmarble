import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttemptService } from './attempts.ts';
import { SheetService } from './sheets.ts';
import { MemoryStore } from './store.ts';
import { readSheet } from '../../shared/puzzle/analysis.ts';
import type { PlayerAction } from '../../shared/game/session.ts';
import type { ActionResponse, SheetDescriptor } from '../../shared/protocol/api.ts';

const START = Date.parse('2026-12-03T15:00:00Z');

const setup = async () => {
  const clock = { now: START };
  const store = new MemoryStore();
  const sheets = new SheetService(store, () => clock.now);
  const attempts = new AttemptService(store, () => clock.now);
  const sheet = await sheets.todaySheet();
  return { clock, store, sheets, attempts, sheet };
};

/** The rule bot's solution: undo the top move each time, seams against their grain. */
const solution = (sheet: SheetDescriptor): PlayerAction[] =>
  readSheet(sheet.spec.moves).steps.map((step) => {
    const move = sheet.spec.moves[step.top];
    return move?.kind === 'stroke'
      ? { type: 'unstroke', move: step.top, against: true }
      : { type: 'absorb', move: step.top };
  });

const applied = (response: ActionResponse) => {
  assert.equal(response.kind, 'applied');
  if (response.kind !== 'applied') throw new Error('expected an applied response');
  return response;
};

test('only today and already-published sheets exist', async () => {
  const { sheets, sheet } = await setup();
  assert.deepEqual(await sheets.todaySheet(), sheet);
  assert.equal(await sheets.byId('d-2099-01-01'), null, 'no future sheets');
  assert.equal(await sheets.byId('d-2026-11-30'), null, 'past sheets are never generated on demand');
  assert.equal(await sheets.byId('d-2026-02-31'), null, 'invalid dates are rejected');
});

test('a clean solve ranks the player, counts the hand and starts a streak', async () => {
  const { attempts, sheet, clock } = await setup();
  let last: ActionResponse | null = null;
  for (const [i, action] of solution(sheet).entries()) {
    clock.now = START + (i + 1) * 1000;
    last = await attempts.record(sheet, 'u1', i, { action, at: (i + 1) * 1000, point: null });
    assert.equal(applied(last).verdict, 'correct');
  }
  const standing = last ? applied(last).standing : null;
  assert.ok(standing);
  assert.equal(standing.rank, 1);
  assert.equal(standing.result.clean, true);
  assert.deepEqual(await attempts.stats(sheet.id), { hands: 1, cleans: 1, caught: 0 });
  assert.equal(await attempts.streak('u1'), 1);
  assert.deepEqual(await attempts.standing(sheet, 'u1'), standing, 'standing survives a reload');
});

test('ranked time never beats the server clock', async () => {
  const { attempts, sheet, clock } = await setup();
  const steps = solution(sheet);
  for (const [i, action] of steps.entries()) {
    clock.now = START + i * 20_000; // Really took 20 s per move…
    await attempts.record(sheet, 'cheat', i, { action, at: i, point: null }); // …but claims 1 ms.
  }
  const standing = await attempts.standing(sheet, 'cheat');
  assert.ok(standing);
  assert.ok(standing.result.durationMs >= (steps.length - 1) * 20_000);
});

test('a retried action is acknowledged once and never double-counted', async () => {
  const { attempts, sheet } = await setup();
  const [first] = solution(sheet);
  if (!first) throw new Error('empty solution');
  const entry = { action: first, at: 900, point: null };
  const a = applied(await attempts.record(sheet, 'u2', 0, entry));
  const b = applied(await attempts.record(sheet, 'u2', 0, entry));
  assert.equal(a.verdict, b.verdict);
  assert.equal((await attempts.logOf(sheet.id, 'u2')).length, 1);
});

test('gaps and stale sequences come back as a conflict with the true log', async () => {
  const { attempts, sheet } = await setup();
  const [first, second] = solution(sheet);
  if (!first || !second) throw new Error('short solution');
  const gap = await attempts.record(sheet, 'u3', 1, { action: second, at: 500, point: null });
  assert.equal(gap.kind, 'conflict');
  await attempts.record(sheet, 'u3', 0, { action: first, at: 400, point: null });
  const stale = await attempts.record(sheet, 'u3', 0, { action: second, at: 600, point: null });
  assert.equal(stale.kind, 'conflict');
  if (stale.kind === 'conflict') assert.equal(stale.log.length, 1);
});

test('blots persist: a reload cannot undo a mistake, and scars stay private until the end', async () => {
  const { attempts, sheet } = await setup();
  const wrong: PlayerAction =
    sheet.spec.moves[0]?.kind === 'drop' ? { type: 'absorb', move: 0 } : { type: 'unstroke', move: 0, against: true };
  assert.equal(applied(await attempts.record(sheet, 'u4', 0, { action: wrong, at: 500, point: { x: 6, y: 8 } })).verdict, 'blot');
  assert.equal((await attempts.playerView(sheet.id, 'u4')).log.length, 1);
  assert.equal(await attempts.scarMap(sheet, 'u4'), null);
});

test('a sheet begun on its day keeps the streak even if finished after midnight', async () => {
  const { attempts, sheet, clock } = await setup();
  clock.now = Date.parse('2026-12-03T23:59:00Z');
  const steps = solution(sheet);
  for (const [i, action] of steps.entries()) {
    if (i === steps.length - 1) clock.now = Date.parse('2026-12-04T00:01:00Z');
    await attempts.record(sheet, 'late', i, { action, at: (i + 1) * 1000, point: null });
  }
  assert.equal((await attempts.progress('late')).lastDay, '2026-12-03');
});
