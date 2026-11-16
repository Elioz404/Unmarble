import { EVIDENCE, GENERATION, GROUND_STYLE, SHEET, VISIBILITY } from '../config.ts';
import { Random } from '../math/random.ts';
import type { Point } from '../marbling/field-ops.ts';
import type { Ground, GroundFamily } from '../sheet/ground.ts';
import { readSheet, type SheetReading } from './analysis.ts';
import { seamLength } from './evidence.ts';
import { matchesSignature, steepCrossingShare, type Feature, type Signature } from './features.ts';
import { diagnoseReadability } from './contract.ts';
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
  type SwirlMove,
} from './moves.ts';
import type { SheetSpec } from './sheet.ts';
import type { SheetTemplate } from './recipes.ts';
import { measureVisibility } from './visibility.ts';

/**
 * Procedural sheet generation.
 *
 * Candidates are built move by move, each new move landing close enough to
 * the previous one to leave a mark on it. Every candidate is then held to the
 * full contract: fair at every step (golden rule with the recipe's margin),
 * every drop visible and tappable, every seam long and steep enough to read,
 * every feature the recipe promises and none it forbids. Generation is
 * deterministic in its seed, so the server can regenerate and audit any day.
 */

export class GenerationError extends Error {
  constructor(recipe: SheetTemplate, attempts: number) {
    super(`Could not generate a "${recipe.id}" sheet in ${attempts} attempts`);
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

type Shape = 'stroke' | 'swirl';

const has = (recipe: SheetTemplate, feature: Feature): boolean => recipe.features.includes(feature);

const forbids = (recipe: SheetTemplate, feature: Feature): boolean => (recipe.forbid ?? []).includes(feature);

/** Slots `from` … `to`, inclusive. */
const slotRange = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** Features that keep the top move clear of strokes. */
const TOP_NOT_A_FOLD: readonly Feature[] = ['top-drop', 'top-swirl', 'swirl-decoy', 'two-buried-seams'];

/** Folds Only: the drops first, then the strokes and swirls in a shuffled order. */
const planDropsFirst = (rng: Random, recipe: SheetTemplate, count: number, strokes: number): Map<number, Shape> => {
  const swirls = recipe.swirls[1] > 0 ? rng.int(recipe.swirls[0], recipe.swirls[1]) : 0;
  const tail = rng.shuffled<Shape>([...Array<Shape>(strokes).fill('stroke'), ...Array<Shape>(swirls).fill('swirl')]);
  return new Map(tail.map((shape, i) => [count - tail.length + i, shape]));
};

/**
 * Which positions in the sequence are strokes and swirls, honouring the
 * recipe's features and forbids; null when its counts cannot be met.
 */
const planShapes = (rng: Random, recipe: SheetTemplate, count: number): Map<number, Shape> | null => {
  const strokes = rng.int(recipe.strokes[0], recipe.strokes[1]);
  if (recipe.order === 'drops-first') return planDropsFirst(rng, recipe, count, strokes);
  const last = count - 1;
  // Slots no stroke may take: kept for a drop or a swirl.
  const reserved = new Set<number>();
  if (TOP_NOT_A_FOLD.some((f) => has(recipe, f)) || forbids(recipe, 'top-seam')) reserved.add(last);
  if (has(recipe, 'mid-seam') || forbids(recipe, 'deep-seam')) reserved.add(1);
  if (has(recipe, 'split-folds')) reserved.add(last - 1);
  const slots = new Set<number>();
  if (has(recipe, 'top-seam') || has(recipe, 'fold-pair') || has(recipe, 'split-folds')) slots.add(last);
  if (has(recipe, 'fold-pair')) slots.add(last - 1);
  if (has(recipe, 'split-folds')) slots.add(rng.int(1, last - 2));
  if (has(recipe, 'deep-seam')) slots.add(1);
  const buried = () => [...slots].filter((i) => i > 0 && i < last).length;
  const open = () => slotRange(1, last - 1).filter((i) => !reserved.has(i) && !slots.has(i));
  if (has(recipe, 'mid-seam')) slots.add(rng.int(2, last - 1));
  else if (has(recipe, 'buried-seam') && buried() === 0) {
    const options = open();
    if (options.length === 0) return null;
    slots.add(options[rng.int(0, options.length - 1)] as number);
  }
  if (has(recipe, 'two-buried-seams')) {
    const options = rng.shuffled(open());
    while (buried() < 2 && options.length > 0) slots.add(options.pop() as number);
  }
  // The first move is always a drop: water with no ink has nothing to show a turn or a fold.
  const free = rng.shuffled(slotRange(1, last).filter((i) => !slots.has(i)));
  const strokeFree = free.filter((i) => !reserved.has(i));
  while (slots.size < strokes && strokeFree.length > 0) slots.add(strokeFree.pop() as number);
  if (slots.size !== strokes) return null;
  const shapes = new Map<number, Shape>([...slots].map((i) => [i, 'stroke']));
  const [minSwirls, maxSwirls] = recipe.swirls;
  if (maxSwirls > 0) {
    const swirls = rng.int(minSwirls, maxSwirls);
    let swirlFree = free.filter((i) => !shapes.has(i));
    if (has(recipe, 'top-swirl') || has(recipe, 'swirl-decoy')) shapes.set(last, 'swirl');
    if (has(recipe, 'buried-swirl') || has(recipe, 'top-drop')) swirlFree = swirlFree.filter((i) => i !== last);
    const placed = () => [...shapes.values()].filter((s) => s === 'swirl').length;
    while (placed() < swirls && swirlFree.length > 0) {
      const i = swirlFree.pop() as number;
      // Two swirls side by side would read as one stir.
      if (swirls >= 2 && (shapes.get(i - 1) === 'swirl' || shapes.get(i + 1) === 'swirl')) continue;
      shapes.set(i, 'swirl');
    }
    if (placed() !== swirls) return null;
  }
  return shapes;
};

/**
 * Inks for the drops, in order. Inks rotate through the day's selection so
 * no two drops in a row share one; a twin-inks sheet then gets exactly one
 * touching pair of the same ink, never a whole blob of one colour.
 */
const planInks = (rng: Random, recipe: SheetTemplate, drops: number): InkSlot[] => {
  const selection = rng.shuffled(INK_SLOTS).slice(0, recipe.inks);
  const inks = Array.from({ length: drops }, (_, i) => selection[i % selection.length] as InkSlot);
  if (recipe.features.includes('twin-inks') && drops >= 2) {
    const i = rng.int(1, drops - 1);
    inks[i] = inks[i - 1] as InkSlot;
    // Keep the pair unique: the next drop must not continue the run.
    const next = inks[i + 1];
    if (next !== undefined && next === inks[i]) {
      inks[i + 1] = selection.find((ink) => ink !== inks[i] && ink !== inks[i + 2]) ?? next;
    }
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
  move.kind === 'stroke' ? seamAnchor(rng, move) : { x: move.x, y: move.y };

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
    } else if (previous.kind === 'swirl') {
      // Close enough to the eye to disturb it, far enough not to drown it.
      const reach = rng.range(r * 0.8, r + GENERATION.swirlReach);
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

/** Where a stroke may run: near which point, how far from it, and on which heading. */
type StrokeGuide = {
  /** A fixed point to pass near; otherwise a point of the previous move, drawn per attempt. */
  readonly anchor: Point | null;
  readonly reach: number;
  readonly heading: () => number;
};

const placeStroke = (rng: Random, previous: Move | undefined, guide: StrokeGuide): StrokeMove | null => {
  for (let attempt = 0; attempt < GENERATION.placementRetries; attempt++) {
    const anchor = guide.anchor ?? (previous ? anchorOf(rng, previous) : { x: SHEET.cols / 2, y: SHEET.rows / 2 });
    const angle = rng.range(0, Math.PI * 2);
    const reach = rng.range(0, guide.reach);
    const move: StrokeMove = {
      kind: 'stroke',
      x: snapToHalfCell(anchor.x + Math.cos(angle) * reach),
      y: snapToHalfCell(anchor.y + Math.sin(angle) * reach),
      heading: snapHeading(guide.heading()),
    };
    if (!insideSheet(move.x, move.y, 1)) continue;
    if (seamLength(strokeOp(move, 0)) >= EVIDENCE.minSeamLength) return move;
  }
  return null;
};

/** A heading, or half the time its reverse: the same line drawn the other way. */
const eitherWay = (rng: Random, heading: number): number => heading + (rng.chance(0.5) ? 180 : 0);

/**
 * How the next stroke is guided. Folds Only anchors each fold on an earlier
 * drop and leans it steeply across the stripes, alternating sides so each
 * fold crosses the one before; parallel folds follow the first fold's
 * heading; any other fold runs anywhere near the previous move.
 */
const strokeGuide = (
  rng: Random,
  recipe: SheetTemplate,
  ground: Ground,
  moves: readonly Move[],
  lean: number,
): StrokeGuide => {
  if (recipe.order === 'drops-first') {
    const drop = rng.pick(moves.filter((m) => m.kind === 'drop'));
    const { min, max } = GENERATION.foldsOnlyLean;
    return {
      anchor: { x: drop.x, y: drop.y },
      reach: GENERATION.anchoredFoldReach,
      heading: () => eitherWay(rng, ground.angle + 90 + lean * rng.range(min, max)),
    };
  }
  const first = moves.find((m) => m.kind === 'stroke');
  const spread = GENERATION.parallelSpread;
  return {
    anchor: null,
    reach: GENERATION.strokeReach,
    heading:
      recipe.parallel && first ? () => eitherWay(rng, first.heading + rng.range(-spread, spread)) : () => rng.range(0, 360),
  };
};

/** A swirl near the previous move; with `opposite`, turning against it, its eye well apart. */
const placeSwirl = (rng: Random, previous: Move | undefined, opposite: SwirlMove | null): SwirlMove | null => {
  for (let attempt = 0; attempt < GENERATION.placementRetries; attempt++) {
    const anchor = previous ? anchorOf(rng, previous) : { x: SHEET.cols / 2, y: SHEET.rows / 2 };
    const angle = rng.range(0, Math.PI * 2);
    const reach = rng.range(0, GENERATION.swirlReach);
    const move: SwirlMove = {
      kind: 'swirl',
      x: snapToHalfCell(anchor.x + Math.cos(angle) * reach),
      y: snapToHalfCell(anchor.y + Math.sin(angle) * reach),
      turn: opposite ? (opposite.turn === 1 ? -1 : 1) : rng.chance(0.5) ? 1 : -1,
    };
    if (opposite && Math.hypot(move.x - opposite.x, move.y - opposite.y) < GENERATION.stormEyeSpacing) continue;
    if (insideSheet(move.x, move.y, GENERATION.swirlEdgeMargin)) return move;
  }
  return null;
};

const buildCandidate = (rng: Random, recipe: SheetTemplate, ground: Ground): Move[] | null => {
  const count = rng.int(recipe.moves[0], recipe.moves[1]);
  const shapes = planShapes(rng, recipe, count);
  if (!shapes) return null;
  const inks = planInks(rng, recipe, count - shapes.size);
  // Folds Only: the side the next fold leans to, alternating from a random start.
  let lean = recipe.order === 'drops-first' && rng.chance(0.5) ? -1 : 1;
  const moves: Move[] = [];
  let dropIndex = 0;
  for (let i = 0; i < count; i++) {
    const previous = moves[i - 1];
    const shape = shapes.get(i);
    let move: Move | null;
    if (shape === 'stroke') {
      move = placeStroke(rng, previous, strokeGuide(rng, recipe, ground, moves, lean));
      lean = -lean;
    } else if (shape === 'swirl') {
      const first = moves.find((m) => m.kind === 'swirl');
      move = placeSwirl(rng, previous, has(recipe, 'opposite-swirls') && first ? first : null);
    } else {
      move = placeDrop(rng, previous, inks[dropIndex++] as InkSlot);
    }
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

/**
 * Readability, the non-negotiable part of the contract (see `contract.ts`):
 * every mark stays on the paper, every fold kinks the stripes, every drop
 * stays visible and tappable at every step, and undoing the top move can
 * never be mistaken for another. Applies to every sheet, hand-made ones too.
 */
export const isReadable = (moves: readonly Move[], ground: Ground): boolean =>
  diagnoseReadability(moves, ground) === null;

/** Composition of a daily sheet: balanced ink coverage, centred on the paper. */
export const isWellComposed = (moves: readonly Move[]): boolean => {
  const step = measureVisibility(moves, moves.length);
  const { min, max } = VISIBILITY.coverage;
  if (step.coverage < min || step.coverage > max) return false;
  const offCentre = Math.hypot(step.inkCentroid.x - SHEET.cols / 2, step.inkCentroid.y - SHEET.rows / 2);
  return offCentre <= VISIBILITY.compositionTolerance;
};

/**
 * Checks a generated candidate against the full contract and the recipe's
 * signature; cheap checks run first.
 */
export const validateSheet = (moves: readonly Move[], ground: Ground, recipe: Signature): SheetReading | null => {
  if (!strokesReadable(moves, ground)) return null;
  const reading = readSheet(moves);
  if (reading.margin < Math.max(recipe.minMargin, EVIDENCE.safetyMargin)) return null;
  if (!matchesSignature(recipe, moves, reading)) return null;
  if (!isWellComposed(moves) || !isReadable(moves, ground)) return null;
  return reading;
};

/**
 * A search for one sheet that can be run in slices: `step(budgetMs)` tries
 * candidates until it finds a sheet (returned, then on every later call) or
 * its budget runs out (null). The random stream is created once per search,
 * so the sheet found never depends on how the work was sliced. Throws a
 * `GenerationError` once `GENERATION.maxAttempts` candidates have failed.
 */
export type SheetSearch = { readonly attempts: number; step(budgetMs: number): GeneratedSheet | null };

export const searchSheet = (
  seed: string,
  recipe: SheetTemplate,
  paletteId: string,
  clock: () => number = () => performance.now(),
): SheetSearch => {
  const rng = new Random(`${seed}:${recipe.id}`);
  const ground = pickGround(rng.fork('ground'), recipe.grounds);
  let attempts = 0;
  let found: GeneratedSheet | null = null;
  return {
    get attempts() {
      return attempts;
    },
    step(budgetMs) {
      const deadline = clock() + budgetMs;
      while (!found) {
        if (attempts >= GENERATION.maxAttempts) throw new GenerationError(recipe, attempts);
        attempts++;
        const moves = buildCandidate(rng, recipe, ground);
        const reading = moves ? validateSheet(moves, ground, recipe) : null;
        if (moves && reading) {
          found = { spec: { paletteId, ground, moves, stars: recipe.stars }, reading, attempts };
        } else if (clock() >= deadline) {
          return null;
        }
      }
      return found;
    },
  };
};

export const generateSheet = (seed: string, recipe: SheetTemplate, paletteId: string): GeneratedSheet => {
  const search = searchSheet(seed, recipe, paletteId);
  for (;;) {
    const sheet = search.step(Infinity);
    if (sheet) return sheet;
  }
};
