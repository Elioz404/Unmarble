import { RULES, SHEET } from '../config.ts';
import type { PlayerAction, SheetPoint } from '../game/session.ts';
import { MAX_MOVES, parseSheetSpec } from '../puzzle/sheet.ts';
import type { Result } from '../game/scoring.ts';
import type {
  ActionRequest,
  ActionResponse,
  BookEntry,
  BookResponse,
  BookStatus,
  FlairRequest,
  LoggedAction,
  ScarMap,
  SheetResponse,
  SheetStats,
  Standing,
  TrapRejection,
  TrapRequest,
  TrapResponse,
} from './api.ts';
import { PALETTES } from '../sheet/palettes.ts';
import { parseSheetDescriptor } from './post-data.ts';

/** Validators for untrusted request bodies and stored records. */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMoveIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MAX_MOVES;

export const parseAction = (value: unknown): PlayerAction | null => {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'magnify':
      return { type: 'magnify' };
    case 'absorb':
      return isMoveIndex(value.move) ? { type: 'absorb', move: value.move } : null;
    case 'unstroke':
    case 'unswirl':
      return isMoveIndex(value.move) && typeof value.against === 'boolean'
        ? { type: value.type, move: value.move, against: value.against }
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
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return null;
  return { action, at: Math.round(Math.min(at, RULES.maxAttemptMs)), point };
};

export const parseActionRequest = (value: unknown): ActionRequest | null => {
  if (!isRecord(value) || typeof value.sheetId !== 'string' || value.sheetId.length > 64) return null;
  const { seq } = value;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) return null;
  const entry = parseLoggedAction(value.entry);
  return entry ? { sheetId: value.sheetId, seq, entry } : null;
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

/* ---------- Responses (validated on the client at the network boundary) ---------- */

export const parseResult = (value: unknown): Result | null => {
  if (!isRecord(value)) return null;
  const { clean, blots, magnified, durationMs, moves } = value;
  if (typeof clean !== 'boolean' || typeof magnified !== 'boolean') return null;
  if (typeof blots !== 'number' || typeof durationMs !== 'number' || typeof moves !== 'number') return null;
  return { clean, blots, magnified, durationMs, moves };
};

const parseStats = (value: unknown): SheetStats | null =>
  isRecord(value) &&
  typeof value.hands === 'number' &&
  typeof value.cleans === 'number' &&
  typeof value.caught === 'number'
    ? { hands: value.hands, cleans: value.cleans, caught: value.caught }
    : null;

export const parseStanding = (value: unknown): Standing | null => {
  if (!isRecord(value)) return null;
  const result = parseResult(value.result);
  const stats = parseStats(value.stats);
  const { rank, streak } = value;
  if (!result || !stats || typeof rank !== 'number' || typeof streak !== 'number') return null;
  return { result, stats, rank, streak };
};

export const parseActionResponse = (value: unknown): ActionResponse | null => {
  if (!isRecord(value)) return null;
  if (value.kind === 'conflict') {
    const log = parseActionLog(value.log);
    return log ? { kind: 'conflict', log } : null;
  }
  const { verdict } = value;
  if (value.kind !== 'applied' || (verdict !== 'correct' && verdict !== 'blot' && verdict !== 'ignored')) return null;
  return { kind: 'applied', verdict, standing: value.standing === null ? null : parseStanding(value.standing) };
};

export const parseSheetResponse = (value: unknown): SheetResponse | null => {
  if (!isRecord(value)) return null;
  const sheet = parseSheetDescriptor(value.sheet);
  const stats = parseStats(value.stats);
  const player = value.player;
  if (!sheet || !stats || !isRecord(player)) return null;
  const log = parseActionLog(player.log);
  const { nextSheetAt, todayId } = value;
  if (!log || typeof player.signedIn !== 'boolean' || typeof player.streak !== 'number') return null;
  if (typeof player.flair !== 'boolean') return null;
  if (typeof nextSheetAt !== 'number' || typeof todayId !== 'string') return null;
  const standing = value.standing === null || value.standing === undefined ? null : parseStanding(value.standing);
  return {
    sheet,
    stats,
    player: { signedIn: player.signedIn, log, streak: player.streak, flair: player.flair },
    standing,
    nextSheetAt,
    todayId,
  };
};

export const parseScarMap = (value: unknown): ScarMap | null => {
  if (!isRecord(value) || !Array.isArray(value.points) || typeof value.hands !== 'number') return null;
  const points = value.points.flatMap((p: unknown) =>
    isRecord(p) && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.weight === 'number'
      ? [{ x: p.x, y: p.y, weight: p.weight }]
      : [],
  );
  const trap =
    isRecord(value.trap) && typeof value.trap.move === 'number' && typeof value.trap.share === 'number'
      ? { move: value.trap.move, share: value.trap.share }
      : null;
  return { points, trap, hands: value.hands };
};

const BOOK_STATUSES: readonly BookStatus[] = ['unplayed', 'playing', 'clean', 'torn'];

const parseBookEntry = (value: unknown): BookEntry | null => {
  if (!isRecord(value)) return null;
  const sheet = parseSheetDescriptor(value.sheet);
  const stats = parseStats(value.stats);
  const status = BOOK_STATUSES.find((s) => s === value.status);
  return sheet && stats && status ? { sheet, stats, status } : null;
};

const parseBookEntries = (value: unknown): BookEntry[] | null => {
  if (!Array.isArray(value)) return null;
  const entries = value.map(parseBookEntry);
  return entries.every((e) => e !== null) ? entries.filter((e) => e !== null) : null;
};

export const parseBookResponse = (value: unknown): BookResponse | null => {
  if (!isRecord(value)) return null;
  const dailies = parseBookEntries(value.dailies);
  const traps = parseBookEntries(value.traps);
  return dailies && traps ? { dailies, traps } : null;
};

/** A trap submission: moves only; their validity as a sheet is checked separately. */
export const parseTrapRequest = (value: unknown): TrapRequest | null => {
  if (!isRecord(value) || !Array.isArray(value.moves)) return null;
  const probe = parseSheetSpec({
    paletteId: PALETTES[0]?.id,
    ground: { family: 'bands', period: 1, angle: 0, amplitude: 0, wavelength: 1 },
    moves: value.moves,
    stars: 1,
  });
  return probe ? { moves: probe.moves } : null;
};

const TRAP_REJECTIONS: readonly TrapRejection[] = ['invalid', 'unfair', 'signed-out', 'daily-limit', 'banned'];

export const parseTrapResponse = (value: unknown): TrapResponse | null => {
  if (!isRecord(value)) return null;
  if (value.kind === 'rejected') {
    const reason = TRAP_REJECTIONS.find((r) => r === value.reason);
    return reason ? { kind: 'rejected', reason } : null;
  }
  const sheet = parseSheetDescriptor(value.sheet);
  if (value.kind !== 'published' || !sheet) return null;
  if (value.postUrl !== null && typeof value.postUrl !== 'string') return null;
  return { kind: 'published', sheet, postUrl: value.postUrl };
};

export const parseFlair = (value: unknown): FlairRequest | null =>
  isRecord(value) && typeof value.enabled === 'boolean' ? { enabled: value.enabled } : null;
