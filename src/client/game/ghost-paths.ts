import { SHEET } from '../../shared/config.ts';
import { groundCrossPhase, groundPhase, type Ground } from '../../shared/sheet/ground.ts';

/**
 * The Lens tracing's lattice: a 0.08-cell step, refined where the phase field
 * bends inside a cell (a chevron's crease, the centre of rings) until it is
 * flat to `FLAT` phase units, so every chord stays well within half a device
 * pixel of the true ruling on a phone (see `ghost-paths.test.ts`).
 */
const STEP = 0.08;
const FLAT = 0.001;
const MAX_REFINE = 3;

type Phase = (x: number, y: number) => number;

/** A straight piece of a ruling, in sheet cells: from (x0, y0) to (x1, y1). */
export type Segment = readonly [x0: number, y0: number, x1: number, y1: number];

/** Phase values at a cell's corners, going round it from the top left. */
type Corners = readonly [number, number, number, number];

/** The cell's edges in the same order: corner indices, then unit offsets from one end to the other. */
const EDGES = [
  [0, 1, 0, 0, 1, 0],
  [1, 2, 1, 0, 1, 1],
  [2, 3, 1, 1, 0, 1],
  [3, 0, 0, 1, 0, 0],
] as const;

/** Appends the pieces of `level` inside the square cell at (x, y) of side `size`, whose corner values are `v`. */
const traceLevel = (x: number, y: number, size: number, v: Corners, level: number, out: Segment[]): void => {
  const points: number[] = [];
  for (const [from, to, x0, y0, x1, y1] of EDGES) {
    if (v[from] < level === v[to] < level) continue;
    const t = (level - v[from]) / (v[to] - v[from]);
    points.push(x + (x0 + (x1 - x0) * t) * size, y + (y0 + (y1 - y0) * t) * size);
  }
  const [ax, ay, bx, by, cx, cy, dx, dy] = points as [number, number, number, number, number, number, number, number];
  if (points.length === 4) {
    out.push([ax, ay, bx, by]);
  } else if (points.length === 8) {
    // A saddle: the centre's side decides which pair of opposite corners the level cuts off.
    const centre = (v[0] + v[1] + v[2] + v[3]) / 4;
    if (v[0] < level === centre < level) out.push([ax, ay, bx, by], [cx, cy, dx, dy]);
    else out.push([dx, dy, ax, ay], [bx, by, cx, cy]);
  }
};

/** Every integer level of a phase field inside one cell, halving the cell where the field bends. */
const traceCell = (phase: Phase, x: number, y: number, size: number, refine: number, out: Segment[]): void => {
  const v: Corners = [phase(x, y), phase(x + size, y), phase(x + size, y + size), phase(x, y + size)];
  const mean = (v[0] + v[1] + v[2] + v[3]) / 4;
  if (refine > 0 && Math.abs(phase(x + size / 2, y + size / 2) - mean) > FLAT) {
    const half = size / 2;
    for (const [dx, dy] of [[0, 0], [half, 0], [half, half], [0, half]] as const) traceCell(phase, x + dx, y + dy, half, refine - 1, out);
    return;
  }
  for (let level = Math.ceil(Math.min(...v)); level <= Math.max(...v); level++) traceLevel(x, y, size, v, level, out);
};

/** Every integer level of one phase field across the sheet. */
const traceField = (phase: Phase, out: Segment[]): void => {
  const cols = Math.round(SHEET.cols / STEP);
  const rows = Math.round(SHEET.rows / STEP);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) traceCell(phase, i * STEP, j * STEP, STEP, MAX_REFINE, out);
};

/**
 * Every ruling of the untouched ground as segments in sheet cells: the
 * integer levels of its phase field (and of a grid's crossing field), by
 * linearly interpolated marching squares.
 */
export const groundRulings = (ground: Ground): Segment[] => {
  const segments: Segment[] = [];
  traceField((x, y) => groundPhase(ground, x, y), segments);
  if (ground.family === 'grid') traceField((x, y) => groundCrossPhase(ground, x, y) ?? 0, segments);
  return segments;
};

/** The Lens tracing of a ground as one path in sheet cells, ready to stroke. */
export const groundTracing = (ground: Ground): Path2D => {
  const path = new Path2D();
  for (const [x0, y0, x1, y1] of groundRulings(ground)) {
    path.moveTo(x0, y0);
    path.lineTo(x1, y1);
  }
  return path;
};
