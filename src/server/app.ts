import { redis } from '@devvit/web/server';
import { AttemptService } from './core/attempts.ts';
import { NamingService } from './core/naming.ts';
import { PostService } from './core/posts.ts';
import { SheetService } from './core/sheets.ts';
import type { Store } from './core/store.ts';
import { devvitReddit, type RedditPort } from './reddit/reddit-port.ts';

/** The composition root: every service wired to its real dependencies. */
export type Services = {
  readonly sheets: SheetService;
  readonly attempts: AttemptService;
  readonly posts: PostService;
  readonly naming: NamingService;
  readonly reddit: RedditPort;
};

export const createServices = (store: Store, reddit: RedditPort): Services => {
  const sheets = new SheetService(store);
  const attempts = new AttemptService(store);
  const posts = new PostService(store, reddit);
  const naming = new NamingService({ store, reddit, sheets, attempts, posts });
  return { sheets, attempts, posts, naming, reddit };
};

export const services = createServices(redis, devvitReddit);
