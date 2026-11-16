import { CALENDAR } from '../config.ts';
import { PALETTES } from '../sheet/palettes.ts';

/**
 * Calendar arithmetic for the daily sheet. Everything is UTC and expressed as
 * ISO date keys (`YYYY-MM-DD`), never device clocks, so every player and the
 * server agree on what "today" is.
 */
export type DateKey = string;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const dateKeyOf = (epochMs: number): DateKey => new Date(epochMs).toISOString().slice(0, 10);

/** A real calendar date in `YYYY-MM-DD` form (rejects roll-overs such as 2026-02-31). */
export const isDateKey = (value: unknown): value is DateKey => {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && dateKeyOf(ms) === value;
};

const dayIndex = (key: DateKey): number => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY_MS);

export const addDays = (key: DateKey, days: number): DateKey => dateKeyOf((dayIndex(key) + days) * DAY_MS);

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (key: DateKey): number => new Date(`${key}T00:00:00Z`).getUTCDay();

/**
 * Sheet number in a community: Sheet No. 1 is its `firstDay` (the day the app
 * was installed there), so numbering always starts at one. Days before it
 * never get a sheet; they read as No. 1 rather than a negative number.
 */
export const sheetNumberOf = (key: DateKey, firstDay: DateKey): number =>
  Math.max(1, dayIndex(key) - dayIndex(firstDay) + 1);

/** Day of the UTC year, 0-based; used to address streak bitfields. */
export const dayOfYear = (key: DateKey): number =>
  dayIndex(key) - dayIndex(`${key.slice(0, 4)}-01-01`);

/**
 * The colourway of a day, the same in every community. A stride coprime with
 * the catalogue size never repeats within a cycle.
 */
export const paletteIdForDay = (key: DateKey): string => {
  const n = PALETTES.length;
  // Day 1 is the epoch itself, as it always was.
  const day = dayIndex(key) - dayIndex(CALENDAR.paletteEpoch) + 1;
  const index = (((day * CALENDAR.paletteStride + CALENDAR.paletteOffset) % n) + n) % n;
  return (PALETTES[index] as (typeof PALETTES)[number]).id;
};

/** Milliseconds until the next UTC midnight. */
export const msUntilNextDay = (nowMs: number): number => DAY_MS - (nowMs % DAY_MS);
