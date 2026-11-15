import type { GroundFamily } from '../sheet/ground.ts';
import type { Stars } from './sheet.ts';

/**
 * Weekly difficulty curve. Every day contains at least one seam, so the
 * "round drop fell last" shortcut is never enough. Templates are pure data;
 * the generator turns them into sheets and the validator proves each sheet
 * satisfies its template.
 */
export type Feature =
  /** A stroke sits under other moves, not on top or at the bottom. */
  | 'buried-seam'
  /** A drop is squeezed into a crescent by a later neighbour. */
  | 'crescent'
  /** Two seams cross inside the sheet. */
  | 'crossed-seams'
  /** The finished sheet has a stroke on top. */
  | 'top-seam'
  /** With a stroke on top, a covered drop still reads nearly round. */
  | 'decoy'
  /** Two touching drops share an ink: their two centres must be read. */
  | 'twin-inks';

export type SheetTemplate = {
  readonly id: string;
  readonly title: string;
  readonly stars: Stars;
  readonly moves: readonly [min: number, max: number];
  readonly strokes: readonly [min: number, max: number];
  readonly inks: number;
  readonly features: readonly Feature[];
  readonly grounds: readonly GroundFamily[];
  /** Weakest covered mark allowed, in evidence strength. */
  readonly minMargin: number;
};

const CALM: readonly GroundFamily[] = ['bands', 'combed'];
const ALL: readonly GroundFamily[] = ['bands', 'combed', 'chevron', 'waves'];
const LIVELY: readonly GroundFamily[] = ['waves', 'chevron'];

/** Indexed by UTC weekday: 0 = Sunday … 6 = Saturday. */
export const WEEKLY_TEMPLATES: readonly SheetTemplate[] = [
  { id: 'sunday', title: 'Sunday', stars: 3, moves: [5, 6], strokes: [1, 2], inks: 3, features: ['buried-seam', 'crescent'], grounds: ALL, minMargin: 1.4 },
  { id: 'monday', title: 'Monday', stars: 1, moves: [4, 4], strokes: [1, 1], inks: 3, features: ['buried-seam'], grounds: CALM, minMargin: 2.4 },
  { id: 'tuesday', title: 'Tuesday', stars: 2, moves: [5, 5], strokes: [1, 1], inks: 3, features: ['buried-seam', 'crescent'], grounds: CALM, minMargin: 2 },
  { id: 'wednesday', title: 'Wednesday', stars: 2, moves: [5, 5], strokes: [2, 2], inks: 3, features: ['crossed-seams'], grounds: CALM, minMargin: 1.7 },
  { id: 'thursday', title: 'Thursday', stars: 3, moves: [6, 6], strokes: [1, 2], inks: 3, features: ['top-seam', 'decoy'], grounds: ALL, minMargin: 1.25 },
  { id: 'friday', title: 'Friday', stars: 4, moves: [6, 7], strokes: [2, 2], inks: 3, features: ['twin-inks', 'buried-seam'], grounds: ALL, minMargin: 1.25 },
  { id: 'saturday', title: 'Saturday', stars: 5, moves: [7, 8], strokes: [2, 3], inks: 4, features: ['top-seam', 'decoy', 'crescent'], grounds: LIVELY, minMargin: 1.2 },
];

export const templateForWeekday = (weekday: number): SheetTemplate => {
  const template = WEEKLY_TEMPLATES[((weekday % 7) + 7) % 7];
  if (!template) throw new RangeError(`No template for weekday ${weekday}`);
  return template;
};
