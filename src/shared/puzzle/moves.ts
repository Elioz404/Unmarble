import { PHYSICS } from '../config.ts';
import type { FieldOp, StrokeOp, SwirlOp } from '../marbling/field-ops.ts';

/**
 * Puzzle moves: the discrete, serialisable description of how a sheet was
 * made. They are converted to continuous `FieldOp`s for rendering and
 * analysis. Positions are in cells, snapped to a half-cell grid; stroke
 * headings are snapped to `PHYSICS.strokeAngleStep` degrees.
 */
export type DropSize = keyof typeof PHYSICS.dropRadius;

export const DROP_SIZES: readonly DropSize[] = ['S', 'M', 'L'];

/** Ink slot within the sheet's palette (0 = deepest … 3 = lightest). */
export type InkSlot = 0 | 1 | 2 | 3;

export const INK_SLOTS: readonly InkSlot[] = [0, 1, 2, 3];

export const isDropSize = (value: unknown): value is DropSize =>
  typeof value === 'string' && (DROP_SIZES as readonly string[]).includes(value);

export const isInkSlot = (value: unknown): value is InkSlot =>
  typeof value === 'number' && (INK_SLOTS as readonly number[]).includes(value);

export type DropMove = {
  readonly kind: 'drop';
  readonly x: number;
  readonly y: number;
  readonly size: DropSize;
  readonly ink: InkSlot;
};

export type StrokeMove = {
  readonly kind: 'stroke';
  /** A point on the stroke line. */
  readonly x: number;
  readonly y: number;
  /** Direction of travel in degrees, [0, 360). */
  readonly heading: number;
};

/** A swirl turning the water around an eye; `turn` 1 is counter-clockwise on screen, −1 clockwise. */
export type SwirlMove = {
  readonly kind: 'swirl';
  readonly x: number;
  readonly y: number;
  readonly turn: 1 | -1;
};

export type Move = DropMove | StrokeMove | SwirlMove;

export type MoveKind = Move['kind'];

export const MOVE_KINDS: readonly MoveKind[] = ['drop', 'stroke', 'swirl'];

export const dropRadius = (size: DropSize): number => PHYSICS.dropRadius[size];

/** Unit direction of a stroke heading. */
export const headingVector = (heading: number): { x: number; y: number } => {
  const a = (heading * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
};

/**
 * Converts a move to its field op. `amount` scales the physical effect
 * (1 = fully applied, 0 = not at all) and drives every animation: a drop
 * shrinking back into the water is the same drop with a smaller radius.
 */
export const moveToOp = (move: Move, source: number, amount = 1): FieldOp => {
  switch (move.kind) {
    case 'drop':
      return { type: 'drop', cx: move.x, cy: move.y, r: dropRadius(move.size) * amount, ink: move.ink, source };
    case 'stroke':
      return strokeOp(move, source, amount);
    case 'swirl':
      return swirlOp(move, source, amount);
  }
};

export const swirlOp = (move: SwirlMove, source: number, amount = 1): SwirlOp => ({
  type: 'swirl',
  cx: move.x,
  cy: move.y,
  turn: move.turn * PHYSICS.swirlTurn * amount,
  falloff: PHYSICS.swirlFalloff,
  source,
});

export const strokeOp = (move: StrokeMove, source: number, amount = 1): StrokeOp => {
  const u = headingVector(move.heading);
  return {
    type: 'stroke',
    bx: move.x,
    by: move.y,
    ux: u.x,
    uy: u.y,
    shift: PHYSICS.strokeShift * amount,
    falloff: PHYSICS.strokeFalloff,
    source,
  };
};

/** Field ops for the first `count` moves, fully applied. */
export const opsForPrefix = (moves: readonly Move[], count: number): FieldOp[] =>
  moves.slice(0, count).map((move, index) => moveToOp(move, index));

export const snapToHalfCell = (value: number): number => Math.round(value * 2) / 2;

export const snapHeading = (degrees: number): number => {
  const step = PHYSICS.strokeAngleStep;
  const snapped = Math.round(degrees / step) * step;
  return ((snapped % 360) + 360) % 360;
};
