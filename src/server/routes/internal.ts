import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type {
  OnCommentCreateRequest,
  OnCommentDeleteRequest,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared';
import { services } from '../app.ts';

/**
 * Endpoints Reddit calls on our behalf: triggers, scheduled tasks and
 * moderator menu actions. All are idempotent because delivery is
 * at-least-once and unordered.
 */
export const internal = new Hono();

/** Makes sure today's post and the Atelier exist and point at today's sheet. */
const publishToday = async (): Promise<string> => {
  const sheet = await services.sheets.byDate(services.sheets.today());
  const post = await services.posts.ensureDailyPost(sheet);
  await services.posts.ensureAtelier(sheet);
  return post.postId;
};

internal.post('/triggers/app-install', async (c) => {
  await services.sheets.ensureSecret();
  await publishToday();
  return c.json<TriggerResponse>({});
});

internal.post('/triggers/app-upgrade', async (c) => {
  await services.sheets.ensureSecret();
  await publishToday();
  return c.json<TriggerResponse>({});
});

internal.post('/triggers/comment-create', async (c) => {
  const event = await c.req.json<OnCommentCreateRequest>();
  const comment = event.comment;
  if (comment && !comment.deleted && !comment.spam) {
    await services.naming.onComment({ id: comment.id, parentId: comment.parentId, body: comment.body });
  }
  return c.json<TriggerResponse>({});
});

internal.post('/triggers/comment-delete', async (c) => {
  const event = await c.req.json<OnCommentDeleteRequest>();
  await services.naming.onCommentDeleted({ id: event.commentId, parentId: event.parentId });
  return c.json<TriggerResponse>({});
});

internal.post('/scheduler/daily-sheet', async (c) => {
  await publishToday();
  return c.json({ status: 'ok' });
});

internal.post('/scheduler/tally-names', async (c) => {
  await services.naming.tally();
  return c.json({ status: 'ok' });
});

internal.post('/menu/post-today', async (c) => {
  const postId = await publishToday();
  return c.json<UiResponse>({
    showToast: 'Today’s sheet is up.',
    navigateTo: `https://www.reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}`,
  });
});

internal.post('/menu/clear-name', async (c) => {
  const sheetId = context.postId ? await services.posts.sheetIdOfPost(context.postId) : null;
  if (!sheetId) return c.json<UiResponse>({ showToast: 'This post is not a daily sheet.' });
  await services.naming.clearName(sheetId);
  return c.json<UiResponse>({ showToast: 'Name cleared.' });
});
