import { exitExpandedMode, requestExpandedMode, showLoginPrompt } from '@devvit/web/client';
import { API, type ActionRequest, type SheetResponse, type Standing } from '../../shared/protocol/api.ts';
import { parseActionResponse, parseScarMap, parseSheetResponse } from '../../shared/protocol/parse.ts';
import { localPrefs } from '../lib/local-prefs.ts';
import type { Platform } from './platform.ts';

/** Name of the expanded entry point in devvit.json. */
const GAME_ENTRY = 'game';

class ApiError extends Error {
  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = 'ApiError';
  }
}

/** Fetches a server route and validates the body with `parse`. */
const call = async <T>(path: string, parse: (value: unknown) => T | null, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) throw new ApiError(path, `HTTP ${response.status}`);
  const parsed = parse(await response.json());
  if (parsed === null) throw new ApiError(path, 'unexpected response');
  return parsed;
};

const parseOk = (value: unknown): boolean | null =>
  typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean' ? value.ok : null;

/** The Platform backed by the Devvit server and Reddit's client effects. */
export const createRedditPlatform = (): Platform => ({
  kind: 'reddit',
  loadSheet: (): Promise<SheetResponse> => call(API.sheet, parseSheetResponse),
  sinkFor: (sheetId) => ({
    record: async (entry): Promise<Standing | null> => {
      const body: ActionRequest = { sheetId, entry };
      const response = await call(API.action, parseActionResponse, { method: 'POST', body: JSON.stringify(body) });
      return response.standing;
    },
  }),
  fetchScars: (sheetId) => call(`${API.scars}?id=${encodeURIComponent(sheetId)}`, parseScarMap).catch(() => null),
  openGame: (event) => requestExpandedMode(event, GAME_ENTRY),
  closeGame: (event) => exitExpandedMode(event),
  promptLogin: () => showLoginPrompt(),
  subscribe: () => call(API.subscribe, parseOk, { method: 'POST' }).catch(() => false),
  needsLessons: () => !localPrefs.tutorialDone(),
  markLessonsDone: () => localPrefs.setTutorialDone(),
});
