import {
  pullDrop,
  pullStroke,
  pullSwirl,
  pushDrop,
  pushStroke,
  pushSwirl,
  type FieldOp,
  type Point,
} from './field-ops.ts';

/**
 * What a point of the finished sheet shows: either the ink of one drop, or the
 * bare ground at some original (pre-marbling) coordinate.
 */
export type FieldSample =
  | {
      kind: 'ink';
      /** Index of the op in the stack. */
      opIndex: number;
      /** Puzzle move that produced the ink. */
      source: number;
      ink: number;
      /** Radial position inside the drop at the time it fell: 0 centre … 1 rim. */
      depth: number;
    }
  | { kind: 'ground'; x: number; y: number };

/**
 * Pulls a point back through `ops` (top first) and reports what it shows.
 * Pure and allocation-light; this is the CPU twin of the fragment shader.
 */
export const sampleField = (ops: readonly FieldOp[], x: number, y: number): FieldSample => {
  const p: Point = { x, y };
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i] as FieldOp;
    switch (op.type) {
      case 'drop': {
        const dx = p.x - op.cx;
        const dy = p.y - op.cy;
        if (!pullDrop(op.cx, op.cy, op.r, p)) {
          const depth = op.r > 0 ? Math.sqrt(dx * dx + dy * dy) / op.r : 1;
          return { kind: 'ink', opIndex: i, source: op.source, ink: op.ink, depth };
        }
        break;
      }
      case 'stroke':
        pullStroke(op, p);
        break;
      case 'swirl':
        pullSwirl(op, p);
        break;
      case 'suction':
        pushDrop(op.cx, op.cy, op.r, p);
        break;
    }
  }
  return { kind: 'ground', x: p.x, y: p.y };
};

/** Maps a point forward through `ops[from..to)`. Mutates and returns `p`. */
export const pushThrough = (ops: readonly FieldOp[], from: number, to: number, p: Point): Point => {
  for (let i = from; i < to; i++) {
    const op = ops[i] as FieldOp;
    if (op.type === 'drop') pushDrop(op.cx, op.cy, op.r, p);
    else if (op.type === 'stroke') pushStroke(op, p);
    else if (op.type === 'swirl') pushSwirl(op, p);
    else pullDrop(op.cx, op.cy, op.r, p);
  }
  return p;
};

/**
 * Pulls a point back through `ops[from..to)` (from the top, `to − 1`, down to
 * `from`). Returns false if the point lands inside ink on the way.
 */
export const pullThrough = (ops: readonly FieldOp[], from: number, to: number, p: Point): boolean => {
  for (let i = to - 1; i >= from; i--) {
    const op = ops[i] as FieldOp;
    if (op.type === 'drop') {
      if (!pullDrop(op.cx, op.cy, op.r, p)) return false;
    } else if (op.type === 'stroke') {
      pullStroke(op, p);
    } else if (op.type === 'swirl') {
      pullSwirl(op, p);
    } else {
      pushDrop(op.cx, op.cy, op.r, p);
    }
  }
  return true;
};
