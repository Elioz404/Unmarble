import type { SheetDescriptor } from '../shared/protocol/api.ts';
import { AttemptService } from './core/attempts.ts';
import { BookService } from './core/book.ts';
import { FlairService } from './core/flair.ts';
import { NamingService } from './core/naming.ts';
import { PostService } from './core/posts.ts';
import { SheetService } from './core/sheets.ts';
import type { Store } from './core/store.ts';
import { isTrapId, TrapService } from './core/traps.ts';
import type { RedditPort } from './reddit/reddit-port.ts';

/**
 * Every server service wired together. Pure: storage and Reddit are injected,
 * so tests compose the very same graph over in-memory fakes.
 */
export type Services = {
  readonly sheets: SheetService;
  readonly attempts: AttemptService;
  readonly posts: PostService;
  readonly naming: NamingService;
  readonly traps: TrapService;
  readonly book: BookService;
  readonly flair: FlairService;
  readonly reddit: RedditPort;
  /** Any playable sheet by id: a daily sheet or a trap. */
  readonly sheetById: (id: string) => Promise<SheetDescriptor | null>;
};

export const createServices = (store: Store, reddit: RedditPort, now: () => number = Date.now): Services => {
  const flair = new FlairService(store, reddit);
  const sheets = new SheetService(store, now);
  const attempts = new AttemptService(store, now, flair.onStreak);
  const traps = new TrapService(store, reddit, attempts, now);
  sheets.featureFrom((sunday) => traps.featuredFor(sunday));
  const posts = new PostService(store, reddit, now);
  const naming = new NamingService({ store, reddit, sheets, attempts, posts });
  const book = new BookService(sheets, traps, attempts);
  const sheetById = (id: string) => (isTrapId(id) ? traps.byId(id) : sheets.byId(id));
  return { sheets, attempts, posts, naming, traps, book, flair, reddit, sheetById };
};
