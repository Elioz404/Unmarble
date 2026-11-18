import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../../../shared/config.ts';
import { apprenticeRun } from '../../../shared/game/apprentice.ts';
import { applyAction, startSession, type PlayerAction } from '../../../shared/game/session.ts';
import type { Move } from '../../../shared/puzzle/moves.ts';
import { recipeById, recipeTag } from '../../../shared/puzzle/recipes.ts';
import type { SheetSpec } from '../../../shared/puzzle/sheet.ts';
import type { SheetDescriptor } from '../../../shared/protocol/api.ts';
import { COPY } from '../copy.ts';
import { apprenticeLine } from './apprentice-line.ts';

const specOf = (moves: Move[]): SheetSpec => ({
  paletteId: 'harbor-cobalt',
  ground: { family: 'bands', period: 1.2, angle: 0, amplitude: 0, wavelength: 6 },
  moves,
  stars: 1,
});

const sheetOf = (spec: SheetSpec, recipeId: string): SheetDescriptor => ({
  id: 'sheet',
  kind: 'daily',
  author: null,
  number: 12,
  dateKey: '2026-11-16',
  weekday: 'Monday',
  paletteName: 'Harbor Cobalt',
  spec,
  name: null,
  recipe: recipeTag(recipeById(recipeId) ?? assert.fail(`no ${recipeId} recipe`)),
});

const play = (spec: SheetSpec, actions: readonly PlayerAction[]) =>
  actions.reduce((state, action, i) => applyAction(spec, state, action, (i + 1) * 1000).state, startSession(spec));

/** The roundest drop lies under a fold: the Apprentice trusts the drop. */
const folded = specOf([
  { kind: 'drop', x: 5, y: 8, size: 'L', ink: 0 },
  { kind: 'drop', x: 7.5, y: 8, size: 'M', ink: 1 },
  { kind: 'stroke', x: 6, y: 8, heading: 90 },
]);

test('it names the dotted drop the Apprentice trusted, and the fold on top', () => {
  const run = apprenticeRun(folded);
  const fell = COPY.apprentice.fellFor(1, 'stroke', true);
  const outread = play(folded, [
    { type: 'unstroke', move: 2, against: true },
    { type: 'absorb', move: 1 },
    { type: 'absorb', move: 0 },
  ]);
  assert.equal(apprenticeLine(sheetOf(folded, 'old-fold'), outread, run), COPY.apprentice.outread(fell));
  const tore = play(folded, [
    { type: 'absorb', move: 1 },
    { type: 'unstroke', move: 2, against: true },
    { type: 'absorb', move: 1 },
    { type: 'absorb', move: 0 },
  ]);
  assert.equal(apprenticeLine(sheetOf(folded, 'old-fold'), tore, run), COPY.apprentice.bothTore(fell));
});

test('with no drop left to trust, it names the top move it undid the wrong way', () => {
  const spec = specOf([
    { kind: 'stroke', x: 6, y: 8, heading: 90 },
    { kind: 'drop', x: 6, y: 8, size: 'M', ink: 0 },
  ]);
  const run = apprenticeRun(spec);
  const player = play(spec, [
    { type: 'absorb', move: 1 },
    { type: 'unstroke', move: 0, against: true },
  ]);
  assert.equal(
    apprenticeLine(sheetOf(spec, 'old-fold'), player, run),
    COPY.apprentice.outread(COPY.apprentice.fellFor(2, 'stroke', false)),
  );
});

test('a player whose sheet gave way first hears where the Apprentice fell', () => {
  // The roundest drop lies under a fold, then a less round drop fell last.
  const spec = specOf([
    { kind: 'drop', x: 5, y: 8, size: 'L', ink: 0 },
    { kind: 'stroke', x: 6, y: 8, heading: 90 },
    { kind: 'drop', x: 8, y: 8, size: 'M', ink: 1 },
  ]);
  const run = apprenticeRun(spec);
  const player = play(spec, Array.from({ length: RULES.maxBlots }, () => ({ type: 'absorb', move: 0 }) as const));
  assert.equal(player.status, 'torn');
  const [tear] = run.tears;
  assert.ok(tear);
  assert.equal(
    apprenticeLine(sheetOf(spec, 'old-fold'), player, run),
    COPY.apprentice.unreached(COPY.apprentice.fellFor(tear.step, tear.missedKind, true)),
  );
});

test('an unfooled Apprentice: a rest day says so, any other sheet says why', () => {
  const spec = specOf([
    { kind: 'drop', x: 4, y: 6, size: 'L', ink: 0 },
    { kind: 'drop', x: 9, y: 10, size: 'M', ink: 1 },
  ]);
  const run = apprenticeRun(spec);
  const player = play(spec, [
    { type: 'absorb', move: 1 },
    { type: 'absorb', move: 0 },
  ]);
  assert.equal(apprenticeLine(sheetOf(spec, 'ink-only'), player, run), COPY.apprentice.restDay);
  assert.equal(apprenticeLine(sheetOf(spec, 'old-fold'), player, run), COPY.apprentice.unfooled);
});
