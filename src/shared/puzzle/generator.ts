import { EVIDENCE, GENERATION, GROUND_STYLE, SHEET, VISIBILITY } from '../config.ts';
import { Random } from '../math/random.ts';
import type { Ground, GroundFamily } from '../sheet/ground.ts';
import { readSheet, type SheetReading } from './analysis.ts';
import { seamLength } from './evidence.ts';
import { hasFeature, steepCrossingShare } from './features.ts';
import {
  DROP_SIZES,
  INK_SLOTS,
  dropRadius,
  snapHeading,
  snapToHalfCell,
  strokeOp,
  type DropMove,
  type InkSlot,
  type Move,
  type StrokeMove,
} from './moves.ts';
import type { SheetSpec } from './sheet.ts';
import type { SheetTemplate } from './templates.ts';
import { measureVisibility } from './visibility.ts';

/**
 * Procedural sheet generation.
 *
 * Candidates are built move by move, each new move landing close enough to
 * the previous one to leave a mark on it. Every candidate is then held to the
 * full contract: fair at every step (golden rule with the template's margin),
 * every drop visible and tappable, every seam long and steep enough to read,
 * and every feature the template promises. Generation is deterministic in its
 * seed, so the server can regenerate and audit any day.
 */

export class GenerationError extends Error {
  constructor(template: SheetTemplate, attempts: number) {
    super(`Could not generate a "${template.id}" sheet in ${attempts} attempts`);
    this.name = 'GenerationError';
  }
}

export type GeneratedSheet = {
  readonly spec: SheetSpec;
  readonly reading: SheetReading;
  readonly attempts: number;
};

const pickGround = (rng: Random, families: readonly GroundFamily[]): Ground => {
  const family = rng.pick(families);
  const period =
    family === 'combed'
      ? rng.range(GROUND_STYLE.combedPeriod.min, GROUND_STYLE.combedPeriod.max)
      : rng.range(GROUND_STYLE.period.min, GROUND_STYLE.period.max);
  const amplitude =
    family === 'chevron'
      ? rng.range(GROUND_STYLE.chevronSlope.min, GROUND_STYLE.chevronSlope.max)
      : family === 'waves'
        ? rng.range(GROUND_STYLE.waveAmplitude.min, GROUND_STYLE.waveAmplitude.max)
        : 0;
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    family,
    period: round(period),
    angle: rng.pick(GROUND_STYLE.angles),
    amplitude: round(amplitude),
    wavelength: round(rng.range(GROUND_STYLE.wavelength.min, GROUND_STYLE.wavelength.max)),
  };
};

/** Which positions in the sequence are strokes, honouring the template. */
const planStrokes = (rng: Random, template: SheetTemplate, count: number): Set<number> => {
  const strokes = rng.int(template.strokes[0], template.strokes[1]);
  const slots = new Set<number>();
  const last = count - 1;
  if (template.features.includes('top-seam')) slots.add(last);
  if (template.features.includes('buried-seam') && count >= 3) slots.add(rng.int(1, last - 1));
  // The first move is always a drop: a stroke on blank stripes has nothing to bend.
  const free = rng.shuffled(Array.from({ length: count - 1 }, (_, i) => i + 1).filter((i) => !slots.has(i)));
  while (slots.size < strokes && free.length > 0) slots.add(free.pop() as number);
  return slots;
};

const planInks = (rng: Random, template: SheetTemplate, drops: number): InkSlot[] => {
  const palette = rng.shuffled(INK_SLOTS).slice(0, template.inks);
  const inks: InkSlot[] = [];
  for (let i = 0; i < drops; i++) {
    const previous = inks[i - 1];
    const options = palette.filter((ink) => ink !== previous);
    inks.push(rng.pick(options.length > 0 ? options : palette));
  }
  if (template.features.includes('twin-inks') && drops >= 2) {
    const i = rng.int(1, drops - 1);
    inks[i] = inks[i - 1] as InkSlot;
  }
  return inks;
};

const insideSheet = (x: number, y: number, margin: number): boolean =>
  x >= margin && x <= SHEET.cols - margin && y >= margin && y <= SHEET.rows - margin;

/** A point on a stroke's seam, inside the sheet, to anchor the next move. */
const seamAnchor = (rng: Random, move: StrokeMove): { x: number; y: number } => {
  const op = strokeOp(move, 0);
  const along = rng.range(-3, 3);
  return { x: op.bx + op.ux * along, y: op.by + op.uy * along };
};

const anchorOf = (rng: Random, move: Move): { x: number; y: number } =>
  move.kind === 'drop' ? { x: move.x, y: move.y } : seamAnchor(rng, move);

const placeDrop = (rng: Random, previous: Move | undefined, ink: InkSlot): DropMove | null => {
  const size = rng.pick(DROP_SIZES);
  const r = dropRadius(size);
  const margin = r + VISIBILITY.dropEdgeMargin;
  for (let attempt = 0; attempt < GENERATION.placementRetries; attempt++) {
    let x: number;
    let y: number;
    if (!previous) {
      x = rng.range(margin + 1, SHEET.cols - margin - 1);
      y = rng.range(margin + 2, SHEET.rows - margin - 2);
    } else if (previous.kind === 'drop') {
      const reach = (dropRadius(previous.size) + r) * rng.range(GENERATION.dropSpacing.min, GENERATION.dropSpacing.max);
      const angle = rng.range(0, Math.PI * 2);
      x = previous.x + Math.cos(angle) * reach;
      y = previous.y + Math.sin(angle) * reach;
    } else {
      const anchor = seamAnchor(rng, previous);
      const op = strokeOp(previous, 0);
      const offset = rng.range(-GENERATION.seamReach, GENERATION.seamReach);
      x = anchor.x - op.uy * offset;
      y = anchor.y + op.ux * offset;
    }
    x = snapToHalfCell(x);
    y = snapToHalfCell(y);
    if (insideSheet(x, y, margin)) return { kind: 'drop', x, y, size, ink };
  }
  return null;
};

const placeStroke = (rng: Random, previous: Move | undefined): StrokeMove | null => {
  for (let attempt = 0; attempt < GENERATION.placementRetries; attempt++) {
    const anchor = previous ? anchorOf(rng, previous) : { x: SHEET.cols / 2, y: SHEET.rows / 2 };
    const angle = rng.range(0, Math.PI * 2);
    const reach = rng.range(0, GENERATION.strokeReach);
    const move: StrokeMove = {
      kind: 'stroke',
      x: snapToHalfCell(anchor.x + Math.cos(angle) * reach),
      y: snapToHalfCell(anchor.y + Math.sin(angle) * reach),
      heading: snapHeading(rng.range(0, 360)),
    };
    if (!insideSheet(move.x, move.y, 1)) continue;
    if (seamLength(strokeOp(move, 0)) >= EVIDENCE.minSeamLength) return move;
  }
  return null;
};

const buildCandidate = (rng: Random, template: SheetTemplate): Move[] | null => {
  const count = rng.int(template.moves[0], template.moves[1]);
  const strokeSlots = planStrokes(rng, template, count);
  const inks = planInks(rng, template, count - strokeSlots.size);
  const moves: Move[] = [];
  let dropIndex = 0;
  for (let i = 0; i < count; i++) {
    const previous = moves[i - 1];
    const move = strokeSlots.has(i) ? placeStroke(rng, previous) : placeDrop(rng, previous, inks[dropIndex++] as InkSlot);
    if (!move) return null;
    moves.push(move);
  }
  return moves;
};

const strokesReadable = (moves: readonly Move[], ground: Ground): boolean =>
  moves.every(
    (move, index) =>
      move.kind !== 'stroke' || steepCrossingShare(moves, ground, index) >= EVIDENCE.minSteepCrossingShare,
  );

const inkReadable = (moves: readonly Move[]): boolean => {
  for (let prefix = moves.length; prefix >= 1; prefix--) {
    const step = measureVisibility(moves, prefix);
    if (prefix === moves.length) {
      const { min, max } = VISIBILITY.coverage;
      if (step.coverage < min || step.coverage > max) return false;
      const offCentre = Math.hypot(step.inkCentroid.x - SHEET.cols / 2, step.inkCentroid.y - SHEET.rows / 2);
      if (offCentre > VISIBILITY.compositionTolerance) return false;
    }
    if (step.inks.some((ink) => ink.visibleShare < VISIBILITY.minVisibleInk || !ink.tappable)) return false;
  }
  return true;
};

/**
 * Checks a candidate against the full contract. Cheap checks run first.
 * Exported so hand-made sheets (tutorials, player traps) meet the same bar.
 */
export const validateSheet = (
  moves: readonly Move[],
  ground: Ground,
  template: Pick<SheetTemplate, 'features' | 'minMargin'>,
): SheetReading | null => {
  if (!strokesReadable(moves, ground)) return null;
  const reading = readSheet(moves);
  if (reading.margin < Math.max(template.minMargin, EVIDENCE.safetyMargin)) return null;
  if (!template.features.every((f) => hasFeature(f, moves, reading, template.minMargin))) return null;
  if (!inkReadable(moves)) return null;
  return reading;
};

export const generateSheet = (seed: string, template: SheetTemplate, paletteId: string): GeneratedSheet => {
  const rng = new Random(`${seed}:${template.id}`);
  const ground = pickGround(rng.fork('ground'), template.grounds);
  for (let attempt = 1; attempt <= GENERATION.maxAttempts; attempt++) {
    const moves = buildCandidate(rng, template);
    if (!moves) continue;
    const reading = validateSheet(moves, ground, template);
    if (reading) {
      return { spec: { paletteId, ground, moves, stars: template.stars }, reading, attempts: attempt };
    }
  }
  throw new GenerationError(template, GENERATION.maxAttempts);
};
