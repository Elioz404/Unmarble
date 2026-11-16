import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttemptService } from './attempts.ts';
import { SheetService } from './sheets.ts';
import { MemoryStore } from './store.ts';
import { readSheet } from '../../shared/puzzle/analysis.ts';
import type { PlayerAction } from '../../shared/game/session.ts';
import type { SheetDescriptor } from '../../shared/protocol/api.ts';

const NOW = Date.parse('2026-12-03T15:00:00Z');

const setup = async () => {
  const store = new MemoryStore();
  const sheets = new SheetService(store, () => NOW);
  const attempts = new AttemptService(store, () => sheets.today());
  const sheet = await sheets.byDate(sheets.today());
  return { store, sheets, attempts, sheet };
};

/** The rule bot's solution: undo the top move each time, seams against their grain. */
const solution = (sheet: SheetDescriptor): PlayerAction[] =>
  readSheet(sheet.spec.moves).steps.map((step) => {
    const move = sheet.spec.moves[step.top];
    return move?.kind === 'stroke'
      ? { type: 'unstroke', move: step.top, against: true }
      : { type: 'absorb', move: step.top };
  });

test('the daily sheet is generated once and cached identically', async () => {
  const { sheets, sheet } = await setup();
  assert.deepEqual(await sheets.byDate(sheet.dateKey), sheet);
  assert.equal(await sheets.byId('d-2099-01-01'), null, 'future sheets do not exist');
});

test('a clean solve ranks the player, counts the hand and starts a streak', async () => {
  const { attempts, sheet } = await setup();
  let last = null;
  for (const [i, action] of solution(sheet).entries()) {
    last = await attempts.record(sheet, 'u1', { action, at: (i + 1) * 1000, point: null });
    assert.equal(last.verdict, 'correct');
  }
  assert.ok(last?.standing);
  assert.equal(last.standing.rank, 1);
  assert.equal(last.standing.result.clean, true);
  assert.deepEqual(await attempts.stats(sheet.id), { hands: 1, cleans: 1 });
  assert.equal(await attempts.streak('u1'), 1);
});

test('replayed logs keep blots: a reload cannot undo a mistake', async () => {
  const { attempts, sheet } = await setup();
  const wrong: PlayerAction = sheet.spec.moves[0]?.kind === 'drop' ? { type: 'absorb', move: 0 } : { type: 'unstroke', move: 0, against: true };
  const response = await attempts.record(sheet, 'u2', { action: wrong, at: 500, point: { x: 6, y: 8 } });
  assert.equal(response.verdict, 'blot');
  const view = await attempts.playerView(sheet.id, 'u2');
  assert.equal(view.log.length, 1);
  assert.equal(await attempts.scarMap(sheet, 'u2'), null, 'no scar map before finishing');
});

test('out-of-order timestamps and finished attempts are ignored', async () => {
  const { attempts, sheet } = await setup();
  const [first] = solution(sheet);
  if (!first) throw new Error('empty solution');
  await attempts.record(sheet, 'u3', { action: first, at: 2000, point: null });
  const late = await attempts.record(sheet, 'u3', { action: first, at: 1000, point: null });
  assert.equal(late.verdict, 'ignored');
});
