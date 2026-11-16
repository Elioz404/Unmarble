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

export const sheetTitle = (sheet: SheetDescriptor): string =>
  `Sheet No. ${sheet.number} · ${sheet.weekday} ${'★'.repeat(sheet.spec.stars)} · ${sheet.paletteName}`;

const fallbackText = (sheet: SheetDescriptor): string =>
  [
    `**UNMARBLE — Sheet No. ${sheet.number}** (${sheet.weekday}, ${sheet.dateKey})`,
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
    `*Field notes:* ${hands} ${hands === 1 ? 'hand has' : 'hands have'} worked this sheet, ` +
      `${cleans} unmarbled it clean.${leading ? ` Leading name: **${leading}**.` : ''}`,
  ].join('\n');

type SheetPost = { readonly postId: string; readonly commentId: string | null };

export class PostService {
  readonly #store: Store;
  readonly #reddit: RedditPort;

  constructor(store: Store, reddit: RedditPort) {
    this.#store = store;
    this.#reddit = reddit;
  }

  async sheetPost(sheetId: string): Promise<SheetPost | null> {
    const raw = await this.#store.hGetAll(keys.sheetPost(sheetId));
    return raw.postId ? { postId: raw.postId, commentId: raw.commentId ?? null } : null;
  }

  /** Creates the daily post for a sheet if it does not exist yet (idempotent). */
  async ensureDailyPost(sheet: SheetDescriptor): Promise<SheetPost> {
    const existing = await this.sheetPost(sheet.id);
    if (existing) return existing;
    const binding: PostBinding = { kind: 'daily', sheet };
    const postId = await this.#reddit.submitSheetPost({
      title: sheetTitle(sheet),
      binding,
      fallback: fallbackText(sheet),
    });
    await this.#store.hSet(keys.sheetPost(sheet.id), { postId });
    await this.#store.hSet(keys.postSheets(), { [postId]: sheet.id });
    const commentId = await this.#reddit.submitPinnedComment(postId, namingPrompt());
    await this.#store.hSet(keys.sheetPost(sheet.id), { commentId });
    await this.#store.hSet(keys.namingComments(), { [commentId]: sheet.id });
    await this.#reddit.stickyPost(postId, 2);
    return { postId, commentId };
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

  async sheetIdOfPost(postId: string): Promise<string | null> {
    return (await this.#store.hGet(keys.postSheets(), postId)) ?? null;
  }

  /** Rewrites a daily post's data after its sheet changed (e.g. it got a name). */
  async refreshDailyPost(sheet: SheetDescriptor): Promise<void> {
    const post = await this.sheetPost(sheet.id);
    if (post) await this.#reddit.replaceBinding(post.postId, { kind: 'daily', sheet });
  }
}
