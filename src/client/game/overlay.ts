import { SHEET } from '../../shared/config.ts';
import type { SheetPoint } from '../../shared/game/session.ts';

/**
 * Everything drawn over the marbled sheet in paper space: scars left by
 * blots, the outline of the move that gave the order away, a ripple where a
 * tap found no ink, and the trail of a swipe in progress.
 */
export type OverlayModel = {
  scars: SheetPoint[];
  /** Outline of a culprit move (closed for drops, open for seams) and its opacity. */
  highlight: { points: readonly SheetPoint[]; closed: boolean; opacity: number } | null;
  ripple: { at: SheetPoint; progress: number } | null;
  trail: SheetPoint[];
};

export const emptyOverlay = (): OverlayModel => ({ scars: [], highlight: null, ripple: null, trail: [] });

/** Deterministic jitter so each scar is ragged but stable across frames. */
const jitter = (seed: number): number => {
  const v = Math.sin(seed * 91.37) * 43758.5453;
  return v - Math.floor(v) - 0.5;
};

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

  paint(model: OverlayModel, colors: { ink: string; paper: string; accent: string }): void {
    const ctx = this.#context;
    const s = this.#scale;
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    model.scars.forEach((scar, index) => this.#paintScar(scar, index, colors));

    if (model.highlight && model.highlight.points.length > 1) {
      const { points, closed, opacity } = model.highlight;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.setLineDash([0.18 * s, 0.22 * s]);
      ctx.lineWidth = Math.max(1.5, 0.09 * s);
      ctx.strokeStyle = colors.accent;
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s)));
      if (closed) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    if (model.ripple) {
      const { at, progress } = model.ripple;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * 0.55;
      ctx.lineWidth = Math.max(1, 0.05 * s);
      ctx.strokeStyle = colors.ink;
      for (const ring of [0, 0.35]) {
        const t = Math.max(0, progress - ring);
        ctx.beginPath();
        ctx.arc(at.x * s, at.y * s, (0.25 + t * 1.1) * s, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (model.trail.length > 1) {
      ctx.save();
      ctx.lineWidth = Math.max(2, 0.14 * s);
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      model.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s)));
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A small tear in the paper: a ragged slit with lifted fibres. */
  #paintScar(scar: SheetPoint, index: number, colors: { ink: string; paper: string }): void {
    const ctx = this.#context;
    const s = this.#scale;
    const angle = jitter(index + 1) * Math.PI;
    const length = 0.55 + jitter(index + 7) * 0.2;
    const cx = scar.x * s;
    const cy = scar.y * s;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const steps = 7;
    const path: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps - 0.5;
      const wobble = jitter(index * 13 + i) * 0.12;
      path.push([cx + (ux * t * length - uy * wobble) * s, cy + (uy * t * length + ux * wobble) * s]);
    }
    ctx.save();
    // Lifted paper edge: a pale halo under the slit.
    ctx.strokeStyle = colors.paper;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(3, 0.16 * s);
    ctx.beginPath();
    path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    // The slit itself.
    ctx.strokeStyle = colors.ink;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(1, 0.045 * s);
    ctx.beginPath();
    path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    // Fibres.
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(0.6, 0.02 * s);
    for (let i = 0; i < 5; i++) {
      const [x, y] = path[1 + i] ?? [cx, cy];
      const side = i % 2 === 0 ? 1 : -1;
      const fl = (0.08 + Math.abs(jitter(index * 5 + i)) * 0.1) * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - uy * fl * side + ux * fl * 0.3, y + ux * fl * side + uy * fl * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }
}
