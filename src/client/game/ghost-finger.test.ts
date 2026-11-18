import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDrag } from '../../shared/game/gestures.ts';
import { judgeAction, startSession } from '../../shared/game/session.ts';
import { LESSONS } from '../../shared/puzzle/tutorial.ts';
import { demoPath } from './ghost-finger.ts';

/** Every lesson state whose top move is undone by a drag: what the ghost finger shows there. */
const dragSteps = LESSONS.flatMap((lesson) =>
  lesson.spec.moves.flatMap((move, index) =>
    move.kind === 'drop' ? [] : [{ lesson: lesson.id, spec: lesson.spec, remaining: index + 1 }],
  ),
);

test('the lessons have folds and swirls for the ghost finger to show', () => {
  const kinds = new Set(dragSteps.map(({ spec, remaining }) => spec.moves[remaining - 1]?.kind));
  assert.deepEqual([...kinds].sort(), ['stroke', 'swirl']);
});

test('the ghost finger draws a gesture that really undoes the top move, against its grain', () => {
  for (const { lesson, spec, remaining } of dragSteps) {
    const path = demoPath(spec, remaining);
    assert.ok(path, `${lesson}: no ghost path`);
    const action = resolveDrag(spec, remaining, path);
    assert.ok(action, `${lesson}: the ghost's gesture reads as nothing`);
    const state = { ...startSession(spec), remaining };
    assert.equal(judgeAction(spec, state, action), 'correct', `${lesson}: the ghost's gesture would tear the sheet`);
  }
});

test('a drop on top needs no showing: it is a plain tap', () => {
  for (const lesson of LESSONS) {
    lesson.spec.moves.forEach((move, index) => {
      if (move.kind === 'drop') assert.equal(demoPath(lesson.spec, index + 1), null, lesson.id);
    });
  }
});
