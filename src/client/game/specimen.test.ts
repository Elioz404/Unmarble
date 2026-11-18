import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession } from '../../shared/game/session.ts';
import { LESSONS } from '../../shared/puzzle/tutorial.ts';
import { answerFor } from './specimen.ts';

const lesson = (id: string) => {
  const found = LESSONS.find((candidate) => candidate.id === id);
  assert.ok(found, `no lesson ${id}`);
  return { spec: found.spec, state: startSession(found.spec) };
};

test('a specimen reads its top move as right', () => {
  for (const { id, spec } of LESSONS) {
    const top = spec.moves.length - 1;
    const move = spec.moves[top];
    assert.ok(move, id);
    const action =
      move.kind === 'drop'
        ? { type: 'absorb' as const, move: top }
        : { type: move.kind === 'stroke' ? ('unstroke' as const) : ('unswirl' as const), move: top, against: true };
    assert.equal(answerFor(spec, startSession(spec), action), 'right', id);
  }
});

test('an earlier drop is wrong: something came after it', () => {
  const { spec, state } = lesson('round-is-last');
  assert.equal(answerFor(spec, state, { type: 'absorb', move: 0 }), 'wrong');
});

test('a fold dragged with its grain is the right one the wrong way', () => {
  const { spec, state } = lesson('seam');
  assert.equal(answerFor(spec, state, { type: 'unstroke', move: 1, against: false }), 'wrong-way');
});

test('a swirl circled with its turn is the right one the wrong way', () => {
  const { spec, state } = lesson('swirl');
  assert.equal(answerFor(spec, state, { type: 'unswirl', move: 1, against: false }), 'wrong-way');
});

test('the drop under a fold is wrong, not the wrong way', () => {
  const { spec, state } = lesson('seam');
  assert.equal(answerFor(spec, state, { type: 'absorb', move: 0 }), 'wrong');
});

test('a touch that reads as nothing, or as a mark that is not there, answers nothing', () => {
  const { spec, state } = lesson('seam');
  assert.equal(answerFor(spec, state, null), 'none');
  assert.equal(answerFor(spec, state, { type: 'unswirl', move: 1, against: true }), 'none');
  assert.equal(answerFor(spec, { ...state, remaining: 1 }, { type: 'unstroke', move: 1, against: true }), 'none');
});
