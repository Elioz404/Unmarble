import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type {
  ActionResponse,
  BookResponse,
  FlairResponse,
  TrapResponse,
  ErrorResponse,
  ScarMap,
  SheetDescriptor,
  SheetResponse,
} from '../../shared/protocol/api.ts';
import { parseActionRequest, parseFlair, parseTrapRequest } from '../../shared/protocol/parse.ts';
import { parsePostBinding } from '../../shared/protocol/post-data.ts';
import { dailySheetId } from '../../shared/puzzle/daily.ts';
import { msUntilNextDay } from '../../shared/time/calendar.ts';
import { services } from '../app.ts';
import { anonymousPlayerId } from '../core/players.ts';

/**
 * Public client API. Every route is callable by anyone who can load the post,
 * so identity comes only from the Devvit context and bodies are parsed, never
 * trusted.
 */
export const api = new Hono();

/** Stable id of the player: their account, or the logged-out device id. */
const playerId = (): string | null => context.userId ?? (context.loid ? anonymousPlayerId(context.loid) : null);

/** The sheet this post is bound to: a daily or trap post's own sheet, or today's. */
const boundSheet = async (): Promise<SheetDescriptor> => {
  const binding = parsePostBinding(context.postData);
  if (binding?.kind === 'daily' || binding?.kind === 'trap') {
    const sheet = await services.sheetById(binding.sheet.id);
    if (sheet) return sheet;
  }
  return services.sheets.todaySheet();
};

api.get('/sheet', async (c) => {
  const requested = c.req.query('id');
  const sheet = requested ? await services.sheetById(requested) : await boundSheet();
  if (!sheet) return c.json<ErrorResponse>({ error: 'Unknown sheet' }, 404);
  const player = playerId();
  const today = services.sheets.today();
  const [view, stats, standing, thread, yourTrap, trapSetToday, tomorrow] = await Promise.all([
    services.attempts.playerView(sheet.id, player),
    services.attempts.stats(sheet.id),
    player ? services.attempts.standing(sheet, player) : Promise.resolve(null),
    services.threadOf(sheet, context.subredditName),
    context.userId ? services.traps.catchOf(context.userId, today) : Promise.resolve(null),
    context.userId ? services.traps.claimedOn(context.userId, today) : Promise.resolve(false),
    services.sheets.tomorrow(),
  ]);
  const now = Date.now();
  return c.json<SheetResponse>({
    sheet,
    player: { ...view, signedIn: Boolean(context.userId) },
    standing,
    stats,
    nextSheetAt: now + msUntilNextDay(now),
    todayId: dailySheetId(today),
    thread,
    yourTrap,
    trapSetToday,
    tomorrow,
  });
});

api.post('/attempt/action', async (c) => {
  const request = parseActionRequest(await c.req.json().catch(() => null));
  if (!request) return c.json<ErrorResponse>({ error: 'Malformed action' }, 400);
  const player = playerId();
  if (!player) return c.json<ErrorResponse>({ error: 'No player identity' }, 401);
  const sheet = await services.sheetById(request.sheetId);
  if (!sheet) return c.json<ErrorResponse>({ error: 'Unknown sheet' }, 404);
  const response = await services.attempts.record(sheet, player, request.seq, request.entry);
  return c.json<ActionResponse>(response, response.kind === 'conflict' ? 409 : 200);
});

api.get('/sheet/scars', async (c) => {
  const sheet = await services.sheetById(c.req.query('id') ?? '');
  if (!sheet) return c.json<ErrorResponse>({ error: 'Unknown sheet' }, 404);
  const map = await services.attempts.scarMap(sheet, playerId());
  if (!map) return c.json<ErrorResponse>({ error: 'Finish the sheet first' }, 403);
  return c.json<ScarMap>(map);
});

api.get('/book', async (c) => c.json<BookResponse>(await services.book.forPlayer(playerId())));

api.post('/traps', async (c) => {
  const request = parseTrapRequest(await c.req.json().catch(() => null));
  if (!request) return c.json<TrapResponse>({ kind: 'rejected', reason: 'invalid' }, 400);
  const username = context.username;
  if (!context.userId || !username) return c.json<TrapResponse>({ kind: 'rejected', reason: 'signed-out' }, 401);
  const today = await services.sheets.todaySheet();
  const response = await services.traps.publish(
    { playerId: context.userId, username },
    request.moves,
    today,
    context.subredditName,
  );
  return c.json<TrapResponse>(response, response.kind === 'published' ? 200 : 422);
});

api.post('/flair', async (c) => {
  const request = parseFlair(await c.req.json().catch(() => null));
  if (!request) return c.json<ErrorResponse>({ error: 'Malformed request' }, 400);
  const username = context.username;
  if (!context.userId || !username) return c.json<ErrorResponse>({ error: 'Sign in to show a flair' }, 401);
  const streak = await services.attempts.streak(context.userId);
  const enabled = await services.flair.setEnabled(context.userId, username, request.enabled, streak);
  return c.json<FlairResponse>({ enabled });
});
