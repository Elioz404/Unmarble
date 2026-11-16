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
 * A reusable sample for hot loops: the fields of both kinds of
 * `FieldSample`, overwritten by every sampling. Only the fields of its
 * current `kind` are meaningful.
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

const fieldScratch = (): FieldScratch => ({
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
 * `out`, allocating nothing. Renderers use `sampleFieldJ`, its twin that also
 * carries the Jacobian (as the fragment shader does).
 */
const sampleFieldInto = (ops: readonly FieldOp[], x: number, y: number, out: FieldScratch): FieldScratch => {
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

/**
 * A `FieldScratch` that also carries the pull-back Jacobian: how the point it
 * landed on (the ground point, or the ink's `lx, ly`) moves per cell of
 * screen, row-major (`jxy` = ∂x/∂screen-y).
 */
export type FieldScratchJ = FieldScratch & { jxx: number; jxy: number; jyx: number; jyy: number };

export const fieldScratchJ = (): FieldScratchJ => ({ ...fieldScratch(), jxx: 1, jxy: 0, jyx: 0, jyy: 1 });

/** Below this, a squared distance to a drop or swirl centre is the centre itself (as in `field-ops.ts`). */
export const CENTRE_EPSILON = 1e-9;
/** Floor of a drop's pull-back scale √(1 − r²/l²), which reaches 0 on the rim. */
export const RIM_SCALE_FLOOR = 1e-4;

/** J ← [[a, b], [c, d]] · J. */
const compose = (out: FieldScratchJ, a: number, b: number, c: number, d: number): void => {
  const { jxx, jxy, jyx, jyy } = out;
  out.jxx = a * jxx + b * jyx;
  out.jxy = a * jxy + b * jyy;
  out.jyx = c * jxx + d * jyx;
  out.jyy = c * jxy + d * jyy;
};

/** J ← (k·I + m·d dᵀ) · J: the Jacobian of a radial map p ↦ c + d·f(|d|), d = p − c. */
const composeRadial = (out: FieldScratchJ, k: number, m: number, dx: number, dy: number): void =>
  compose(out, k + m * dx * dx, m * dx * dy, m * dx * dy, k + m * dy * dy);

/**
 * `sampleFieldInto`, also carrying the Jacobian of the pull-back from the
 * screen to where the sample landed (J ← J_op(p)·J before each op moves p).
 * Exact, so a renderer can draw rules of constant on-screen weight.
 */
export const sampleFieldJ = (ops: readonly FieldOp[], x: number, y: number, out: FieldScratchJ): FieldScratchJ => {
  out.x = x;
  out.y = y;
  out.jxx = 1;
  out.jxy = 0;
  out.jyx = 0;
  out.jyy = 1;
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i] as FieldOp;
    switch (op.type) {
      case 'drop': {
        const dx = out.x - op.cx;
        const dy = out.y - op.cy;
        const l2 = dx * dx + dy * dy;
        if (l2 <= op.r * op.r) {
          out.kind = 'ink';
          out.opIndex = i;
          out.source = op.source;
          out.ink = op.ink;
          out.depth = op.r > 0 ? Math.sqrt(l2) / op.r : 1;
          out.lx = dx;
          out.ly = dy;
          out.r = op.r;
          return out;
        }
        // p ↦ c + d·√(1 − r²/l²)
        const k = Math.max(Math.sqrt(1 - (op.r * op.r) / l2), RIM_SCALE_FLOOR);
        composeRadial(out, k, (op.r * op.r) / (k * l2 * l2), dx, dy);
        pullDrop(op.cx, op.cy, op.r, out);
        break;
      }
      case 'stroke': {
        // p ↦ p − u·shift·λ/(|n·(p − b)| + λ), n = (−uy, ux)
        const nx = -op.uy;
        const ny = op.ux;
        const side = (out.x - op.bx) * nx + (out.y - op.by) * ny;
        const reach = Math.abs(side) + op.falloff;
        const c = (Math.sign(side) * op.shift * op.falloff) / (reach * reach);
        compose(out, 1 + c * op.ux * nx, c * op.ux * ny, c * op.uy * nx, 1 + c * op.uy * ny);
        pullStroke(op, out);
        break;
      }
      case 'swirl': {
        // p ↦ c + R(θ)·d, θ = −turn·λ/(|d| + λ)
        const dx = out.x - op.cx;
        const dy = out.y - op.cy;
        const rho = Math.hypot(dx, dy);
        const reach = rho + op.falloff;
        const angle = (-op.turn * op.falloff) / reach;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // ∂θ/∂p = w·d; the rotation turns along R′(θ)·d = (−ey, ex), e = R(θ)·d.
        const w = rho * rho > CENTRE_EPSILON ? (op.turn * op.falloff) / (reach * reach * rho) : 0;
        const ex = dx * cos - dy * sin;
        const ey = dx * sin + dy * cos;
        compose(out, cos - ey * w * dx, -sin - ey * w * dy, sin + ex * w * dx, cos + ex * w * dy);
        pullSwirl(op, out);
        break;
      }
      case 'suction': {
        // p ↦ c + d·√(1 + r²/l²)
        const dx = out.x - op.cx;
        const dy = out.y - op.cy;
        const l2 = Math.max(dx * dx + dy * dy, CENTRE_EPSILON);
        const t = Math.sqrt(1 + (op.r * op.r) / l2);
        composeRadial(out, t, -(op.r * op.r) / (t * l2 * l2), dx, dy);
        pushDrop(op.cx, op.cy, op.r, out);
        break;
      }
    }
  }
  out.kind = 'ground';
  return out;
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
