import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../puzzle/moves.ts';
import type { SheetSpec } from '../puzzle/sheet.ts';
import { CLEAN_SEAL, shareLine, type ShareHeading } from './scoring.ts';
import { applyAction, startSession, type PlayerAction } from './session.ts';

const MOVES: Move[] = [
  { kind: 'drop', x: 5, y: 8, size: 'L', ink: 0 },
  { kind: 'drop', x: 7.5, y: 8, size: 'M', ink: 1 },
  { kind: 'stroke', x: 6, y: 8, heading: 90 },
];

const SPEC: SheetSpec = {
  paletteId: 'harbor-cobalt',
  ground: { family: 'bands', period: 1.2, angle: 0, amplitude: 0, wavelength: 6 },
  moves: MOVES,
  stars: 2,
};

const UNFOLD: PlayerAction = { type: 'unstroke', move: 2, against: true };
const CLEAN_READING: readonly PlayerAction[] = [UNFOLD, { type: 'absorb', move: 1 }, { type: 'absorb', move: 0 }];

/** Plays `actions` a second apart (from 1:20 in, so the time reads in minutes). */
const play = (actions: readonly PlayerAction[]) =>
  actions.reduce((state, action, i) => applyAction(SPEC, state, action, 80_000 + i * 1000).state, startSession(SPEC));

const DAILY: ShareHeading = { heading: 'No.12 · Saturday', title: '“Peacock Eye”', stars: 2, community: 'UnmarbleGame' };

test('a share line names the sheet, its marks, and where it is played, in three lines', () => {
  const lines = shareLine(DAILY, play([{ type: 'absorb', move: 1 }, ...CLEAN_READING])).split('\n');
  assert.deepEqual(lines, ['UNMARBLE No.12 · Saturday ★★ · “Peacock Eye”', '○●●●', '1 tear · 1:23 · r/UnmarbleGame']);
});

test('a clean sheet with no tear and no Lens earns the seal; the Lens or a tear withholds it', () => {
  assert.equal(shareLine(DAILY, play(CLEAN_READING)).split('\n')[2], `${CLEAN_SEAL} · 1:22 · r/UnmarbleGame`);
  const magnified = shareLine(DAILY, play([{ type: 'magnify' }, ...CLEAN_READING])).split('\n');
  assert.deepEqual(magnified.slice(1), ['●●● ◐', 'clean · 1:23 · r/UnmarbleGame']);
  assert.doesNotMatch(shareLine(DAILY, play([{ type: 'absorb', move: 0 }, ...CLEAN_READING])), new RegExp(CLEAN_SEAL));
});

test('without a title or a community, the line leaves them out rather than leaving gaps', () => {
  const lines = shareLine({ heading: '· a trap by u/mossmaker', title: null, stars: 3, community: null }, play(CLEAN_READING));
  assert.deepEqual(lines.split('\n'), ['UNMARBLE · a trap by u/mossmaker ★★★', '●●●', `${CLEAN_SEAL} · 1:22`]);
});

test('a share line is spoiler-free: it never names a kind of move', () => {
  const line = shareLine({ ...DAILY, title: null }, play([{ type: 'absorb', move: 1 }, ...CLEAN_READING]));
  assert.doesNotMatch(line, /drop|fold|stroke|swirl/i);
});
