import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../config.ts';
import { readSheet } from '../puzzle/analysis.ts';
import { generateSheet } from '../puzzle/generator.ts';
import type { Move } from '../puzzle/moves.ts';
import { recipeById } from '../puzzle/recipes.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import { PALETTES } from '../sheet/palettes.ts';
import { apprenticeRun, compareWithApprentice } from './apprentice.ts';
import { marksOf } from './scoring.ts';
import { applyAction, replaySession, startSession, type PlayerAction } from './session.ts';

const specOf = (moves: Move[]): SheetSpec => ({
  paletteId: 'harbor-cobalt',
  ground: { family: 'bands', period: 1.2, angle: 0, amplitude: 0, wavelength: 6 },
  moves,
  stars: 1,
});

/** Two drops under a fold: the roundest drop is not the last move. */
const folded = specOf([
  { kind: 'drop', x: 5, y: 8, size: 'L', ink: 0 },
  { kind: 'drop', x: 7.5, y: 8, size: 'M', ink: 1 },
  { kind: 'stroke', x: 6, y: 8, heading: 90 },
]);

const play = (spec: SheetSpec, actions: readonly PlayerAction[]) =>
  actions.reduce((state, action, i) => applyAction(spec, state, action, (i + 1) * 1000).state, startSession(spec));

test('the Apprentice tears on a fold on top, is shown it, and finishes clean', () => {
  const run = apprenticeRun(folded);
  assert.equal(run.state.status, 'clean');
  assert.equal(marksOf(run.state), '○●●●');
  assert.equal(run.tears.length, 1);
  const [tear] = run.tears;
  assert.equal(tear?.step, 1);
  assert.equal(tear?.missed, 2, 'the fold was on top');
  assert.equal(tear?.missedKind, 'stroke');
  assert.equal(folded.moves[tear?.fellFor ?? -1]?.kind, 'drop', 'it fell for a drop');
  assert.equal(run.tears.length, readSheet(folded.moves).naiveFailures);
});

test('its run is an ordinary attempt: the shared reducer replays it to the same state', () => {
  const run = apprenticeRun(folded);
  const log = run.state.history.map(({ action, at, point }) => ({ action, at, point }));
  assert.deepEqual(replaySession(folded, log), run.state);
});

test('too many misreadings tear the sheet under the Apprentice, as they would a player', () => {
  const strokes: Move[] = Array.from({ length: RULES.maxBlots + 1 }, (_, i) => ({
    kind: 'stroke',
    x: 3 + 2 * i,
    y: 8,
    heading: 90,
  }));
  const run = apprenticeRun(specOf([{ kind: 'drop', x: 8, y: 8, size: 'L', ink: 0 }, ...strokes]));
  assert.equal(run.state.status, 'torn');
  assert.equal(run.tears.length, RULES.maxBlots);
  assert.equal(marksOf(run.state), '○●'.repeat(RULES.maxBlots - 1) + '○');
});

test('with no drop left to trust, it drags the top fold with its grain', () => {
  const spec = specOf([
    { kind: 'stroke', x: 6, y: 8, heading: 90 },
    { kind: 'drop', x: 6, y: 8, size: 'M', ink: 0 },
  ]);
  const run = apprenticeRun(spec);
  assert.equal(marksOf(run.state), '●○●');
  assert.deepEqual(run.tears, [{ step: 2, fellFor: 0, missed: 0, missedKind: 'stroke' }]);
  assert.deepEqual(run.state.history[1]?.action, { type: 'unstroke', move: 0, against: false });
});

test('generated sheets: Ink Only never fools it, every other recipe does', () => {
  const palette = PALETTES[0]?.id ?? '';
  for (const id of ['ink-only', 'fold-on-top', 'storm-4']) {
    const recipe = recipeById(id);
    assert.ok(recipe, id);
    const { spec, reading } = generateSheet(`apprentice-${id}`, recipe, palette);
    const run = apprenticeRun(spec);
    assert.equal(run.tears.length, Math.min(reading.naiveFailures, RULES.maxBlots), id);
    assert.equal(run.state.status === 'clean', reading.naiveFailures < RULES.maxBlots, id);
    if (id === 'ink-only') assert.equal(run.tears.length, 0, 'the rest day');
    else assert.ok(run.tears.length > 0, `${id} fools it`);
  }
});

test('a player who read the fold it missed out-reads the Apprentice', () => {
  const run = apprenticeRun(folded);
  const player = play(folded, [
    { type: 'unstroke', move: 2, against: true },
    { type: 'absorb', move: 1 },
    { type: 'absorb', move: 0 },
  ]);
  assert.deepEqual(compareWithApprentice(player, run), { kind: 'outread', tear: run.tears[0] });
});

test('a player who tore where it tore shares its mistake; a Lens is no undo', () => {
  const run = apprenticeRun(folded);
  const player = play(folded, [
    { type: 'magnify' },
    { type: 'absorb', move: 1 },
    { type: 'unstroke', move: 2, against: true },
    { type: 'absorb', move: 1 },
    { type: 'absorb', move: 0 },
  ]);
  assert.deepEqual(compareWithApprentice(player, run), { kind: 'both-tore', tear: run.tears[0] });
});

test('a player whose sheet gave way before its tear never met it', () => {
  const spec = specOf([
    { kind: 'drop', x: 5, y: 8, size: 'L', ink: 0 },
    { kind: 'stroke', x: 6, y: 8, heading: 90 },
    { kind: 'drop', x: 8, y: 8, size: 'M', ink: 1 },
  ]);
  const run = apprenticeRun(spec);
  assert.equal(run.tears[0]?.step, 2);
  const player = play(spec, Array.from({ length: RULES.maxBlots }, () => ({ type: 'absorb', move: 0 }) as const));
  assert.equal(player.status, 'torn');
  assert.deepEqual(compareWithApprentice(player, run), { kind: 'unreached', tear: run.tears[0] });
});

test('when the Apprentice never tears, there is nothing to compare', () => {
  const spec = specOf([
    { kind: 'drop', x: 4, y: 6, size: 'L', ink: 0 },
    { kind: 'drop', x: 9, y: 10, size: 'M', ink: 1 },
  ]);
  const run = apprenticeRun(spec);
  assert.equal(run.state.status, 'clean');
  assert.deepEqual(compareWithApprentice(play(spec, [{ type: 'absorb', move: 1 }, { type: 'absorb', move: 0 }]), run), {
    kind: 'unfooled',
  });
});
