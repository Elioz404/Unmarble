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
      /** Offset (cells) from the drop's centre when it fell: coordinates that travel with the ink. */
      lx: number;
      ly: number;
      /** Radius (cells) of the drop. */
      r: number;
    }
  | { kind: 'ground'; x: number; y: number };

/**
 * A reusable sample for hot loops (rendering): the fields of both kinds of
 * `FieldSample`, overwritten by every `sampleFieldInto`. Only the fields of
 * its current `kind` are meaningful.
 */
export type FieldScratch = {
  kind: 'ink' | 'ground';
  opIndex: number;
  source: number;
  ink: number;
  depth: number;
  lx: number;
  ly: number;
  r: number;
  x: number;
  y: number;
};

export const fieldScratch = (): FieldScratch => ({
  kind: 'ground',
  opIndex: -1,
  source: -1,
  ink: 0,
  depth: 0,
  lx: 0,
  ly: 0,
  r: 0,
  x: 0,
  y: 0,
});

/**
 * Pulls a point back through `ops` (top first) and writes what it shows into
 * `out`, allocating nothing. This is the CPU twin of the fragment shader.
 */
export const sampleFieldInto = (ops: readonly FieldOp[], x: number, y: number, out: FieldScratch): FieldScratch => {
  // The point being pulled back is `out` itself; once on the ground, it is the ground coordinate.
  out.x = x;
  out.y = y;
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i] as FieldOp;
    switch (op.type) {
      case 'drop': {
        const dx = out.x - op.cx;
        const dy = out.y - op.cy;
        if (!pullDrop(op.cx, op.cy, op.r, out)) {
          out.kind = 'ink';
          out.opIndex = i;
          out.source = op.source;
          out.ink = op.ink;
          out.depth = op.r > 0 ? Math.sqrt(dx * dx + dy * dy) / op.r : 1;
          out.lx = dx;
          out.ly = dy;
          out.r = op.r;
          return out;
        }
        break;
      }
      case 'stroke':
        pullStroke(op, out);
        break;
      case 'swirl':
        pullSwirl(op, out);
        break;
      case 'suction':
        pushDrop(op.cx, op.cy, op.r, out);
        break;
    }
  }
  out.kind = 'ground';
  return out;
};

/** Pulls a point back through `ops` (top first) and reports what it shows. Pure. */
export const sampleField = (ops: readonly FieldOp[], x: number, y: number): FieldSample => {
  const s = sampleFieldInto(ops, x, y, fieldScratch());
  return s.kind === 'ink'
    ? { kind: 'ink', opIndex: s.opIndex, source: s.source, ink: s.ink, depth: s.depth, lx: s.lx, ly: s.ly, r: s.r }
    : { kind: 'ground', x: s.x, y: s.y };
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
