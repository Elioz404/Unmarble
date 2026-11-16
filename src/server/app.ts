import { redis } from '@devvit/web/server';
import { createServices } from './app-services.ts';
import { devvitReddit } from './reddit/reddit-port.ts';

/** The composition root: the services over Devvit's Redis and Reddit API. */
export const services = createServices(redis, devvitReddit);
