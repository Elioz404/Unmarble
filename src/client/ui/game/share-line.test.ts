import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, startSession, type PlayerAction } from '../../../shared/game/session.ts';
import type { Move } from '../../../shared/puzzle/moves.ts';
import type { SheetSpec } from '../../../shared/puzzle/sheet.ts';
import { buildDailySheet } from '../../../shared/puzzle/daily.ts';
import type { SheetDescriptor } from '../../../shared/protocol/api.ts';
import { COPY } from '../copy.ts';
import { shareHeadingOf, shareLine, type ShareHeading } from './share-line.ts';

const SEAL = COPY.result.shareText.seal;

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
  assert.equal(shareLine(DAILY, play(CLEAN_READING)).split('\n')[2], `${SEAL} · 1:22 · r/UnmarbleGame`);
  const magnified = shareLine(DAILY, play([{ type: 'magnify' }, ...CLEAN_READING])).split('\n');
  assert.deepEqual(magnified.slice(1), ['●●● ◐', 'clean · 1:23 · r/UnmarbleGame']);
  assert.ok(!shareLine(DAILY, play([{ type: 'absorb', move: 0 }, ...CLEAN_READING])).includes(SEAL));
});

test('without a title or a community, the line leaves them out rather than leaving gaps', () => {
  const lines = shareLine({ heading: '· a trap by u/mossmaker', title: null, stars: 3, community: null }, play(CLEAN_READING));
  assert.deepEqual(lines.split('\n'), ['UNMARBLE · a trap by u/mossmaker ★★★', '●●●', `${SEAL} · 1:22`]);
});

test('a share line is spoiler-free: it never names a kind of move', () => {
  const line = shareLine({ ...DAILY, title: null }, play([{ type: 'absorb', move: 1 }, ...CLEAN_READING]));
  assert.doesNotMatch(line, /drop|fold|stroke|swirl/i);
});

test('a sheet heads its share line by number and day, a trap by its maker, and by its community name first', () => {
  const daily = buildDailySheet('2026-12-03', 'seed', 'calendar', '2026-11-25');
  assert.equal(shareHeadingOf(daily, 'unmarble').heading, `No.${daily.number} · ${daily.weekday}`);
  assert.equal(shareHeadingOf(daily, null).title, daily.recipe?.title ?? null);
  assert.equal(shareHeadingOf({ ...daily, name: 'Peacock Eye' }, null).title, '“Peacock Eye”');
  const trap: SheetDescriptor = { ...daily, id: 'trap-1', kind: 'trap', author: 'mossmaker', recipe: null };
  assert.deepEqual(shareHeadingOf(trap, 'unmarble'), {
    heading: '· a trap by u/mossmaker',
    title: null,
    stars: trap.spec.stars,
    community: 'unmarble',
  });
});
