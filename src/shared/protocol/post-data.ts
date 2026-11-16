import type { SheetDescriptor } from './api.ts';
import { parseSheetSpec } from '../puzzle/sheet.ts';
import { isDateKey } from '../time/calendar.ts';

/**
 * What each post carries in its post data (≤ 2 KB, public). The in-feed card
 * renders from it with no network call, so the first paint is instant.
 *
 *  - a daily post is bound to one sheet forever;
 *  - the Atelier hub post always shows today's sheet (rewritten each night).
 */
export type PostBinding =
  | { readonly kind: 'daily'; readonly sheet: SheetDescriptor }
  | { readonly kind: 'atelier'; readonly sheet: SheetDescriptor | null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseSheetDescriptor = (value: unknown): SheetDescriptor | null => {
  if (!isRecord(value)) return null;
  const { id, number, dateKey, weekday, paletteName, spec, name } = value;
  const parsedSpec = parseSheetSpec(spec);
  if (typeof id !== 'string' || typeof number !== 'number' || !isDateKey(dateKey)) return null;
  if (typeof weekday !== 'string' || typeof paletteName !== 'string' || !parsedSpec) return null;
  if (name !== null && typeof name !== 'string') return null;
  return { id, number, dateKey, weekday, paletteName, spec: parsedSpec, name };
};

export const parsePostBinding = (value: unknown): PostBinding | null => {
  if (!isRecord(value)) return null;
  if (value.kind === 'daily') {
    const sheet = parseSheetDescriptor(value.sheet);
    return sheet ? { kind: 'daily', sheet } : null;
  }
  if (value.kind === 'atelier') {
    return { kind: 'atelier', sheet: value.sheet === null ? null : parseSheetDescriptor(value.sheet) };
  }
  return null;
};
