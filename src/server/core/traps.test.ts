import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../app-services.ts';
import { MemoryStore } from './store.ts';
import type { FlairLabel, RedditPort } from '../reddit/reddit-port.ts';
import type { Move } from '../../shared/puzzle/moves.ts';
import { readSheet } from '../../shared/puzzle/analysis.ts';
import type { PlayerAction } from '../../shared/game/session.ts';
import type { SheetDescriptor } from '../../shared/protocol/api.ts';
import { addDays } from '../../shared/time/calendar.ts';

/** A Reddit stand-in that records what the app asked it to do. */
const fakeReddit = () => {
  let posts = 0;
  let comments = 0;
  const flair = new Map<string, FlairLabel>();
  const banned = new Set<string>();
  /** Every comment's current text, and which are pinned. */
  const commentText = new Map<string, string>();
  const pinned = new Set<string>();
  const port: RedditPort = {
    submitSheetPost: async () => `t3_post${++posts}`,
    suggestTopComments: async () => undefined,
    stickyPost: async () => undefined,
    replaceBinding: async () => undefined,
    submitComment: async (_postId, text) => {
      const id = `t1_c${++comments}`;
      commentText.set(id, text);
      return id;
    },
    pinComment: async (commentId) => void pinned.add(commentId),
    editComment: async (commentId, text) => void commentText.set(commentId, text),
    liveCommentScore: async () => 0,
    userFlair: async (username) => flair.get(username) ?? null,
    setUserFlair: async (username, label) => void flair.set(username, label),
    removeUserFlair: async (username) => void flair.delete(username),
    isBanned: async (username) => banned.has(username),
  };
  return {
    port,
    flair,
    banned,
    commentText,
    pinned,
    posts: () => posts,
    flairText: (username: string) => flair.get(username)?.text,
  };
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
  assert.equal(reddit.flairText('proud'), '1-day Unmarble streak');
  await services.flair.setEnabled('t2_proud', 'proud', false, 1);
  assert.equal(reddit.flair.has('proud'), false);
});

test('banned users cannot set traps through the app', async () => {
  const { services, today, reddit } = await setup();
  reddit.banned.add('outcast');
  const response = await services.traps.publish({ playerId: 't2_out', username: 'outcast' }, FAIR_TRAP, today, 'unmarble');
  assert.deepEqual(response, { kind: 'rejected', reason: 'banned' });
  assert.equal(reddit.posts(), 0);
});

test('a trap a moderator removes leaves circulation, and comes back if approved', async () => {
  const { services, today } = await setup();
  const published = await services.traps.publish({ playerId: 't2_m', username: 'm' }, FAIR_TRAP, today, 'unmarble');
  if (published.kind !== 'published') throw new Error('trap not published');
  await services.traps.withdraw(published.sheet.id);
  assert.deepEqual(await services.traps.recent(10), []);
  await services.traps.reinstate(published.sheet.id);
  assert.deepEqual((await services.traps.recent(10)).map((trap) => trap.id), [published.sheet.id]);
});

test('featuring counts signed-in hands only, and never the maker’s own run', async () => {
  const { services, today, clock } = await setup('2026-12-03T15:00:00Z');
  const published = await services.traps.publish({ playerId: 't2_m', username: 'mossmaker' }, FAIR_TRAP, today, 'unmarble');
  if (published.kind !== 'published') throw new Error('trap not published');
  // The maker and a crowd of logged-out devices play it; only two real players do.
  await solve(services, published.sheet, 't2_m', true);
  for (const i of [0, 1, 2, 3, 4]) await solve(services, published.sheet, `anon:device${i}`, i % 2 === 0);
  for (const [i, clean] of [true, false].entries()) await solve(services, published.sheet, `t2_p${i}`, clean);
  clock.now = Date.parse('2026-12-06T00:05:00Z'); // Sunday
  const sunday = await services.sheets.todaySheet();
  assert.equal(sunday.author, null, 'two fair hands are not enough to feature it');
});

test('streak flair gives back the flair it replaced, and yields to a moderator', async () => {
  const { services, today, reddit } = await setup();
  reddit.flair.set('proud', { text: 'Marbler since 2020', cssClass: 'veteran' });
  await solve(services, today, 't2_proud', true);
  await services.flair.setEnabled('t2_proud', 'proud', true, 1);
  assert.equal(reddit.flairText('proud'), '1-day Unmarble streak');
  await services.flair.setEnabled('t2_proud', 'proud', false, 1);
  assert.deepEqual(reddit.flair.get('proud'), { text: 'Marbler since 2020', cssClass: 'veteran' });

  // Opted in again, then a moderator assigns a flair: the app steps aside for good.
  await services.flair.setEnabled('t2_proud', 'proud', true, 1);
  reddit.flair.set('proud', { text: 'Moderator pick', cssClass: 'mod' });
  await services.flair.onStreak('t2_proud', 2);
  assert.deepEqual(reddit.flair.get('proud'), { text: 'Moderator pick', cssClass: 'mod' });
  await services.flair.setEnabled('t2_proud', 'proud', false, 2);
  assert.deepEqual(reddit.flair.get('proud'), { text: 'Moderator pick', cssClass: 'mod' });
});

test('a trap post carries a pinned comment that keeps count of who it catches', async () => {
  const { services, today, reddit } = await setup();
  const published = await services.traps.publish({ playerId: 't2_m', username: 'mossmaker' }, FAIR_TRAP, today, 'unmarble');
  if (published.kind !== 'published') throw new Error('trap not published');
  const [notesId] = [...reddit.pinned];
  if (!notesId) throw new Error('no pinned notes');
  assert.match(reddit.commentText.get(notesId) ?? '', /set by u\/mossmaker.*nobody has sprung it yet/s);
  await solve(services, published.sheet, 't2_a', false);
  await solve(services, published.sheet, 't2_b', true);
  await services.traps.refreshNotes();
  assert.match(reddit.commentText.get(notesId) ?? '', /Caught so far:\* 1 of 2 hands/);
});

test('the maker sees how their trap is doing, and the leader for Sunday is marked in the Book', async () => {
  const { services, today } = await setup('2026-12-03T15:00:00Z');
  const published = await services.traps.publish({ playerId: 't2_m', username: 'mossmaker' }, FAIR_TRAP, today, 'unmarble');
  if (published.kind !== 'published') throw new Error('trap not published');
  for (const [i, clean] of [true, true, false].entries()) await solve(services, published.sheet, `t2_p${i}`, clean);
  assert.deepEqual(await services.traps.catchOf('t2_m', today.dateKey), {
    sheetId: published.sheet.id,
    caught: 1,
    hands: 3,
    setToday: true,
  });
  assert.equal((await services.traps.catchOf('t2_m', addDays(today.dateKey, 1)))?.setToday, false);
  assert.equal(await services.traps.catchOf('t2_p0', today.dateKey), null);
  const book = await services.book.forPlayer('t2_reader');
  assert.equal(book.traps[0]?.inTheRunning, true);
});

test('a sheet’s thread is its post, and names are gathered only while naming is open', async () => {
  const { services, today, clock } = await setup();
  assert.equal(await services.threadOf(today, 'unmarble'), null, 'no post yet');
  await services.posts.ensureDailyPost(today);
  const thread = await services.threadOf(today, 'unmarble');
  assert.equal(thread?.naming, true);
  assert.match(thread?.url ?? '', /^https:\/\/www\.reddit\.com\/r\/unmarble\/comments\/post1$/);
  clock.now += 3 * 86_400_000;
  assert.equal((await services.threadOf(today, 'unmarble'))?.naming, false);
});

test('a deleted daily post is forgotten, so it can be published again', async () => {
  const { services, today, reddit } = await setup();
  const first = await services.posts.ensureDailyPost(today);
  await services.posts.forgetPost(first.postId, today.id);
  const second = await services.posts.ensureDailyPost(today);
  assert.notEqual(second.postId, first.postId);
  assert.equal(reddit.posts(), 2);
});

test('streak flair written under its earlier wording is still the app’s to replace and to give back', async () => {
  const { services, reddit, today } = await setup();
  const store = services.flair;
  reddit.flair.set('veteran', { text: 'Marbler since 2020', cssClass: 'old' });
  await store.setEnabled('t2_vet', 'veteran', true, 1);
  // As an earlier version left it on Reddit.
  reddit.flair.set('veteran', { text: 'Unmarbled 4 days running', cssClass: '' });
  await solve(services, today, 't2_vet', true);
  assert.equal(reddit.flairText('veteran'), '1-day Unmarble streak');
  await store.setEnabled('t2_vet', 'veteran', false, 1);
  assert.deepEqual(reddit.flair.get('veteran'), { text: 'Marbler since 2020', cssClass: 'old' });
});

test('a hand counts as caught only once it has finished, so caught never exceeds hands', async () => {
  const { services, today } = await setup();
  const published = await services.traps.publish({ playerId: 't2_m', username: 'm' }, FAIR_TRAP, today, 'unmarble');
  if (published.kind !== 'published') throw new Error('trap not published');
  // Tears once, then walks away.
  await services.attempts.record(published.sheet, 't2_quitter', 0, { action: { type: 'absorb', move: 0 }, at: 1000, point: null });
  assert.deepEqual(await services.attempts.stats(published.sheet.id), { hands: 0, cleans: 0, caught: 0 });
  await solve(services, published.sheet, 't2_torn', false);
  assert.deepEqual(await services.attempts.stats(published.sheet.id), { hands: 1, cleans: 0, caught: 1 });
});

test('deleting a trap post erases the trap; deleting a daily post forgets its naming thread', async () => {
  const { services, today } = await setup();
  const published = await services.traps.publish({ playerId: 't2_m', username: 'm' }, FAIR_TRAP, today, 'unmarble');
  if (published.kind !== 'published') throw new Error('trap not published');
  await services.traps.erase(published.sheet.id);
  assert.equal(await services.traps.byId(published.sheet.id), null);
  assert.deepEqual(await services.traps.recent(10), []);

  const post = await services.posts.ensureDailyPost(today);
  if (!post.commentId) throw new Error('no naming comment');
  await services.naming.onComment({ id: 't1_name', parentId: post.commentId, body: 'Harbour fog' });
  await services.posts.forgetPost(post.postId, today.id);
  await services.naming.onComment({ id: 't1_late', parentId: post.commentId, body: 'Late name' });
  await services.naming.tally();
  assert.equal((await services.sheetById(today.id))?.name ?? null, null);
});
