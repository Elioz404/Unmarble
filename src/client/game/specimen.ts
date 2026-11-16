import { SHEET, TIMING } from '../../shared/config.ts';
import { resolveTap } from '../../shared/game/gestures.ts';
import type { SheetSpec } from '../../shared/puzzle/sheet.ts';
import { Animator, ease } from '../lib/animator.ts';
import { CpuSheetRenderer } from '../render/cpu-renderer.ts';
import { SheetScene } from './scene.ts';

export type SpecimenAnswer = 'right' | 'wrong' | 'none';

const MAX_RATIO = 2;

/**
 * A tiny, rule-free sheet for the feed card: tap the drop that fell last and
 * it sinks back into the water. No scoring, no persistence.
 */
export class SpecimenPlayer {
  readonly #spec: SheetSpec;
  readonly #scene: SheetScene;
  readonly #renderer: CpuSheetRenderer;
  readonly #animator: Animator;
  #solved = false;

  constructor(canvas: HTMLCanvasElement, spec: SheetSpec, reducedMotion: () => boolean) {
    this.#spec = spec;
    this.#scene = new SheetScene(spec, spec.moves.length);
    this.#renderer = new CpuSheetRenderer(canvas, { supersample: 2 });
    this.#animator = new Animator(() => this.#draw(), reducedMotion);
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
    this.#renderer.resize(Math.round(canvas.clientWidth * ratio), Math.round(canvas.clientHeight * ratio));
    this.#draw();
  }

  /** Taps at a point given as fractions (0–1) of the canvas. */
  tap(fx: number, fy: number): SpecimenAnswer {
    if (this.#solved || this.#animator.busy) return 'none';
    const action = resolveTap(this.#spec, this.#scene.visible, { x: fx * SHEET.cols, y: fy * SHEET.rows });
    if (action?.type !== 'absorb') return 'none';
    if (action.move !== this.#scene.visible - 1) return 'wrong';
    this.#solved = true;
    void this.#animator
      .play({
        duration: TIMING.absorbMs,
        easing: ease.settle,
        update: (t) => {
          this.#scene.topAmount = 1 - t;
        },
      })
      .then(() => {
        this.#scene.visible -= 1;
        this.#scene.topAmount = 1;
        this.#draw();
      });
    return 'right';
  }

  dispose(): void {
    this.#animator.cancelAll();
    this.#renderer.dispose();
  }

  #draw(): void {
    this.#renderer.render(this.#scene.frame());
  }
}
