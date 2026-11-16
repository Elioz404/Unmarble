import { SHEET } from '../config.ts';
import type { PlayerAction, SheetPoint } from '../game/session.ts';
import { MAX_MOVES } from '../puzzle/sheet.ts';
import type { ActionRequest, LoggedAction } from './api.ts';

/** Validators for untrusted request bodies and stored records. */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMoveIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MAX_MOVES;

/** Longest attempt we record: a day. */
const MAX_AT_MS = 86_400_000;

export const parseAction = (value: unknown): PlayerAction | null => {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'magnify':
      return { type: 'magnify' };
    case 'absorb':
      return isMoveIndex(value.move) ? { type: 'absorb', move: value.move } : null;
    case 'unstroke':
      return isMoveIndex(value.move) && typeof value.against === 'boolean'
        ? { type: 'unstroke', move: value.move, against: value.against }
        : null;
    default:
      return null;
  }
};

const parsePoint = (value: unknown): SheetPoint | null | undefined => {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { x, y } = value;
  if (typeof x !== 'number' || typeof y !== 'number') return undefined;
  if (!(x >= 0 && x <= SHEET.cols && y >= 0 && y <= SHEET.rows)) return undefined;
  return { x, y };
};

export const parseLoggedAction = (value: unknown): LoggedAction | null => {
  if (!isRecord(value)) return null;
  const action = parseAction(value.action);
  const point = parsePoint(value.point);
  const { at } = value;
  if (!action || point === undefined) return null;
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > MAX_AT_MS) return null;
  return { action, at: Math.round(at), point };
};

export const parseActionRequest = (value: unknown): ActionRequest | null => {
  if (!isRecord(value) || typeof value.sheetId !== 'string' || value.sheetId.length > 64) return null;
  const entry = parseLoggedAction(value.entry);
  return entry ? { sheetId: value.sheetId, entry } : null;
};

export const parseActionLog = (value: unknown): LoggedAction[] | null => {
  if (!Array.isArray(value)) return null;
  const log: LoggedAction[] = [];
  for (const item of value) {
    const entry = parseLoggedAction(item);
    if (!entry) return null;
    log.push(entry);
  }
  return log;
};
