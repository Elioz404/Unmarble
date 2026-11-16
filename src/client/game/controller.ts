import { COMMUNITY, EVIDENCE, INPUT, RULES, TIMING } from '../../shared/config.ts';
import { explainBlot, type BlotExplanation } from '../../shared/game/explain.ts';
import { resolveDrag, resolveTap } from '../../shared/game/gestures.ts';
import {
  applyAction,
  startSession,
  type PlayerAction,
  type SessionState,
  type SheetPoint,
} from '../../shared/game/session.ts';
import { dropOutline, seamPath, seamSegment, swirlEye } from '../../shared/puzzle/evidence.ts';
import { dropRadius, opsForPrefix, strokeOp, swirlOp } from '../../shared/puzzle/moves.ts';
import type { SheetSpec } from '../../shared/puzzle/sheet.ts';
import type { LoggedAction, ScarMap, Standing } from '../../shared/protocol/api.ts';
import type { SoundBank } from '../audio/sound.ts';
import { Animator, ease } from '../lib/animator.ts';
import { Store } from '../lib/store.ts';
import type { SheetRenderer } from '../render/renderer.ts';
import { groundTracing } from './ghost-paths.ts';
import { emptyOverlay, LENS, type OverlayColors, type OverlayModel, type OverlayPainter, type Wake } from './overlay.ts';
import { AttemptConflictError, type AttemptSink } from './attempt-sink.ts';
import { SheetScene } from './scene.ts';
import type { StageController } from './stage.ts';

export type { AttemptSink } from './attempt-sink.ts';

export type Feedback =
  | { readonly id: number; readonly kind: 'correct' }
  | { readonly id: number; readonly kind: 'miss' }
  | { readonly id: number; readonly kind: 'blot'; readonly explanation: BlotExplanation | null };

export type HintKind = 'round' | 'seam' | 'swirl' | 'lens';

/** How far (in move amounts) a wrong-way drag bends the water before it springs back. */
const WRONG_WAY_OVERSHOOT = 0.6;

/** Which contextual hints to offer, and after how long a pause. */
export type HintPolicy = {
  hasSeen(kind: HintKind): boolean;
  markSeen(kind: HintKind): void;
  /** Pause without progress before a hint is offered. */
  readonly delayMs: number;
};

/** How long feedback stays on the message line; blots linger to be read. */
const FEEDBACK_MS = { correct: 2200, miss: 2200, blot: 4500 } as const;
/** Points along the ghost finger's path. */
const DEMO_POINTS = 28;
/** Radius (cells) of the ghost finger's circle around a swirl's eye. */
const DEMO_CIRCLE_RADIUS = 1.6;
/** How far (cells) the ghost finger swipes along a fold. */
const DEMO_SWIPE_LENGTH = INPUT.minSwipeLength + 2;

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
  /** The stored attempt diverged from this device; the screen should reload it. */
  readonly desynced: boolean;
};

export type ControllerOptions = {
  readonly spec: SheetSpec;
  readonly log: readonly LoggedAction[];
  readonly sink: AttemptSink;
  readonly sound: SoundBank;
  readonly reducedMotion: () => boolean;
  readonly colors: () => OverlayColors;
  /** Contextual hints; null disables them (e.g. during lessons). */
  readonly hints: HintPolicy | null;
  /** Standing already known for a finished attempt (when reopening it). */
  readonly standing: Standing | null;
  /** Shows the gesture that undoes the top move until the player touches the sheet (lessons). */
  readonly demonstrate: boolean;
};

/**
 * Owns one attempt at one sheet: rules (shared reducer), presentation (scene,
 * overlay, animations) and persistence (sink). React components only read
 * `view` and call the intent methods.
 */
export class GameController implements StageController {
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
  #drawHandle: number | null = null;
  #renderedRevision = -1;
  /** The finger's path for the drag being acted on (session actions do not carry it). */
  #lastPath: readonly SheetPoint[] = [];
  #disposed = false;
  #demoing = false;
  /** Bumped whenever a demo must stop, so an older loop can never resume. */
  #demoRun = 0;
  /** Set by the player's first touch: the demo has done its job. */
  #demoDismissed = false;
  readonly #demonstrate: boolean;
  readonly #reducedMotion: () => boolean;

  constructor(options: ControllerOptions) {
    this.#spec = options.spec;
    this.#sink = options.sink;
    this.#sound = options.sound;
    this.#colors = options.colors;
    this.#hints = options.hints;
    this.#demonstrate = options.demonstrate;
    this.#reducedMotion = options.reducedMotion;
    this.#animator = new Animator(() => this.#draw(), options.reducedMotion);
    this.#disposed = false;

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
      standing: state.status === 'playing' ? null : options.standing,
      hint: null,
      desynced: false,
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
    this.#disposed = false;
    this.#renderer = renderer;
    this.#painter = painter;
    this.#renderedRevision = -1;
    // A finished sheet reopens as it was made: the sheet the player unmarbled (or that tore).
    if (this.#state.status !== 'playing' && this.view.get().settled) this.#scene.visible = this.#spec.moves.length;
    this.#draw();
    this.#armHint();
    if (this.#demonstrate && !this.#demoDismissed && this.#state.status === 'playing') void this.#runDemo();
  }

  detach(): void {
    this.#disposed = true;
    this.#demoing = false;
    this.#demoRun++;
    this.#clearTimer('feedback');
    this.#clearTimer('hint');
    if (this.#drawHandle !== null) cancelAnimationFrame(this.#drawHandle);
    this.#drawHandle = null;
    this.#animator.cancelAll();
    this.#renderer = null;
    this.#painter = null;
  }

  resize(width: number, height: number): void {
    this.#renderer?.resize(width, height);
    this.#painter?.resize(width, height);
    this.#renderedRevision = -1;
    this.#draw();
  }

  /**
   * Shows where everyone else tore the sheet (only after finishing), and,
   * once enough hands have played, pulses the move that caught the most.
   */
  showCommunityScars(map: ScarMap): void {
    // A handful of hands says nothing about "everyone": until then only the player's own scars show.
    if (map.hands < COMMUNITY.quietHands) return;
    this.#overlay.community = [...map.points];
    this.#requestDraw();
    if (map.trap) void this.#pulse(map.trap.move, TIMING.communityPulseMs);
  }

  tap(point: SheetPoint): void {
    this.#stopDemo();
    if (!this.#accepting()) return;
    this.#sound.unlock();
    const action = resolveTap(this.#spec, this.#state.remaining, point);
    if (!action) {
      void this.#miss(point);
      return;
    }
    void this.#act(action, point);
  }

  /** A finished drag across the sheet: a swipe along a fold or a circle around an eye. */
  drag(path: readonly SheetPoint[]): void {
    this.#stopDemo();
    this.#overlay.trail = [];
    if (!this.#accepting() || path.length < 2) {
      this.#requestDraw();
      return;
    }
    this.#sound.unlock();
    const action = resolveDrag(this.#spec, this.#state.remaining, path);
    const where = path[Math.floor(path.length / 2)] ?? null;
    if (!action) {
      if (where) void this.#miss(where);
      return;
    }
    // Session actions carry no path; the wake of a fold follows the finger.
    this.#lastPath = path;
    void this.#act(action, where);
  }

  /** Live trail while a finger drags across the sheet. */
  trace(points: readonly SheetPoint[]): void {
    this.#stopDemo();
    this.#overlay.trail = [...points];
    this.#requestDraw();
  }

  magnify(): void {
    this.#stopDemo();
    if (!this.#accepting() || this.#state.magnified) return;
    this.#sound.unlock();
    void this.#act({ type: 'magnify' }, null);
  }

  #accepting(): boolean {
    return this.#state.status === 'playing' && !this.view.get().busy;
  }

  #now(): number {
    return Math.min(RULES.maxAttemptMs, Math.round(performance.now() - this.#startedAt));
  }

  async #act(action: PlayerAction, point: SheetPoint | null): Promise<void> {
    const path = this.#lastPath;
    this.#lastPath = [];
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
      await this.#playUnmarble(action, path);
    } else {
      const explanation = explainBlot(this.#spec, previous.remaining, action);
      this.#showFeedback({ id: ++this.#feedbackId, kind: 'blot', explanation });
      await this.#playBlot(action, point, explanation);
    }
    console.assert(this.#overlay.wake === null, 'A wake must be gone before input returns');
    this.#publish({ busy: false });
    this.#armHint();

    if (this.#state.status !== 'playing') {
      await this.#playEnding();
      // The card appears now; the standing fills in whenever the network answers.
      this.#publish({ settled: true });
    }
    recording.then(
      (standing) => {
        if (standing && !this.#disposed) this.#publish({ standing });
      },
      (error: unknown) => {
        if (this.#disposed) return;
        if (error instanceof AttemptConflictError) this.#publish({ desynced: true });
        else console.error('Failed to record action', error);
      },
    );
  }

  /** Undoes the top move; `path` is the drag that did it, if any. */
  async #playUnmarble(action: PlayerAction, path: readonly SheetPoint[]): Promise<void> {
    this.#sound.play(action.type === 'absorb' ? 'absorb' : action.type === 'unswirl' ? 'unswirl' : 'unstroke');
    const wake = this.#wakeOf(action, path);
    await Promise.all([
      this.#animator.play({
        duration: TIMING.absorbMs,
        easing: ease.settle,
        update: (t) => {
          this.#scene.topAmount = 1 - t;
        },
      }),
      // Alongside, on a linear clock: the settle curve would fade the wake out in a blink.
      wake &&
        this.#animator.play({
          duration: TIMING.absorbMs,
          update: (t) => {
            this.#overlay.wake = { ...wake, progress: t };
          },
        }),
    ]);
    this.#overlay.wake = null;
    this.#scene.visible = this.#state.remaining;
    this.#scene.topAmount = 1;
    this.#draw();
  }

  /** The wake a correct undo leaves on the water, at progress 0; null when there is nothing to trace. */
  #wakeOf(action: PlayerAction, path: readonly SheetPoint[]): Wake | null {
    if (action.type === 'magnify') return null;
    const move = this.#spec.moves[action.move];
    switch (move?.kind) {
      case 'drop':
        return { kind: 'ring', at: { x: move.x, y: move.y }, radius: dropRadius(move.size), progress: 0 };
      case 'stroke':
        return path.length > 1 ? { kind: 'line', points: path, progress: 0 } : null;
      case 'swirl':
        // The undone swirl is the top move, so its eye is still the round probe circle.
        return { kind: 'arc', at: { x: move.x, y: move.y }, radius: EVIDENCE.swirlProbeRadius, turn: move.turn, progress: 0 };
      default:
        return null;
    }
  }

  async #playBlot(action: PlayerAction, point: SheetPoint | null, explanation: BlotExplanation | null): Promise<void> {
    this.#sound.play('tear');
    if (point) this.#overlay.scars.push(point);
    if (action.type !== 'magnify' && action.type !== 'absorb' && explanation?.culprit === null) {
      // Right mark, wrong way: the water bends further, then the paper springs back.
      const move = this.#spec.moves[action.move];
      const overshoot = (amount: number) =>
        move?.kind === 'stroke'
          ? strokeOp(move, action.move, amount)
          : move?.kind === 'swirl'
            ? swirlOp(move, action.move, amount)
            : null;
      await this.#animator.play({
        duration: TIMING.tearPreviewMs / 2,
        easing: ease.outCubic,
        update: (t) => {
          this.#scene.transient = overshoot(WRONG_WAY_OVERSHOOT * t);
        },
      });
      await this.#animator.play({
        duration: TIMING.tearRevertMs,
        easing: ease.inOutCubic,
        update: (t) => {
          this.#scene.transient = overshoot(WRONG_WAY_OVERSHOOT * (1 - t));
        },
      });
      this.#scene.transient = null;
      return;
    }
    const culprit = explanation?.culprit ?? null;
    if (culprit !== null) await this.#pulse(culprit, TIMING.tearPreviewMs);
  }

  /** Outlines one move as the sheet now shows it, glowing once. */
  async #pulse(move: number, duration: number): Promise<void> {
    const outline = this.#outlineOf(move);
    if (!outline) return;
    await this.#animator.play({
      duration,
      easing: ease.linear,
      update: (t) => {
        const pulse = Math.sin(Math.min(1, t * 1.25) * Math.PI);
        this.#overlay.highlight = { ...outline, opacity: pulse };
      },
    });
    this.#overlay.highlight = null;
    this.#draw();
  }

  /** The outline of a move in the frame on screen (the whole sheet once it is finished). */
  #outlineOf(move: number): { points: SheetPoint[]; closed: boolean } | null {
    const prefix = this.#scene.visible;
    if (move >= prefix) return null;
    const ops = opsForPrefix(this.#spec.moves, prefix);
    const target = this.#spec.moves[move];
    if (!target) return null;
    switch (target.kind) {
      case 'drop':
        return { points: dropOutline(ops, move, ops.length), closed: true };
      case 'stroke':
        return { points: seamPath(ops, move, ops.length), closed: false };
      case 'swirl':
        return { points: swirlEye(ops, move, ops.length), closed: true };
    }
  }

  /** The Lens sweeps a tracing of the untouched ground over the sheet, holds it, then lifts it away. Overlay only. */
  async #playLens(): Promise<void> {
    this.#sound.play('lens');
    this.#publish({ lensLeft: 0 });
    const path = groundTracing(this.#spec.ground);
    if (this.#reducedMotion()) {
      // No sweep: the tracing simply shows for as long as the Lens lasts.
      this.#overlay.lens = { path, reveal: 1, fade: 0 };
      this.#draw();
      await new Promise((resolve) => window.setTimeout(resolve, TIMING.magnifierMs));
    } else {
      await this.#animator.play({
        duration: TIMING.magnifierMs,
        easing: ease.linear,
        update: (t) => {
          const reveal = ease.outCubic(Math.min(1, t / LENS.sweep));
          const fade = ease.inOutCubic(Math.max(0, (t - LENS.liftFrom) / (1 - LENS.liftFrom)));
          this.#overlay.lens = { path, reveal, fade };
        },
      });
    }
    this.#overlay.lens = null;
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
      // The bare stripes hold for a breath, then the sheet marbles itself again, quickly: what you undid.
      this.#sound.play('clean');
      await this.#animator.wait(TIMING.cleanWaveMs);
      await this.#playReplay(TIMING.cleanReplayStepMs);
    } else {
      await this.#playReplay(TIMING.replayStepMs);
    }
    this.#publish({ busy: false });
  }

  /** Replays how the sheet was really made, move by move: a lesson after a tear, a flourish after a win. */
  async #playReplay(stepMs: number): Promise<void> {
    this.#overlay.scars = [];
    for (let i = 0; i < this.#spec.moves.length; i++) {
      this.#scene.visible = i + 1;
      this.#publish({ replayStep: i });
      await this.#animator.play({
        duration: stepMs,
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
      const kind: HintKind =
        this.#state.blots >= 2 && lensLeft > 0
          ? 'lens'
          : top?.kind === 'stroke'
            ? 'seam'
            : top?.kind === 'swirl'
              ? 'swirl'
              : 'round';
      if (hints.hasSeen(kind)) return;
      hints.markSeen(kind);
      this.#publish({ hint: kind });
    }, hints.delayMs);
  }

  /** The drag that undoes the top move, as a finger would draw it (folds and swirls only). */
  #demoPath(): SheetPoint[] | null {
    const index = this.#state.remaining - 1;
    const top = this.#spec.moves[index];
    if (top?.kind === 'stroke') {
      const op = strokeOp(top, index);
      const segment = seamSegment(op);
      if (!segment) return null;
      const mid = { x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2 };
      const half = DEMO_SWIPE_LENGTH / 2;
      // Against the fold's point: from ahead of it, back past it.
      return Array.from({ length: DEMO_POINTS }, (_, i) => {
        const t = half - (2 * half * i) / (DEMO_POINTS - 1);
        return { x: mid.x + op.ux * t, y: mid.y + op.uy * t };
      });
    }
    if (top?.kind === 'swirl') {
      // Against the turn, most of the way round the eye.
      const sweep = -top.turn * Math.PI * 1.4;
      return Array.from({ length: DEMO_POINTS }, (_, i) => {
        const a = -Math.PI / 2 + (sweep * i) / (DEMO_POINTS - 1);
        return { x: top.x + DEMO_CIRCLE_RADIUS * Math.cos(a), y: top.y + DEMO_CIRCLE_RADIUS * Math.sin(a) };
      });
    }
    return null;
  }

  /**
   * Draws the gesture with a ghost finger, over and over, until the player
   * touches the sheet. With reduced motion, the whole gesture is drawn once
   * and stays (a loop of instant tweens would never yield).
   */
  async #runDemo(): Promise<void> {
    const path = this.#demoPath();
    if (!path || this.#demoing) return;
    const run = ++this.#demoRun;
    this.#demoing = true;
    const current = (): boolean => run === this.#demoRun && !this.#disposed;
    if (this.#reducedMotion()) {
      this.#overlay.trail = path;
      this.#requestDraw();
      return;
    }
    while (current()) {
      await this.#animator.play({
        duration: TIMING.demoStrokeMs,
        easing: ease.inOutCubic,
        update: (t) => {
          if (current()) this.#overlay.trail = path.slice(0, Math.max(2, Math.round(t * path.length)));
        },
      });
      if (!current()) break;
      await this.#animator.wait(TIMING.demoRestMs);
      if (!current()) break;
      this.#overlay.trail = [];
      this.#requestDraw();
      await this.#animator.wait(TIMING.demoRestMs / 2);
    }
  }

  /** Any touch ends the demo for this sheet, for good. */
  #stopDemo(): void {
    this.#demoDismissed = true;
    if (!this.#demoing) return;
    this.#demoing = false;
    this.#demoRun++;
    this.#overlay.trail = [];
    this.#requestDraw();
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

  /** Coalesces overlay-only updates (e.g. a dragging finger) into one paint per frame. */
  #requestDraw(): void {
    if (this.#drawHandle !== null) return;
    this.#drawHandle = requestAnimationFrame(() => {
      this.#drawHandle = null;
      this.#draw();
    });
  }

  #draw(): void {
    // The marbled sheet is costly (and on the CPU fallback, very costly): redraw it only when it changed.
    if (this.#renderer && this.#scene.revision !== this.#renderedRevision) {
      this.#renderer.render(this.#scene.frame());
      this.#renderedRevision = this.#scene.revision;
    }
    this.#painter?.paint(this.#overlay, this.#colors());
  }
}
