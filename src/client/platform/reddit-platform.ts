import { context, exitExpandedMode, navigateTo, requestExpandedMode, showLoginPrompt, showShareSheet } from '@devvit/web/client';
import { API, type ActionRequest, type FlairRequest, type SheetResponse, type TrapRequest } from '../../shared/protocol/api.ts';
import {
  parseActionResponse,
  parseBookResponse,
  parseFlair,
  parseScarMap,
  parseSheetResponse,
  parseTrapResponse,
} from '../../shared/protocol/parse.ts';
import { createAttemptQueue, TransientError } from './attempt-queue.ts';
import { copyToClipboard, type Platform } from './platform.ts';

const isPostId = (id: string): id is `t3_${string}` => id.startsWith('t3_');

/** Name of the expanded entry point in devvit.json. */
const GAME_ENTRY = 'game';
/** A request that has not answered by then is treated as a network failure. */
const REQUEST_TIMEOUT_MS = 10_000;
const ACTION_RETRIES = 4;
const ACTION_BACKOFF_MS = 400;
/** HTTP status the server uses when the client's attempt log has diverged. */
const CONFLICT = 409;

class ApiError extends Error {
  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = 'ApiError';
  }
}

/**
 * Fetches a server route and validates the body with `parse`. Network errors,
 * timeouts and 5xx are TransientErrors; `accept` lists non-2xx statuses whose
 * body is still meaningful.
 */
const call = async <T>(
  path: string,
  parse: (value: unknown) => T | null,
  init?: RequestInit,
  accept: readonly number[] = [],
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (error) {
    throw new TransientError(`${path}: ${error instanceof Error ? error.message : 'network error'}`);
  }
  if (response.status >= 500) throw new TransientError(`${path}: HTTP ${response.status}`);
  if (!response.ok && !accept.includes(response.status)) throw new ApiError(path, `HTTP ${response.status}`);
  const parsed = parse(await response.json());
  if (parsed === null) throw new ApiError(path, 'unexpected response');
  return parsed;
};

/** HTTP status the server uses for a trap it refuses (the body says why). */
const UNPROCESSABLE = 422;
const UNAUTHORIZED = 401;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** The Platform backed by the Devvit server and Reddit's client effects. */
export const createRedditPlatform = (): Platform => ({
  kind: 'reddit',
  loadSheet: (sheetId): Promise<SheetResponse> =>
    call(sheetId ? `${API.sheet}?id=${encodeURIComponent(sheetId)}` : API.sheet, parseSheetResponse),
  sinkFor: (sheetId, startSeq) =>
    createAttemptQueue({
      sheetId,
      startSeq,
      retries: ACTION_RETRIES,
      backoffMs: ACTION_BACKOFF_MS,
      sleep,
      send: (request: ActionRequest) =>
        call(API.action, parseActionResponse, { method: 'POST', body: JSON.stringify(request) }, [CONFLICT]),
    }),
  fetchScars: (sheetId) => call(`${API.scars}?id=${encodeURIComponent(sheetId)}`, parseScarMap).catch(() => null),
  loadBook: () => call(API.book, parseBookResponse),
  publishTrap: (moves) => {
    const body: TrapRequest = { moves };
    return call(API.traps, parseTrapResponse, { method: 'POST', body: JSON.stringify(body) }, [UNPROCESSABLE, UNAUTHORIZED]);
  },
  setFlair: async (enabled) => {
    const body: FlairRequest = { enabled };
    const response = await call(API.flair, parseFlair, { method: 'POST', body: JSON.stringify(body) });
    return response.enabled;
  },
  openPost: (url) => navigateTo(url),
  openGame: (event) => requestExpandedMode(event, GAME_ENTRY),
  closeGame: (event) => exitExpandedMode(event),
  promptLogin: () => showLoginPrompt(),
  community: context.subredditName,
  openCommunity: () => navigateTo(`https://www.reddit.com/r/${context.subredditName}`),
  share: async (text, postId) => {
    const copied = await copyToClipboard(text);
    try {
      await showShareSheet({ title: 'UNMARBLE', text, ...(postId && isPostId(postId) ? { post: postId } : {}) });
      return copied === 'copied' ? 'copied' : 'shared';
    } catch {
      return copied;
    }
  },
});
