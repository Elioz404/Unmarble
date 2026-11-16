import { nameThreshold, parseSheetName } from '../../shared/naming/sheet-name.ts';
import { addDays } from '../../shared/time/calendar.ts';
import type { RedditPort } from '../reddit/reddit-port.ts';
import type { AttemptService } from './attempts.ts';
import { keys } from './keys.ts';
import { fieldNotes, type PostService } from './posts.ts';
import type { SheetService } from './sheets.ts';
import type { Store } from './store.ts';

/** Days after its date during which a sheet's name can still change. */
const NAMING_WINDOW_DAYS = 2;

/**
 * The naming ritual, driven by native comments: replies to a sheet's pinned
 * comment are candidates; an hourly tally reads their live scores (removed
 * or spam replies never count) and names the sheet after the best one.
 */
export class NamingService {
  readonly #store: Store;
  readonly #reddit: RedditPort;
  readonly #sheets: SheetService;
  readonly #attempts: AttemptService;
  readonly #posts: PostService;

  constructor(deps: {
    store: Store;
    reddit: RedditPort;
    sheets: SheetService;
    attempts: AttemptService;
    posts: PostService;
  }) {
    this.#store = deps.store;
    this.#reddit = deps.reddit;
    this.#sheets = deps.sheets;
    this.#attempts = deps.attempts;
    this.#posts = deps.posts;
  }

  /** Called for every new comment; only direct replies to a naming comment matter. */
  async onComment(comment: { id: string; parentId: string; body: string }): Promise<void> {
    const sheetId = await this.#store.hGet(keys.namingComments(), comment.parentId);
    if (!sheetId) return;
    const name = parseSheetName(comment.body);
    if (name) await this.#store.hSet(keys.names(sheetId), { [comment.id]: name });
  }

  /** Called when a comment is deleted: its candidacy goes with it. */
  async onCommentDeleted(comment: { id: string; parentId: string }): Promise<void> {
    const sheetId = await this.#store.hGet(keys.namingComments(), comment.parentId);
    if (sheetId) await this.#store.hDel(keys.names(sheetId), [comment.id]);
  }

  /** Re-reads the scores of recent candidates and settles names. */
  async tally(): Promise<void> {
    const today = this.#sheets.today();
    for (let back = 0; back <= NAMING_WINDOW_DAYS; back++) {
      const sheet = await this.#sheets.byDate(addDays(today, -back));
      await this.#tallySheet(sheet.id);
    }
  }

  async clearName(sheetId: string): Promise<void> {
    await this.#store.hDel(keys.names(sheetId), Object.keys(await this.#store.hGetAll(keys.names(sheetId))));
    await this.#sheets.setName(sheetId, null);
    const sheet = await this.#sheets.byId(sheetId);
    if (sheet) await this.#posts.refreshDailyPost(sheet);
  }

  async #tallySheet(sheetId: string): Promise<void> {
    const candidates = await this.#store.hGetAll(keys.names(sheetId));
    const stats = await this.#attempts.stats(sheetId);
    let best: { name: string; score: number } | null = null;
    for (const [commentId, name] of Object.entries(candidates)) {
      const score = await this.#reddit.liveCommentScore(commentId);
      if (score === null) {
        await this.#store.hDel(keys.names(sheetId), [commentId]);
        continue;
      }
      if (!best || score > best.score) best = { name, score };
    }
    const settled = best && best.score >= nameThreshold(stats.hands) ? best.name : null;
    const sheet = await this.#sheets.byId(sheetId);
    if (!sheet) return;
    if (settled && settled !== sheet.name) {
      await this.#sheets.setName(sheetId, settled);
      await this.#posts.refreshDailyPost({ ...sheet, name: settled });
    }
    const post = await this.#posts.sheetPost(sheetId);
    if (post?.commentId) await this.#reddit.editComment(post.commentId, fieldNotes(stats.hands, stats.cleans, best?.name ?? null));
  }
}
