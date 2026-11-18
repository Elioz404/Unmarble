import { TIMING } from '../../shared/config.ts';
import { resolveDrag, resolveTap } from '../../shared/game/gestures.ts';
import { applyAction, judgeAction, startSession, type PlayerAction, type SessionState, type SheetPoint } from '../../shared/game/session.ts';
import type { SheetSpec } from '../../shared/puzzle/sheet.ts';
import { Animator, ease } from '../lib/animator.ts';
import { EDGE_SAMPLES } from '../../shared/render/rasterize.ts';
import { CpuSheetRenderer } from '../render/cpu-renderer.ts';
import { demoPath, playGhostFinger } from './ghost-finger.ts';
import { emptyOverlay, type OverlayColors, type OverlayPainter } from './overlay.ts';
import { SheetScene } from './scene.ts';

/** What a touch read: the move that came last (undone), an earlier one, the right one the wrong way, or nothing. */
export type SpecimenAnswer = 'right' | 'wrong' | 'wrong-way' | 'none';

/** Where a specimen's ghost finger is drawn, and in which paper-side colours. */
export type SpecimenGhost = {
  readonly painter: OverlayPainter;
  readonly colors: () => OverlayColors;
};

export type SpecimenOptions = {
  readonly reducedMotion: () => boolean;
  /** How many moves may be undone: the feed card asks one question, a lesson specimen is undone to bare water. */
  readonly undoable: number;
  /** With a painter, the finger's trail shows, and a ghost finger draws each fold or swirl until the first touch. */
  readonly ghost: SpecimenGhost | null;
};

const MAX_RATIO = 2;

/**
 * How a specimen reads one touch, judged by the shared reducer: undoing the
 * top move is right; a tear on the top move itself is the right mark the
 * wrong way (a fold or swirl undone with its grain); any other tear is an
 * earlier mark, with something laid on it after.
 */
export const answerFor = (spec: SheetSpec, state: SessionState, action: PlayerAction | null): SpecimenAnswer => {
  if (!action) return 'none';
  const verdict = judgeAction(spec, state, action);
  if (verdict === 'ignored') return 'none';
  if (verdict === 'correct') return 'right';
  const onTop = action.type !== 'magnify' && action.move === state.remaining - 1;
  // A drop has no way to go: only a fold or a swirl can be the right one the wrong way.
  return onTop && action.type !== 'absorb' ? 'wrong-way' : 'wrong';
};

/**
 * A tiny, rule-free sheet: read by the same rules as a real one (the shared
 * reducer judges every touch), but nothing tears, nothing is scored and
 * nothing is kept. Drawn on the CPU, so a page can hold several.
 */
export class SpecimenPlayer {
  readonly #spec: SheetSpec;
  readonly #options: SpecimenOptions;
  readonly #scene: SheetScene;
  readonly #renderer: CpuSheetRenderer;
  readonly #animator: Animator;
  readonly #overlay = emptyOverlay();
  #state: SessionState;
  #renderedRevision = -1;
  /** Bumped whenever the ghost finger must stop, so an older loop can never resume. */
  #demoRun = 0;
  #touched = false;
  /** True while an undone move sinks back into the water; touches wait for it. */
  #undoing = false;
  #disposed = false;

  constructor(canvas: HTMLCanvasElement, spec: SheetSpec, options: SpecimenOptions) {
    this.#spec = spec;
    this.#options = options;
    this.#state = startSession(spec);
    this.#scene = new SheetScene(spec, spec.moves.length);
    this.#renderer = new CpuSheetRenderer(canvas, { edgeSamples: EDGE_SAMPLES.still, refine: 'frame' });
    this.#animator = new Animator(() => this.#draw(), options.reducedMotion);
    // Laid out already (the feed card): size it now. Otherwise the owner calls `resize` once it is.
    const ratio = SpecimenPlayer.pixelRatio;
    if (canvas.clientWidth > 0) this.resize(Math.round(canvas.clientWidth * ratio), Math.round(canvas.clientHeight * ratio));
    void this.#demonstrate();
  }

  /** The device-pixel ratio a specimen is drawn at, at most. */
  static get pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, MAX_RATIO);
  }

  /** Whether every move it lets you undo is undone. */
  get solved(): boolean {
    return this.#undone() >= this.#options.undoable;
  }

  /** Sizes the drawing surfaces, in device pixels. */
  resize(width: number, height: number): void {
    this.#renderer.resize(width, height);
    this.#options.ghost?.painter.resize(width, height);
    this.#renderedRevision = -1;
    this.#draw();
  }

  /** A tap at a point in sheet cells. */
  tap(point: SheetPoint): SpecimenAnswer {
    this.#touch();
    return this.#read(resolveTap(this.#spec, this.#state.remaining, point));
  }

  /** A finished drag in sheet cells: a swipe along a fold or a circle round an eye. */
  drag(path: readonly SheetPoint[]): SpecimenAnswer {
    this.#touch();
    this.#showTrail([]);
    return path.length < 2 ? 'none' : this.#read(resolveDrag(this.#spec, this.#state.remaining, path));
  }

  /** The live trail of a finger dragging across the sheet. */
  trace(points: readonly SheetPoint[]): void {
    this.#touch();
    this.#showTrail([...points]);
  }

  /** Lays every move back on the water, and shows the gesture again. */
  reset(): void {
    this.#animator.cancelAll();
    this.#state = startSession(this.#spec);
    this.#scene.visible = this.#spec.moves.length;
    this.#scene.topAmount = 1;
    this.#touched = false;
    this.#showTrail([]);
    void this.#demonstrate();
  }

  dispose(): void {
    this.#disposed = true;
    this.#demoRun++;
    this.#animator.cancelAll();
    this.#renderer.dispose();
  }

  #undone(): number {
    return this.#state.total - this.#state.remaining;
  }

  #read(action: PlayerAction | null): SpecimenAnswer {
    // The animator also runs the ghost finger, so it being busy says nothing about the sheet.
    if (!action || this.solved || this.#undoing) return 'none';
    const answer = answerFor(this.#spec, this.#state, action);
    if (answer !== 'right') return answer;
    // Specimens keep no clock: the reducer only ever sees them at time zero.
    this.#state = applyAction(this.#spec, this.#state, action, 0).state;
    this.#undoing = true;
    void this.#animator
      .play({
        duration: TIMING.absorbMs,
        easing: ease.settle,
        update: (t) => {
          this.#scene.topAmount = 1 - t;
        },
      })
      .then(() => {
        this.#undoing = false;
        if (this.#disposed) return;
        this.#scene.visible = this.#state.remaining;
        this.#scene.topAmount = 1;
        this.#draw();
      });
    return 'right';
  }

  /** The ghost finger, for specimens that have a painter, until the first touch. */
  async #demonstrate(): Promise<void> {
    const path = demoPath(this.#spec, this.#state.remaining);
    if (!this.#options.ghost || !path) return;
    const run = ++this.#demoRun;
    await playGhostFinger(path, {
      animator: this.#animator,
      reducedMotion: this.#options.reducedMotion,
      alive: () => run === this.#demoRun && !this.#touched && !this.#disposed,
      show: (trail) => this.#showTrail(trail),
    });
  }

  /** Any touch ends the ghost finger until the specimen is reset. */
  #touch(): void {
    if (this.#touched) return;
    this.#touched = true;
    this.#demoRun++;
    this.#showTrail([]);
  }

  #showTrail(trail: SheetPoint[]): void {
    this.#overlay.trail = trail;
    this.#draw();
  }

  #draw(): void {
    if (this.#disposed) return;
    // The marbled sheet is costly on the CPU: redraw it only when it changed.
    if (this.#scene.revision !== this.#renderedRevision) {
      this.#renderer.render(this.#scene.frame());
      this.#renderedRevision = this.#scene.revision;
    }
    const ghost = this.#options.ghost;
    ghost?.painter.paint(this.#overlay, ghost.colors());
  }
}
