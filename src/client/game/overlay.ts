import { SHEET } from '../../shared/config.ts';
import type { SheetPoint } from '../../shared/game/session.ts';

/**
 * A sub-second trace of water light left by a correct undo, gone before input
 * returns: an opening broken ring for a drop, a fading line along the drag for
 * a fold, one counter-turning arc around a swirl's eye.
 */
export type Wake =
  | { kind: 'ring'; at: SheetPoint; radius: number; progress: number }
  | { kind: 'line'; points: readonly SheetPoint[]; progress: number }
  | { kind: 'arc'; at: SheetPoint; radius: number; turn: 1 | -1; progress: number };

/**
 * Everything drawn over the marbled sheet in paper space: scars left by
 * blots, the outline of the move that gave the order away (or, in its own
 * dotted ink, of the move the Apprentice fell for), a ripple where a tap
 * found no ink, the wake of an undo, the trail of a swipe in progress,
 * and the Lens tracing. Only the highlight may close, and only along an
 * outline the sheet already has: on this sheet, a round mark means "fell last".
 */
/** Whose reading an outline shows: the move that gave the order away, or the one the Apprentice fell for. */
export type HighlightStyle = 'culprit' | 'apprentice';

export type OverlayModel = {
  scars: SheetPoint[];
  /** Outline of a move (closed for drops, open for seams), whose reading it shows, and its opacity. */
  highlight: { points: readonly SheetPoint[]; closed: boolean; style: HighlightStyle; opacity: number } | null;
  ripple: { at: SheetPoint; progress: number } | null;
  wake: Wake | null;
  trail: SheetPoint[];
  /** Where everyone else tore the sheet today, weighted by how many hands. */
  community: readonly { readonly x: number; readonly y: number; readonly weight: number }[];
  /** The Lens: the untouched rulings (in cells), swept in down to `reveal` (0–1) and lifting away by `fade` (0–1). */
  lens: { path: Path2D; reveal: number; fade: number } | null;
};

/**
 * Paper-side colours (the sheet is never themed): `ink` for the slit of a
 * tear, `water` and `shade` for the light and the dark rim of water marks.
 */
export type OverlayColors = {
  ink: string;
  paper: string;
  water: string;
  shade: string;
  accent: string;
  blot: string;
};

export const emptyOverlay = (): OverlayModel => ({
  scars: [],
  highlight: null,
  ripple: null,
  wake: null,
  trail: [],
  community: [],
  lens: null,
});

/**
 * The Lens tracing: the untouched ground as a crisp vellum tracing, swept in
 * by a band of cool light. Widths are CSS pixels, so it is equally crisp at
 * every pixel ratio; colours are the `--lens-ink` and `--lens-light` tokens.
 */
export const LENS = Object.freeze({
  /** Share of the Lens time spent sweeping down the sheet, and the point from which the tracing lifts away. */
  sweep: 0.45,
  liftFrom: 0.7,
  /** Soft leading edge of the tracing, and the band of light just ahead of it, in cells. */
  feather: 1.2,
  band: 1.5,
  bandAlpha: 0.1,
  /** A pale under-glow, so the line reads on dark ink too, then the blue core over it. */
  glowWidth: 3,
  glowAlpha: 0.35,
  coreWidth: 1.25,
  coreAlpha: 0.85,
});

/** Sizes in cells unless named `Px` (device pixels); alphas in [0, 1]. */
const MARK = Object.freeze({
  /** Segments along a tear: enough to look ragged, few enough to stay a slit. */
  tearSteps: 7,
  /** Sideways wobble of a tear as a share of its length: every tear stays at least 5× longer than wide. */
  tearRagged: 0.2,
  /** The player's own tear: a pale lifted edge under a dark slit, a little longer for some blots than others. */
  scarLength: 0.55,
  scarLengthJitter: 0.2,
  scarHalo: 0.16,
  scarHaloAlpha: 0.9,
  scarSlit: 0.045,
  scarSlitAlpha: 0.75,
  scarFibres: 5,
  scarFibreAlpha: 0.35,
  /** Fibres lifted off a tear: short hairs, partly along the tear. */
  fibreLength: 0.08,
  fibreLengthJitter: 0.1,
  fibreLean: 0.3,
  fibreWidth: 0.02,
  /** Everyone else's tears grow from a short nick to a long rip with the share of hands. */
  communityLength: 0.35,
  communityLengthGain: 0.35,
  communityAlpha: 0.25,
  communityAlphaGain: 0.45,
  communityWidth: 0.05,
  communityFibres: 3,
  communityFibreAlpha: 0.3,
  /** Culprit outline: dashed gilt over a pale paper under-stroke, so it reads on dark ink too. */
  highlightCore: 0.07,
  highlightUnder: 0.13,
  highlightUnderAlpha: 0.7,
  highlightDash: 0.18,
  highlightGap: 0.22,
  /** The Apprentice's outline: round ink dots, never gilt, so it can't pass for the sheet's own answer. */
  apprenticeDot: 0.01,
  apprenticeGap: 0.26,
  /** Water marks: a darker rim this many pixels each side of a light core. */
  waterShadePx: 1,
  waterShadeAlpha: 0.18,
  waterLightAlpha: 0.5,
  rippleWidth: 0.05,
  /** A broken ring is three open arcs, 80° of every 120°, so it can never close. */
  brokenArcs: 3,
  brokenArcSpan: (80 / 180) * Math.PI,
  /** Missed tap: two broken rings spreading from a small start, the second a beat behind. */
  rippleStart: 0.25,
  rippleSpread: 1.1,
  rippleDelays: [0, 0.35],
  /**
   * Ghost finger and live trail: wet paper darkens (the shade band reads on
   * pale paper), and water light runs down its middle (it reads on dark ink).
   * Tapers over its last fifth.
   */
  trailWidth: 0.14,
  trailShadeAlpha: 0.26,
  trailLight: 0.55,
  trailLightAlpha: 0.42,
  trailTaper: 0.2,
  /** Wakes are broader than a ripple: they have under a second to be seen, while the sheet itself moves. */
  wakeWidth: 0.09,
  /** How far a drop's wake ring opens beyond the drop's own edge. */
  wakeRingOpen: 0.6,
  /** How far a swirl's wake arc travels round the eye, and how long it is. */
  wakeArcSweep: Math.PI,
  wakeArcSpan: (100 / 180) * Math.PI,
  /** The wake arc starts at the top of the eye, where the lesson's finger starts. */
  wakeArcStart: -Math.PI / 2,
});

/** Deterministic jitter so each scar is ragged but stable across frames. */
const jitter = (seed: number): number => {
  const v = Math.sin(seed * 91.37) * 43758.5453;
  return v - Math.floor(v) - 0.5;
};

/** A stable seed from a position, so a mark keeps its shape from frame to frame. */
const seedOf = (p: { readonly x: number; readonly y: number }): number => p.x * 7.13 + p.y * 3.71;

/**
 * A tear as an open polyline in cells about its centre: a ragged slit along
 * `angle`, never wider than a fifth of its length, so it never reads as a drop.
 */
export const tearPath = (seed: number, length: number, angle: number): SheetPoint[] => {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return Array.from({ length: MARK.tearSteps + 1 }, (_, i) => {
    const t = i / MARK.tearSteps - 0.5;
    const wobble = jitter(seed * 13 + i) * MARK.tearRagged * length;
    return { x: ux * t * length - uy * wobble, y: uy * t * length + ux * wobble };
  });
};

type CanvasPath = readonly (readonly [number, number])[];

export class OverlayPainter {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  #scale = 1;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.#canvas = canvas;
    this.#context = context;
  }

  resize(width: number, height: number): void {
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#scale = width / SHEET.cols;
  }

  paint(model: OverlayModel, colors: OverlayColors): void {
    const ctx = this.#context;
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.#paintCommunity(model.community, colors);
    model.scars.forEach((scar, index) => this.#paintScar(scar, index, colors));
    if (model.lens) this.#paintLens(model.lens);
    if (model.highlight && model.highlight.points.length > 1) this.#paintHighlight(model.highlight, colors);
    if (model.ripple) this.#paintRipple(model.ripple, colors);
    if (model.wake) this.#paintWake(model.wake, colors);
    if (model.trail.length > 1) this.#paintTrail(model.trail, colors);
  }

  /** Everyone's tears as thin oxblood rips: the more hands tore there, the longer and darker. */
  #paintCommunity(points: OverlayModel['community'], colors: OverlayColors): void {
    if (points.length === 0) return;
    const ctx = this.#context;
    const heaviest = Math.max(...points.map((p) => p.weight));
    ctx.save();
    ctx.strokeStyle = colors.blot;
    points.forEach((p, index) => {
      const strength = p.weight / heaviest;
      const seed = index + seedOf(p);
      const angle = jitter(seed + 1) * Math.PI;
      const path = this.#toCanvas(p, tearPath(seed, MARK.communityLength + MARK.communityLengthGain * strength, angle));
      ctx.globalAlpha = MARK.communityAlpha + MARK.communityAlphaGain * strength;
      ctx.lineWidth = Math.max(1, MARK.communityWidth * this.#scale);
      this.#strokePolyline(path);
      ctx.globalAlpha = MARK.communityFibreAlpha;
      this.#strokeFibres(path, MARK.communityFibres, seed, angle);
    });
    ctx.restore();
  }

  /** A small tear in the paper: a ragged slit with lifted fibres. */
  #paintScar(scar: SheetPoint, index: number, colors: OverlayColors): void {
    const ctx = this.#context;
    const s = this.#scale;
    const angle = jitter(index + 1) * Math.PI;
    const length = MARK.scarLength + jitter(index + 7) * MARK.scarLengthJitter;
    const path = this.#toCanvas(scar, tearPath(index, length, angle));
    ctx.save();
    // Lifted paper edge: a pale halo under the slit.
    ctx.strokeStyle = colors.paper;
    ctx.globalAlpha = MARK.scarHaloAlpha;
    ctx.lineWidth = Math.max(3, MARK.scarHalo * s);
    this.#strokePolyline(path);
    // The slit itself.
    ctx.strokeStyle = colors.ink;
    ctx.globalAlpha = MARK.scarSlitAlpha;
    ctx.lineWidth = Math.max(1, MARK.scarSlit * s);
    this.#strokePolyline(path);
    ctx.globalAlpha = MARK.scarFibreAlpha;
    this.#strokeFibres(path, MARK.scarFibres, index, angle);
    ctx.restore();
  }

  /**
   * An outline over a pale under-stroke, so it reads on paper and ink alike:
   * the culprit in dashed gilt, the Apprentice's pick in dotted ink.
   */
  #paintHighlight(highlight: NonNullable<OverlayModel['highlight']>, colors: OverlayColors): void {
    const ctx = this.#context;
    const s = this.#scale;
    const { points, closed, style, opacity } = highlight;
    const core = Math.max(1.5, MARK.highlightCore * s);
    const apprentice = style === 'apprentice';
    ctx.save();
    ctx.setLineDash(
      apprentice ? [MARK.apprenticeDot * s, MARK.apprenticeGap * s] : [MARK.highlightDash * s, MARK.highlightGap * s],
    );
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s)));
    if (closed) ctx.closePath();
    ctx.strokeStyle = colors.paper;
    ctx.globalAlpha = opacity * MARK.highlightUnderAlpha;
    ctx.lineWidth = Math.max(core + 2, MARK.highlightUnder * s);
    ctx.stroke();
    ctx.strokeStyle = apprentice ? colors.ink : colors.accent;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = core;
    ctx.stroke();
    ctx.restore();
  }

  /** A missed tap: two pale broken rings spreading on the water, never closed. */
  #paintRipple({ at, progress }: NonNullable<OverlayModel['ripple']>, colors: OverlayColors): void {
    const s = this.#scale;
    MARK.rippleDelays.forEach((delay, ring) => {
      const radius = (MARK.rippleStart + Math.max(0, progress - delay) * MARK.rippleSpread) * s;
      const turn = jitter(seedOf(at) + ring);
      this.#wet(() => this.#traceBrokenRing(at.x * s, at.y * s, radius, turn), MARK.rippleWidth, 1 - progress, colors);
    });
  }

  #paintWake(wake: Wake, colors: OverlayColors): void {
    this.#wet(() => this.#traceWake(wake), MARK.wakeWidth, 1 - wake.progress, colors);
  }

  /** Adds a wake's shape at its progress to the current path. */
  #traceWake(wake: Wake): void {
    const ctx = this.#context;
    const s = this.#scale;
    switch (wake.kind) {
      case 'ring': {
        const radius = (wake.radius + MARK.wakeRingOpen * wake.progress) * s;
        this.#traceBrokenRing(wake.at.x * s, wake.at.y * s, radius, jitter(seedOf(wake.at)));
        return;
      }
      case 'line':
        wake.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s)));
        return;
      case 'arc': {
        // Against the turn, like the gesture that undid it.
        const head = MARK.wakeArcStart - wake.turn * MARK.wakeArcSweep * wake.progress;
        const tail = head + wake.turn * MARK.wakeArcSpan;
        const [cx, cy, r] = [wake.at.x * s, wake.at.y * s, wake.radius * s];
        ctx.moveTo(cx + r * Math.cos(tail), cy + r * Math.sin(tail));
        ctx.arc(cx, cy, r, tail, head, wake.turn > 0);
        return;
      }
    }
  }

  /** A finger's path as a wet line: a damp band with water light down its middle, tapering to the tip. */
  #paintTrail(trail: readonly SheetPoint[], colors: OverlayColors): void {
    const ctx = this.#context;
    const s = this.#scale;
    const path = trail.map((p) => [p.x * s, p.y * s] as const);
    const width = Math.max(2, MARK.trailWidth * s);
    ctx.save();
    ctx.fillStyle = colors.shade;
    ctx.globalAlpha = MARK.trailShadeAlpha;
    this.#fillTapered(path, width);
    ctx.fillStyle = colors.water;
    ctx.globalAlpha = MARK.trailLightAlpha;
    this.#fillTapered(path, Math.max(1, MARK.trailLight * width));
    ctx.restore();
  }

  /**
   * Fills a polyline `width` wide as one ribbon that narrows to a point over
   * the last `trailTaper` of its length. One fill covers each pixel once, so
   * joints never darken under a translucent alpha. Every piece winds the same
   * way (quads A-D-C-B, arcs with rising angle) so the nonzero rule never
   * cancels an overlap into a hole, even where the path crosses itself.
   */
  #fillTapered(path: CanvasPath, width: number): void {
    const ctx = this.#context;
    const run = [0];
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1] ?? [0, 0];
      const [bx, by] = path[i] ?? [0, 0];
      run.push((run[i - 1] ?? 0) + Math.hypot(bx - ax, by - ay));
    }
    const total = run[run.length - 1] ?? 0;
    if (total <= 0) return;
    const taper = MARK.trailTaper * total;
    const radius = (i: number): number => (width / 2) * Math.min(1, (total - (run[i] ?? total)) / taper);
    ctx.beginPath();
    path.forEach(([x, y], i) => {
      const r = radius(i);
      if (r <= 0) return;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 2 * Math.PI);
    });
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1] ?? [0, 0];
      const [bx, by] = path[i] ?? [0, 0];
      const length = Math.hypot(bx - ax, by - ay);
      if (length === 0) continue;
      const nx = -(by - ay) / length;
      const ny = (bx - ax) / length;
      const [ra, rb] = [radius(i - 1), radius(i)];
      ctx.moveTo(ax + nx * ra, ay + ny * ra);
      ctx.lineTo(ax - nx * ra, ay - ny * ra);
      ctx.lineTo(bx - nx * rb, by - ny * rb);
      ctx.lineTo(bx + nx * rb, by + ny * rb);
      ctx.closePath();
    }
    ctx.fill();
  }

  /** Adds open arcs of one circle to the current path; `turn` in [−0.5, 0.5) rotates them. */
  #traceBrokenRing(cx: number, cy: number, radius: number, turn: number): void {
    const ctx = this.#context;
    const period = (2 * Math.PI) / MARK.brokenArcs;
    for (let i = 0; i < MARK.brokenArcs; i++) {
      const from = (i + turn) * period;
      ctx.moveTo(cx + radius * Math.cos(from), cy + radius * Math.sin(from));
      ctx.arc(cx, cy, radius, from, from + MARK.brokenArcSpan);
    }
  }

  /**
   * Strokes the path `trace` adds as water light, `width` cells wide: a dark
   * rim, then a pale core, both fading with `fade`. Normal compositing: a transparent 2D canvas
   * cannot blend with the WebGL sheet beneath it.
   */
  #wet(trace: () => void, width: number, fade: number, colors: OverlayColors): void {
    if (fade <= 0) return;
    const ctx = this.#context;
    const core = Math.max(1, width * this.#scale);
    ctx.save();
    ctx.beginPath();
    trace();
    ctx.strokeStyle = colors.shade;
    ctx.globalAlpha = MARK.waterShadeAlpha * fade;
    ctx.lineWidth = core + 2 * MARK.waterShadePx;
    ctx.stroke();
    ctx.strokeStyle = colors.water;
    ctx.globalAlpha = MARK.waterLightAlpha * fade;
    ctx.lineWidth = core;
    ctx.stroke();
    ctx.restore();
  }

  /** Short fibres lifted off a tear, alternating sides, in the current stroke style. */
  #strokeFibres(path: CanvasPath, count: number, seed: number, angle: number): void {
    const ctx = this.#context;
    const s = this.#scale;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    ctx.lineWidth = Math.max(0.6, MARK.fibreWidth * s);
    for (let i = 0; i < count; i++) {
      const point = path[1 + i];
      if (!point) break;
      const [x, y] = point;
      const side = i % 2 === 0 ? 1 : -1;
      const fl = (MARK.fibreLength + Math.abs(jitter(seed * 5 + i)) * MARK.fibreLengthJitter) * s;
      this.#strokePolyline([
        [x, y],
        [x - uy * fl * side + ux * fl * MARK.fibreLean, y + ux * fl * side + uy * fl * MARK.fibreLean],
      ]);
    }
  }

  #strokePolyline(path: CanvasPath): void {
    const ctx = this.#context;
    ctx.beginPath();
    path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  /** A path in cells about `centre`, in canvas pixels. */
  #toCanvas(centre: { readonly x: number; readonly y: number }, path: readonly SheetPoint[]): CanvasPath {
    const s = this.#scale;
    return path.map((p) => [(centre.x + p.x) * s, (centre.y + p.y) * s] as const);
  }

  /** The Lens tracing: a double line (pale glow, blue core) fading in behind a sweeping band of light. */
  #paintLens({ path, reveal, fade }: NonNullable<OverlayModel['lens']>): void {
    const ctx = this.#context;
    const s = this.#scale;
    const style = getComputedStyle(this.#canvas);
    const ink = style.getPropertyValue('--lens-ink').trim();
    const light = style.getPropertyValue('--lens-light').trim();
    // Device pixels per CSS pixel: the line widths are CSS pixels.
    const ratio = this.#canvas.width / (this.#canvas.clientWidth || this.#canvas.width);
    // The front runs on past the bottom edge, so a full reveal shows all of the tracing and none of the band.
    const front = reveal * (SHEET.rows + LENS.feather + LENS.band);
    const fadingIn = (channels: string, alpha: number): CanvasGradient => {
      const gradient = ctx.createLinearGradient(0, front - LENS.feather, 0, front);
      gradient.addColorStop(0, `rgb(${channels} / ${alpha})`);
      gradient.addColorStop(1, `rgb(${channels} / 0)`);
      return gradient;
    };
    ctx.save();
    ctx.scale(s, s);
    ctx.globalAlpha = 1 - fade;
    ctx.lineWidth = (LENS.glowWidth * ratio) / s;
    ctx.strokeStyle = fadingIn(light, LENS.glowAlpha);
    ctx.stroke(path);
    ctx.lineWidth = (LENS.coreWidth * ratio) / s;
    ctx.strokeStyle = fadingIn(ink, LENS.coreAlpha);
    ctx.stroke(path);
    const band = ctx.createLinearGradient(0, front - LENS.band, 0, front);
    band.addColorStop(0, `rgb(${light} / 0)`);
    band.addColorStop(1, `rgb(${light} / ${LENS.bandAlpha})`);
    ctx.fillStyle = band;
    ctx.fillRect(0, front - LENS.band, SHEET.cols, LENS.band);
    ctx.restore();
  }
}
