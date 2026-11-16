import { RULES, TIMING } from '../../shared/config.ts';
import { explainBlot, type BlotExplanation } from '../../shared/game/explain.ts';
import { resolveSwipe, resolveTap } from '../../shared/game/gestures.ts';
import {
  applyAction,
  startSession,
  type PlayerAction,
  type SessionState,
  type SheetPoint,
} from '../../shared/game/session.ts';
import { dropOutline, seamPath } from '../../shared/puzzle/evidence.ts';
import { opsForPrefix, strokeOp } from '../../shared/puzzle/moves.ts';
import type { SheetSpec } from '../../shared/puzzle/sheet.ts';
import type { LoggedAction, Standing } from '../../shared/protocol/api.ts';
import type { SoundBank } from '../audio/sound.ts';
import { Animator, ease } from '../lib/animator.ts';
import { Store } from '../lib/store.ts';
import type { SheetRenderer } from '../render/renderer.ts';
import { emptyOverlay, type OverlayModel, type OverlayPainter } from './overlay.ts';
import { SheetScene } from './scene.ts';

/** Records an action wherever attempts are kept (server, local storage, nowhere). */
export type AttemptSink = {
  record(entry: LoggedAction): Promise<Standing | null>;
};

export type Feedback =
  | { readonly id: number; readonly kind: 'correct' }
  | { readonly id: number; readonly kind: 'miss' }
  | { readonly id: number; readonly kind: 'blot'; readonly explanation: BlotExplanation | null };

export type HintKind = 'round' | 'seam' | 'lens';

/** Which contextual hints this player has already been shown. */
export type HintPolicy = {
  hasSeen(kind: HintKind): boolean;
  markSeen(kind: HintKind): void;
};

/** How long feedback stays on the message line; blots linger to be read. */
const FEEDBACK_MS = { correct: 2200, miss: 2200, blot: 4500 } as const;
/** Pause without progress before a contextual hint is offered. */
const HINT_AFTER_MS = 22_000;

export type GameView = {
  readonly status: SessionState['status'];
  readonly total: number;
  readonly remaining: number;
  readonly blots: number;
  readonly lensLeft: number;
  /** True while an animation owns the sheet; input is ignored. */
  readonly busy: boolean;
  readonly feedback: Feedback | null;
  /** Step being shown by the end-of-sheet replay, if any. */
  readonly replayStep: number | null;
  /** True once the closing animation has played. */
  readonly settled: boolean;
  readonly standing: Standing | null;
  /** A contextual hint after a long pause, if one is due. */
  readonly hint: HintKind | null;
};

export type ControllerOptions = {
  readonly spec: SheetSpec;
  readonly log: readonly LoggedAction[];
  readonly sink: AttemptSink;
  readonly sound: SoundBank;
  readonly reducedMotion: () => boolean;
  readonly colors: () => { ink: string; paper: string; accent: string };
  /** Contextual hints; null disables them (e.g. during lessons). */
  readonly hints: HintPolicy | null;
};

/**
 * Owns one attempt at one sheet: rules (shared reducer), presentation (scene,
 * overlay, animations) and persistence (sink). React components only read
 * `view` and call the intent methods.
 */
export class GameController {
  readonly view: Store<GameView>;
  readonly #spec: SheetSpec;
  readonly #sink: AttemptSink;
  readonly #sound: SoundBank;
  readonly #colors: ControllerOptions['colors'];
  readonly #scene: SheetScene;
  readonly #overlay: OverlayModel = emptyOverlay();
  readonly #animator: Animator;
  #state: SessionState;
  #startedAt: number;
  #feedbackId = 0;
  #renderer: SheetRenderer | null = null;
  #painter: OverlayPainter | null = null;
  readonly #hints: HintPolicy | null;
  #feedbackTimer: number | null = null;
  #hintTimer: number | null = null;

  constructor(options: ControllerOptions) {
    this.#spec = options.spec;
    this.#sink = options.sink;
    this.#sound = options.sound;
    this.#colors = options.colors;
    this.#hints = options.hints;
    this.#animator = new Animator(() => this.#draw(), options.reducedMotion);

    let state = startSession(options.spec);
    for (const entry of options.log) {
      state = applyAction(options.spec, state, entry.action, entry.at, entry.point).state;
      if (entry.point && state.history[state.history.length - 1]?.verdict === 'blot') this.#overlay.scars.push(entry.point);
    }
    this.#state = state;
    const lastAt = state.history[state.history.length - 1]?.at ?? 0;
    this.#startedAt = performance.now() - lastAt;
    this.#scene = new SheetScene(options.spec, state.remaining);
    this.view = new Store<GameView>({
      status: state.status,
      total: state.total,
      remaining: state.remaining,
      blots: state.blots,
      lensLeft: state.magnified ? 0 : RULES.magnifiers,
      busy: false,
      feedback: null,
      replayStep: null,
      settled: state.status !== 'playing',
      standing: null,
      hint: null,
    });
  }

  get spec(): SheetSpec {
    return this.#spec;
  }

  get state(): SessionState {
    return this.#state;
  }

  /** Connects drawing surfaces. Call `resize` whenever their CSS size changes. */
  attach(renderer: SheetRenderer, painter: OverlayPainter): void {
    this.#renderer = renderer;
    this.#painter = painter;
    if (this.#state.status === 'torn') this.#scene.visible = this.#spec.moves.length;
    this.#draw();
    this.#armHint();
  }

  detach(): void {
    this.#clearTimer('feedback');
    this.#clearTimer('hint');
    this.#animator.cancelAll();
    this.#renderer = null;
    this.#painter = null;
  }

  resize(width: number, height: number): void {
    this.#renderer?.resize(width, height);
    this.#painter?.resize(width, height);
    this.#draw();
  }

  tap(point: SheetPoint): void {
    if (!this.#accepting()) return;
    this.#sound.unlock();
    const action = resolveTap(this.#spec, this.#state.remaining, point);
    if (!action) {
      void this.#miss(point);
      return;
    }
    void this.#act(action, point);
  }

  swipe(from: SheetPoint, to: SheetPoint): void {
    this.#overlay.trail = [];
    if (!this.#accepting()) {
      this.#draw();
      return;
    }
    this.#sound.unlock();
    const action = resolveSwipe(this.#spec, this.#state.remaining, from, to);
    if (!action) {
      void this.#miss({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
      return;
    }
    void this.#act(action, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  }

  /** Live trail while a finger drags across the sheet. */
  trace(points: readonly SheetPoint[]): void {
    this.#overlay.trail = [...points];
    this.#draw();
  }

  magnify(): void {
    if (!this.#accepting() || this.#state.magnified) return;
    this.#sound.unlock();
    void this.#act({ type: 'magnify' }, null);
  }

  #accepting(): boolean {
    return this.#state.status === 'playing' && !this.view.get().busy;
  }

  #now(): number {
    return Math.round(performance.now() - this.#startedAt);
  }

  async #act(action: PlayerAction, point: SheetPoint | null): Promise<void> {
    const previous = this.#state;
    const at = this.#now();
    const transition = applyAction(this.#spec, previous, action, at, point);
    if (transition.verdict === 'ignored') return;
    this.#state = transition.state;
    const recording = this.#sink.record({ action, at, point });
    this.#publish({ busy: true });

    if (action.type === 'magnify') {
      await this.#playLens();
    } else if (transition.verdict === 'correct') {
      this.#showFeedback({ id: ++this.#feedbackId, kind: 'correct' });
      await this.#playUnmarble(action);
    } else {
      const explanation = explainBlot(this.#spec, previous.remaining, action);
      this.#showFeedback({ id: ++this.#feedbackId, kind: 'blot', explanation });
      await this.#playBlot(action, point, explanation);
    }
    this.#publish({ busy: false });
    this.#armHint();

    if (this.#state.status !== 'playing') {
      await this.#playEnding();
      const standing = await recording.catch(() => null);
      this.#publish({ settled: true, standing });
    } else {
      recording.catch((error: unknown) => console.error('Failed to record action', error));
    }
  }

  async #playUnmarble(action: PlayerAction): Promise<void> {
    this.#sound.play(action.type === 'absorb' ? 'absorb' : 'unstroke');
    await this.#animator.play({
      duration: TIMING.absorbMs,
      easing: ease.settle,
      update: (t) => {
        this.#scene.topAmount = 1 - t;
      },
    });
    this.#scene.visible = this.#state.remaining;
    this.#scene.topAmount = 1;
    this.#draw();
  }

  async #playBlot(action: PlayerAction, point: SheetPoint | null, explanation: BlotExplanation | null): Promise<void> {
    this.#sound.play('tear');
    if (point) this.#overlay.scars.push(point);
    if (action.type === 'unstroke' && explanation?.reason === 'with-the-grain') {
      // Dragging with the grain bends the seam further, then the paper springs back.
      const move = this.#spec.moves[action.move];
      if (move?.kind === 'stroke') {
        await this.#animator.play({
          duration: TIMING.tearPreviewMs / 2,
          easing: ease.outCubic,
          update: (t) => {
            this.#scene.transient = strokeOp(move, action.move, 0.6 * t);
          },
        });
        await this.#animator.play({
          duration: TIMING.tearRevertMs,
          easing: ease.inOutCubic,
          update: (t) => {
            this.#scene.transient = strokeOp(move, action.move, 0.6 * (1 - t));
          },
        });
        this.#scene.transient = null;
      }
      return;
    }
    const culprit = explanation?.culprit ?? null;
    const outline = culprit === null ? null : this.#outlineOf(culprit);
    if (!outline) return;
    await this.#animator.play({
      duration: TIMING.tearPreviewMs,
      easing: ease.linear,
      update: (t) => {
        const pulse = Math.sin(Math.min(1, t * 1.25) * Math.PI);
        this.#overlay.highlight = { ...outline, opacity: pulse };
      },
    });
    this.#overlay.highlight = null;
    this.#draw();
  }

  #outlineOf(move: number): { points: SheetPoint[]; closed: boolean } | null {
    const ops = opsForPrefix(this.#spec.moves, this.#state.remaining);
    const target = this.#spec.moves[move];
    if (!target) return null;
    return target.kind === 'drop'
      ? { points: dropOutline(ops, move, ops.length), closed: true }
      : { points: seamPath(ops, move, ops.length), closed: false };
  }

  async #playLens(): Promise<void> {
    this.#sound.play('lens');
    this.#publish({ lensLeft: 0 });
    await this.#animator.play({
      duration: TIMING.magnifierMs,
      easing: ease.linear,
      update: (t) => {
        this.#scene.ghost = Math.sin(t * Math.PI) ** 0.5;
      },
    });
    this.#scene.ghost = 0;
    this.#draw();
  }

  async #miss(point: SheetPoint): Promise<void> {
    this.#sound.play('miss');
    this.#showFeedback({ id: ++this.#feedbackId, kind: 'miss' });
    await this.#animator.play({
      duration: 700,
      easing: ease.outCubic,
      update: (t) => {
        this.#overlay.ripple = { at: point, progress: t };
      },
    });
    this.#overlay.ripple = null;
    this.#draw();
  }

  async #playEnding(): Promise<void> {
    this.#publish({ busy: true });
    if (this.#state.status === 'clean') {
      this.#sound.play('clean');
      await this.#animator.wait(TIMING.cleanWaveMs);
    } else {
      await this.#playReplay();
    }
    this.#publish({ busy: false });
  }

  /** A torn sheet replays how it was really made, move by move. */
  async #playReplay(): Promise<void> {
    this.#overlay.scars = [];
    for (let i = 0; i < this.#spec.moves.length; i++) {
      this.#scene.visible = i + 1;
      this.#publish({ replayStep: i });
      await this.#animator.play({
        duration: TIMING.replayStepMs,
        easing: ease.outQuint,
        update: (t) => {
          this.#scene.topAmount = t;
        },
      });
    }
    this.#scene.topAmount = 1;
    this.#publish({ replayStep: null });
  }

  #showFeedback(feedback: Feedback): void {
    this.#clearTimer('feedback');
    this.#publish({ feedback });
    this.#feedbackTimer = window.setTimeout(() => this.#publish({ feedback: null }), FEEDBACK_MS[feedback.kind]);
  }

  /** (Re)starts the idle countdown after which a contextual hint may appear. */
  #armHint(): void {
    this.#clearTimer('hint');
    if (this.view.get().hint) this.#publish({ hint: null });
    const hints = this.#hints;
    if (!hints || this.#state.status !== 'playing') return;
    this.#hintTimer = window.setTimeout(() => {
      const top = this.#spec.moves[this.#state.remaining - 1];
      const lensLeft = this.view.get().lensLeft;
      const kind: HintKind = this.#state.blots >= 2 && lensLeft > 0 ? 'lens' : top?.kind === 'stroke' ? 'seam' : 'round';
      if (hints.hasSeen(kind)) return;
      hints.markSeen(kind);
      this.#publish({ hint: kind });
    }, HINT_AFTER_MS);
  }

  #clearTimer(which: 'feedback' | 'hint'): void {
    const handle = which === 'feedback' ? this.#feedbackTimer : this.#hintTimer;
    if (handle !== null) window.clearTimeout(handle);
    if (which === 'feedback') this.#feedbackTimer = null;
    else this.#hintTimer = null;
  }

  #publish(patch: Partial<GameView>): void {
    const s = this.#state;
    this.view.update({ status: s.status, remaining: s.remaining, blots: s.blots, ...patch });
  }

  #draw(): void {
    this.#renderer?.render(this.#scene.frame());
    this.#painter?.paint(this.#overlay, this.#colors());
  }
}
