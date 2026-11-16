import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../app-services.ts';
import { MemoryStore } from './store.ts';
import type { RedditPort } from '../reddit/reddit-port.ts';
import type { Move } from '../../shared/puzzle/moves.ts';
import { readSheet } from '../../shared/puzzle/analysis.ts';
import type { PlayerAction } from '../../shared/game/session.ts';
import type { SheetDescriptor } from '../../shared/protocol/api.ts';

/** A Reddit stand-in that records what the app asked it to do. */
const fakeReddit = () => {
  let posts = 0;
  const flair = new Map<string, string>();
  const port: RedditPort = {
    submitSheetPost: async () => `t3_post${++posts}`,
    suggestTopComments: async () => undefined,
    stickyPost: async () => undefined,
    replaceBinding: async () => undefined,
    submitComment: async () => `t1_c${++posts}`,
    pinComment: async () => undefined,
    editComment: async () => undefined,
    liveCommentScore: async () => 0,
    subscribeCurrentUser: async () => undefined,
    setUserFlair: async (username, text) => void flair.set(username, text),
    removeUserFlair: async (username) => void flair.delete(username),
  };
  return { port, flair, posts: () => posts };
};

/** A small trap that is fair on any paper: three drops, each pushing the last (no folds to depend on the stripes). */
const FAIR_TRAP: Move[] = [
  { kind: 'drop', x: 5, y: 9, size: 'L', ink: 0 },
  { kind: 'drop', x: 7.5, y: 8, size: 'M', ink: 3 },
  { kind: 'drop', x: 6.5, y: 6, size: 'S', ink: 1 },
];

const setup = async (iso = '2026-12-03T15:00:00Z') => {
  const clock = { now: Date.parse(iso) };
  const reddit = fakeReddit();
  const services = createServices(new MemoryStore(), reddit.port, () => clock.now);
  const today = await services.sheets.todaySheet();
  return { clock, reddit, services, today };
};

const solve = async (
  services: ReturnType<typeof createServices>,
  sheet: SheetDescriptor,
  player: string,
  clean: boolean,
): Promise<void> => {
  const steps = readSheet(sheet.spec.moves).steps;
  const actions: PlayerAction[] = steps.map((step) => {
    const move = sheet.spec.moves[step.top];
    if (move?.kind === 'stroke') return { type: 'unstroke', move: step.top, against: true };
    if (move?.kind === 'swirl') return { type: 'unswirl', move: step.top, against: true };
    return { type: 'absorb', move: step.top };
  });
  const sequence: PlayerAction[] = clean
    ? actions
    : Array.from({ length: 3 }, () => (sheet.spec.moves[0]?.kind === 'drop' ? { type: 'absorb', move: 0 } : { type: 'magnify' }));
  for (const [i, action] of sequence.entries()) {
    await services.attempts.record(sheet, player, i, { action, at: (i + 1) * 1000, point: null });
  }
};

test('a fair trap is published as a post on today’s paper, once per player per day', async () => {
  const { services, today, reddit } = await setup();
  const maker = { playerId: 't2_maker', username: 'maker' };
  const first = await services.traps.publish(maker, FAIR_TRAP, today, 'unmarble');
  assert.equal(first.kind, 'published');
  if (first.kind !== 'published') return;
  assert.equal(first.sheet.kind, 'trap');
  assert.equal(first.sheet.author, 'maker');
  assert.deepEqual(first.sheet.spec.ground, today.spec.ground);
  assert.equal(reddit.posts(), 1, 'the trap is its own post');
  assert.deepEqual(await services.sheetById(first.sheet.id), first.sheet);
  const second = await services.traps.publish(maker, FAIR_TRAP, today, 'unmarble');
  assert.deepEqual(second, { kind: 'rejected', reason: 'daily-limit' });
});

test('an unfair trap is refused by the server whatever the client claims', async () => {
  const { services, today } = await setup();
  const hidden: Move[] = [
    { kind: 'drop', x: 3, y: 3, size: 'S', ink: 0 },
    { kind: 'drop', x: 9, y: 13, size: 'S', ink: 1 },
    { kind: 'drop', x: 3, y: 13, size: 'S', ink: 2 },
  ];
  const response = await services.traps.publish({ playerId: 't2_x', username: 'x' }, hidden, today, 'unmarble');
  assert.deepEqual(response, { kind: 'rejected', reason: 'unfair' });
});

test('the week’s most-played fair trap becomes the Sunday sheet, credited to its maker', async () => {
  const { services, today, clock } = await setup('2026-12-03T15:00:00Z');
  const published = await services.traps.publish({ playerId: 't2_m', username: 'mossmaker' }, FAIR_TRAP, today, 'unmarble');
  if (published.kind !== 'published') throw new Error('trap not published');
  // Four hands: three clean, one torn — devious but fair.
  for (const [i, clean] of [true, true, true, false].entries()) await solve(services, published.sheet, `t2_p${i}`, clean);
  clock.now = Date.parse('2026-12-06T00:05:00Z'); // Sunday
  const sunday = await services.sheets.todaySheet();
  assert.equal(sunday.kind, 'daily');
  assert.equal(sunday.author, 'mossmaker');
  assert.deepEqual(sunday.spec.moves, FAIR_TRAP);
});

test('the Book lists past dailies and traps with the player’s standing on each', async () => {
  const { services, today } = await setup();
  const published = await services.traps.publish({ playerId: 't2_m', username: 'm' }, FAIR_TRAP, today, 'unmarble');
  if (published.kind !== 'published') throw new Error('trap not published');
  await solve(services, today, 't2_reader', true);
  const book = await services.book.forPlayer('t2_reader');
  assert.equal(book.dailies[0]?.sheet.id, today.id);
  assert.equal(book.dailies[0]?.status, 'clean');
  assert.equal(book.traps[0]?.status, 'unplayed');
});

test('streak flair is written only for players who opt in, and follows the streak', async () => {
  const { services, today, reddit } = await setup();
  await solve(services, today, 't2_quiet', true);
  assert.equal(reddit.flair.size, 0);
  await services.flair.setEnabled('t2_proud', 'proud', true, 0);
  await solve(services, today, 't2_proud', true);
  assert.equal(reddit.flair.get('proud'), 'Unmarbled 1 day running');
  await services.flair.setEnabled('t2_proud', 'proud', false, 1);
  assert.equal(reddit.flair.has('proud'), false);
});
