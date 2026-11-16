import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptQueue, TransientError } from './attempt-queue.ts';
import { AttemptConflictError } from '../game/attempt-sink.ts';
import type { ActionRequest, ActionResponse, LoggedAction } from '../../shared/protocol/api.ts';

const entry = (at: number): LoggedAction => ({ action: { type: 'absorb', move: 0 }, at, point: null });
const ok: ActionResponse = { kind: 'applied', verdict: 'correct', standing: null };
const noSleep = async () => undefined;

test('actions are delivered one at a time, in order, with consecutive sequence numbers', async () => {
  const seen: number[] = [];
  let inFlight = 0;
  const queue = createAttemptQueue({
    sheetId: 'd-2026-12-03',
    startSeq: 2,
    retries: 2,
    backoffMs: 1,
    sleep: noSleep,
    send: async (request: ActionRequest) => {
      inFlight++;
      assert.equal(inFlight, 1, 'never two requests at once');
      await new Promise((r) => setTimeout(r, 5));
      seen.push(request.seq);
      inFlight--;
      return ok;
    },
  });
  await Promise.all([queue.record(entry(1)), queue.record(entry(2)), queue.record(entry(3))]);
  assert.deepEqual(seen, [2, 3, 4]);
});

test('transient failures are retried; a conflict stops the queue', async () => {
  let calls = 0;
  const queue = createAttemptQueue({
    sheetId: 's',
    startSeq: 0,
    retries: 3,
    backoffMs: 1,
    sleep: noSleep,
    send: async () => {
      calls++;
      if (calls === 1) throw new TransientError('offline');
      if (calls === 3) return { kind: 'conflict', log: [] };
      return ok;
    },
  });
  await queue.record(entry(1));
  assert.equal(calls, 2, 'first action retried once');
  await assert.rejects(queue.record(entry(2)), AttemptConflictError);
  await assert.rejects(queue.record(entry(3)), AttemptConflictError);
  assert.equal(calls, 3, 'nothing is sent after a conflict');
});
