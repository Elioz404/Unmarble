import type { SheetDescriptor } from '../../shared/protocol/api.ts';
import type { PostBinding } from '../../shared/protocol/post-data.ts';
import { NAMING } from '../../shared/naming/sheet-name.ts';
import type { RedditPort } from '../reddit/reddit-port.ts';
import { keys } from './keys.ts';
import type { Store } from './store.ts';

/**
 * The subreddit as the game board: one post per daily sheet, a pinned
 * naming comment under each, and the Atelier hub pinned on top that always
 * opens today's sheet.
 */

/** A post's address in a subreddit. */
export const postUrl = (subreddit: string, postId: string): string =>
  `https://www.reddit.com/r/${subreddit}/comments/${postId.replace(/^t3_/, '')}`;

/** Marks a special day's title in plain text. */
const SPECIAL_MARK = '✦';

/**
 * A daily post's title: the recipe it features (a special marked as one); a
 * Sunday chosen from the community credits its maker; a sheet from before
 * recipes names its colourway.
 */
export const sheetTitle = (sheet: SheetDescriptor): string => {
  const head = `Sheet No. ${sheet.number} · ${sheet.weekday} ${'★'.repeat(sheet.spec.stars)} · `;
  if (sheet.author) return head + `the week’s best trap, set by u/${sheet.author}`;
  if (sheet.recipe) return head + (sheet.recipe.special ? `${SPECIAL_MARK} ${sheet.recipe.title}` : sheet.recipe.title);
  return head + sheet.paletteName;
};

/** The post body for clients that cannot show the game. */
export const fallbackText = (sheet: SheetDescriptor): string =>
  [
    `**UNMARBLE — Sheet No. ${sheet.number}** (${sheet.weekday}, ${sheet.dateKey})`,
    ...(sheet.recipe ? ['', `*${sheet.recipe.title}*: ${sheet.recipe.promise}.`] : []),
    '',
    'A marbled sheet to undo, last move first. Open this post in the Reddit app or on new Reddit to play.',
  ].join('\n');

export const namingPrompt = (): string =>
  [
    '**What does this sheet look like?**',
    '',
    `Reply to this comment with a name of up to ${NAMING.maxWords} words. ` +
      'The best-voted reply names the sheet in the Book once everyone has had a go.',
  ].join('\n');

export const fieldNotes = (hands: number, cleans: number, leading: string | null): string =>
  [
    namingPrompt(),
    '',
    hands === 0
      ? '*Field notes:* no hands on this sheet yet. Be the first.'
      : `*Field notes:* ${hands} ${hands === 1 ? 'hand has' : 'hands have'} worked this sheet, ` +
        `${cleans} unmarbled it clean.${leading ? ` Leading name: **${leading}**.` : ''}`,
  ].join('\n');

/** The pinned comment under a trap post, kept current by the hourly job. */
export const trapNotes = (maker: string, sheetNumber: number, caught: number, hands: number): string =>
  [
    `**A trap set by u/${maker}** on Sheet No. ${sheetNumber}’s paper.`,
    '',
    hands === 0
      ? '*Caught so far:* nobody has sprung it yet. Be the first.'
      : `*Caught so far:* ${caught} of ${hands} ${hands === 1 ? 'hand' : 'hands'}.`,
    '',
    'Did it catch you? Reply with the move that fooled you.',
  ].join('\n');

type SheetPost = { readonly postId: string; readonly commentId: string | null };

/** How long a publishing run may hold the per-sheet lock. */
const PUBLISH_LOCK_MS = 60_000;

export class PublishInProgressError extends Error {
  constructor(sheetId: string) {
    super(`Sheet ${sheetId} is being published by another run`);
    this.name = 'PublishInProgressError';
  }
}

/**
 * Publishing steps for a daily post, recorded as they complete so that a run
 * that failed halfway is finished by the next one (cron, menu or upgrade)
 * instead of producing a duplicate post.
 */
const STEPS = ['postId', 'sorted', 'commentId', 'pinned', 'stickied'] as const;

export class PostService {
  readonly #store: Store;
  readonly #reddit: RedditPort;
  readonly #now: () => number;

  constructor(store: Store, reddit: RedditPort, now: () => number = Date.now) {
    this.#store = store;
    this.#reddit = reddit;
    this.#now = now;
  }

  async sheetPost(sheetId: string): Promise<SheetPost | null> {
    const raw = await this.#store.hGetAll(keys.sheetPost(sheetId));
    return raw.postId ? { postId: raw.postId, commentId: raw.commentId ?? null } : null;
  }

  /** Creates (or finishes creating) the daily post for a sheet. Idempotent. */
  async ensureDailyPost(sheet: SheetDescriptor): Promise<SheetPost> {
    const progressKey = keys.sheetPost(sheet.id);
    const done = await this.#store.hGetAll(progressKey);
    if (done.postId && STEPS.every((step) => done[step])) {
      return { postId: done.postId, commentId: done.commentId ?? null };
    }

    const lockKey = keys.publishLock(sheet.id);
    const expiration = new Date(this.#now() + PUBLISH_LOCK_MS);
    if (!(await this.#store.set(lockKey, '1', { nx: true, expiration }))) throw new PublishInProgressError(sheet.id);
    try {
      const mark = (fields: Record<string, string>) => this.#store.hSet(progressKey, fields);
      let postId = done.postId;
      if (!postId) {
        postId = await this.#reddit.submitSheetPost({
          title: sheetTitle(sheet),
          binding: { kind: 'daily', sheet },
          fallback: fallbackText(sheet),
        });
        await mark({ postId });
        await this.#store.hSet(keys.postSheets(), { [postId]: sheet.id });
      }
      if (!done.sorted) {
        await this.#reddit.suggestTopComments(postId);
        await mark({ sorted: '1' });
      }
      let commentId = done.commentId;
      if (!commentId) {
        commentId = await this.#reddit.submitComment(postId, namingPrompt());
        await mark({ commentId });
        await this.#store.hSet(keys.namingComments(), { [commentId]: sheet.id });
      }
      if (!done.pinned) {
        await this.#reddit.pinComment(commentId);
        await mark({ pinned: '1' });
      }
      if (!done.stickied) {
        await this.#reddit.stickyPost(postId, 2);
        await mark({ stickied: '1' });
      }
      return { postId, commentId };
    } finally {
      await this.#store.del(lockKey);
    }
  }

  /** Creates the Atelier hub once, and points it at today's sheet. */
  async ensureAtelier(today: SheetDescriptor): Promise<string> {
    const binding: PostBinding = { kind: 'atelier', sheet: today };
    const existing = await this.#store.get(keys.atelierPost());
    if (existing) {
      await this.#reddit.replaceBinding(existing, binding);
      return existing;
    }
    const postId = await this.#reddit.submitSheetPost({
      title: 'The Atelier · today’s sheet is always here',
      binding,
      fallback: 'UNMARBLE: a daily marbled sheet to undo, last move first. Open in the Reddit app or on new Reddit.',
    });
    await this.#store.set(keys.atelierPost(), postId);
    await this.#reddit.stickyPost(postId, 1);
    return postId;
  }

  /**
   * Forgets a deleted daily or Atelier post, so publishing creates it again
   * instead of pointing at a post that no longer exists.
   */
  async forgetPost(postId: string, sheetId: string | null): Promise<void> {
    if ((await this.#store.get(keys.atelierPost())) === postId) await this.#store.del(keys.atelierPost());
    if (!sheetId) return;
    const post = await this.sheetPost(sheetId);
    if (post?.postId !== postId) return;
    // Replies under a deleted thread can no longer be seen or voted on: they stop naming the sheet.
    if (post.commentId) await this.#store.hDel(keys.namingComments(), [post.commentId]);
    await this.#store.del(keys.sheetPost(sheetId), keys.names(sheetId));
  }

  async sheetIdOfPost(postId: string): Promise<string | null> {
    return (await this.#store.hGet(keys.postSheets(), postId)) ?? null;
  }

  /** Rewrites a daily post's data after its sheet changed (e.g. it got a name). */
  async refreshDailyPost(sheet: SheetDescriptor): Promise<void> {
    const post = await this.sheetPost(sheet.id);
    if (post) await this.#reddit.replaceBinding(post.postId, { kind: 'daily', sheet });
  }
}
