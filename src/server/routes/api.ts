import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type {
  ActionResponse,
  ErrorResponse,
  ScarMap,
  SheetDescriptor,
  SheetResponse,
} from '../../shared/protocol/api.ts';
import { parseActionRequest } from '../../shared/protocol/parse.ts';
import { parsePostBinding } from '../../shared/protocol/post-data.ts';
import { dailySheetId } from '../../shared/puzzle/daily.ts';
import { msUntilNextDay } from '../../shared/time/calendar.ts';
import { services } from '../app.ts';

/**
 * Public client API. Every route is callable by anyone who can load the post,
 * so identity comes only from the Devvit context and bodies are parsed, never
 * trusted.
 */
export const api = new Hono();

/** Stable id of the player: their account, or the logged-out device id. */
const playerId = (): string | null => context.userId ?? (context.loid ? `anon:${context.loid}` : null);

/** The sheet this post is bound to: a daily post's own sheet, or today's. */
const boundSheet = async (): Promise<SheetDescriptor> => {
  const binding = parsePostBinding(context.postData);
  if (binding?.kind === 'daily') {
    const sheet = await services.sheets.byId(binding.sheet.id);
    if (sheet) return sheet;
  }
  return services.sheets.todaySheet();
};

api.get('/sheet', async (c) => {
  const sheet = await boundSheet();
  const player = playerId();
  const [view, stats, standing] = await Promise.all([
    services.attempts.playerView(sheet.id, player),
    services.attempts.stats(sheet.id),
    player ? services.attempts.standing(sheet, player) : Promise.resolve(null),
  ]);
  const now = Date.now();
  return c.json<SheetResponse>({
    sheet,
    player: { ...view, signedIn: Boolean(context.userId) },
    standing,
    stats,
    nextSheetAt: now + msUntilNextDay(now),
    todayId: dailySheetId(services.sheets.today()),
  });
});

api.post('/attempt/action', async (c) => {
  const request = parseActionRequest(await c.req.json().catch(() => null));
  if (!request) return c.json<ErrorResponse>({ error: 'Malformed action' }, 400);
  const player = playerId();
  if (!player) return c.json<ErrorResponse>({ error: 'No player identity' }, 401);
  const sheet = await services.sheets.byId(request.sheetId);
  if (!sheet) return c.json<ErrorResponse>({ error: 'Unknown sheet' }, 404);
  const response = await services.attempts.record(sheet, player, request.seq, request.entry);
  return c.json<ActionResponse>(response, response.kind === 'conflict' ? 409 : 200);
});

api.get('/sheet/scars', async (c) => {
  const sheet = await services.sheets.byId(c.req.query('id') ?? '');
  if (!sheet) return c.json<ErrorResponse>({ error: 'Unknown sheet' }, 404);
  const map = await services.attempts.scarMap(sheet, playerId());
  if (!map) return c.json<ErrorResponse>({ error: 'Finish the sheet first' }, 403);
  return c.json<ScarMap>(map);
});

api.post('/subscribe', async (c) => {
  if (!context.userId) return c.json<ErrorResponse>({ error: 'Sign in to subscribe' }, 401);
  await services.reddit.subscribeCurrentUser();
  return c.json({ ok: true });
});
