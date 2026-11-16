import { SHEET } from '../config.ts';
import { isGroundFamily, type Ground } from '../sheet/ground.ts';
import { PALETTES } from '../sheet/palettes.ts';
import { isDropSize, isInkSlot, type Move } from './moves.ts';

/**
 * A sheet is the complete, self-contained content of one puzzle: its ground,
 * its palette and the ordered moves that marbled it. Metadata such as the
 * date, the number or the author lives in the protocol layer, not here.
 */
export type Stars = 1 | 2 | 3 | 4 | 5;

/** Every difficulty, easiest first. */
export const STARS: readonly Stars[] = [1, 2, 3, 4, 5];

export const isStars = (value: unknown): value is Stars => STARS.some((stars) => stars === value);

export type SheetSpec = {
  readonly paletteId: string;
  readonly ground: Ground;
  readonly moves: readonly Move[];
  readonly stars: Stars;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const inRange = (value: unknown, min: number, max: number): value is number =>
  isFiniteNumber(value) && value >= min && value <= max;

const PALETTE_IDS = new Set(PALETTES.map((p) => p.id));

const parseGround = (value: unknown): Ground | null => {
  if (!isRecord(value)) return null;
  const { family, period, angle, amplitude, wavelength } = value;
  if (!isGroundFamily(family)) return null;
  if (!inRange(period, 0.2, 8) || !inRange(angle, -360, 360)) return null;
  if (!inRange(amplitude, 0, 8) || !inRange(wavelength, 0.5, 64)) return null;
  return { family, period, angle, amplitude, wavelength };
};

const parseMove = (value: unknown): Move | null => {
  if (!isRecord(value)) return null;
  const { kind, x, y } = value;
  if (!inRange(x, -SHEET.cols, SHEET.cols * 2) || !inRange(y, -SHEET.rows, SHEET.rows * 2)) return null;
  if (kind === 'drop') {
    const { size, ink } = value;
    if (!isDropSize(size) || !isInkSlot(ink)) return null;
    return { kind, x, y, size, ink };
  }
  if (kind === 'stroke') {
    const { heading } = value;
    if (!inRange(heading, 0, 360)) return null;
    return { kind, x, y, heading };
  }
  if (kind === 'swirl') {
    const { turn } = value;
    if (turn !== 1 && turn !== -1) return null;
    return { kind, x, y, turn };
  }
  return null;
};

/** Maximum moves a sheet may carry; bounds work for renderers and analysis. */
export const MAX_MOVES = 10;

/**
 * Validates untrusted data (post data, share payloads, client requests) into
 * a `SheetSpec`. Returns null instead of throwing so callers decide the UX.
 */
export const parseSheetSpec = (value: unknown): SheetSpec | null => {
  if (!isRecord(value)) return null;
  const { paletteId, ground, moves, stars } = value;
  if (typeof paletteId !== 'string' || !PALETTE_IDS.has(paletteId)) return null;
  const parsedGround = parseGround(ground);
  if (!parsedGround) return null;
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > MAX_MOVES) return null;
  const parsedMoves: Move[] = [];
  for (const move of moves) {
    const parsed = parseMove(move);
    if (!parsed) return null;
    parsedMoves.push(parsed);
  }
  if (!isStars(stars)) return null;
  return { paletteId, ground: parsedGround, moves: parsedMoves, stars };
};
