import { INPUT, SHEET, TIMING } from '../../shared/config.ts';
import type { SheetPoint } from '../../shared/game/session.ts';
import { dropOutline, seamPath, swirlEye } from '../../shared/puzzle/evidence.ts';
import {
  opsForPrefix,
  snapHeading,
  snapToHalfCell,
  type DropSize,
  type InkSlot,
  type Move,
} from '../../shared/puzzle/moves.ts';
import type { SheetSpec } from '../../shared/puzzle/sheet.ts';
import { checkTrap, TRAP_RULES, type TrapCheck } from '../../shared/puzzle/trap.ts';
import type { SoundBank } from '../audio/sound.ts';
import { Animator, ease } from '../lib/animator.ts';
import { Store } from '../lib/store.ts';
import type { SheetRenderer } from '../render/renderer.ts';
import { emptyOverlay, type OverlayColors, type OverlayModel, type OverlayPainter } from './overlay.ts';
import { SheetScene } from './scene.ts';
import type { StageController } from './stage.ts';

export type ComposerTool = 'drop' | 'fold' | 'swirl';

export type ComposerView = {
  readonly tool: ComposerTool;
  readonly size: DropSize;
  readonly ink: InkSlot;
  readonly turn: 1 | -1;
  readonly moves: readonly Move[];
  /** The live contract check of the trap as it stands. */
  readonly check: TrapCheck;
  readonly busy: boolean;
};

export type ComposerOptions = {
  /** Today's paper: its palette and ground; its moves are ignored. */
  readonly paper: SheetSpec;
  readonly sound: SoundBank;
  readonly reducedMotion: () => boolean;
  readonly colors: () => OverlayColors;
};

/**
 * The trap editor's model: marbling forwards, one move at a time, with the
 * sheet contract checked live after every move. The move that breaks the
 * contract (if any) is outlined on the paper, so the maker sees what to fix.
 */
export class ComposerController implements StageController {
  readonly view: Store<ComposerView>;
  readonly #paper: SheetSpec;
  readonly #sound: SoundBank;
  readonly #colors: ComposerOptions['colors'];
  readonly #animator: Animator;
  readonly #overlay: OverlayModel = emptyOverlay();
  #scene: SheetScene;
  #renderer: SheetRenderer | null = null;
  #painter: OverlayPainter | null = null;
  #renderedRevision = -1;
  #renderedScene: SheetScene | null = null;
  /** While locked (publishing, or published) the paper ignores every input. */
  #locked = false;

  constructor(options: ComposerOptions) {
    this.#paper = { ...options.paper, moves: [] };
    this.#sound = options.sound;
    this.#colors = options.colors;
    this.#animator = new Animator(() => this.#draw(), options.reducedMotion);
    this.#scene = new SheetScene(this.#paper, 0);
    this.view = new Store<ComposerView>({
      tool: 'drop',
      size: 'L',
      ink: 0,
      turn: 1,
      moves: [],
      check: checkTrap([], this.#paper.ground),
      busy: false,
    });
  }

  /** The trap as it stands, on today's paper. */
  get spec(): SheetSpec {
    return { ...this.#paper, moves: this.view.get().moves, stars: this.view.get().check.stars };
  }

  setTool(tool: ComposerTool): void {
    this.view.update({ tool });
  }

  setSize(size: DropSize): void {
    this.view.update({ size, tool: 'drop' });
  }

  setInk(ink: InkSlot): void {
    this.view.update({ ink, tool: 'drop' });
  }

  setTurn(turn: 1 | -1): void {
    this.view.update({ turn, tool: 'swirl' });
  }

  /** Freezes the trap as it is (while it is being set, and once it has been). */
  setLocked(locked: boolean): void {
    this.#locked = locked;
    if (locked) {
      this.#overlay.trail = [];
      this.#draw();
    }
  }

  attach(renderer: SheetRenderer, painter: OverlayPainter): void {
    this.#renderer = renderer;
    this.#painter = painter;
    this.#renderedRevision = -1;
    this.#draw();
  }

  detach(): void {
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

  tap(point: SheetPoint): void {
    if (this.#locked) return;
    const { tool, size, ink, turn } = this.view.get();
    const x = snapToHalfCell(point.x);
    const y = snapToHalfCell(point.y);
    if (tool === 'drop') void this.#add({ kind: 'drop', x, y, size, ink });
    else if (tool === 'swirl') void this.#add({ kind: 'swirl', x, y, turn });
  }

  drag(path: readonly SheetPoint[]): void {
    this.#overlay.trail = [];
    const first = path[0];
    const last = path[path.length - 1];
    if (this.#locked || !first || !last) return this.#draw();
    if (this.view.get().tool !== 'fold') {
      // A held or slightly rolled press is still a placement, read where it began (as a tap is).
      const reach = Math.max(...path.map((p) => Math.hypot(p.x - first.x, p.y - first.y)));
      if (reach <= INPUT.fingerRadius * 2) this.tap(first);
      return this.#draw();
    }
    const length = Math.hypot(last.x - first.x, last.y - first.y);
    if (length < INPUT.minSwipeLength) return this.#draw();
    const heading = snapHeading((Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI);
    const x = snapToHalfCell((first.x + last.x) / 2);
    const y = snapToHalfCell((first.y + last.y) / 2);
    void this.#add({ kind: 'stroke', x, y, heading });
  }

  trace(points: readonly SheetPoint[]): void {
    if (this.#locked || this.view.get().tool !== 'fold') return;
    this.#overlay.trail = [...points];
    this.#draw();
  }

  /** Takes the last move back out of the water. */
  async undo(): Promise<void> {
    const { moves, busy } = this.view.get();
    if (this.#locked || busy || moves.length === 0) return;
    this.view.update({ busy: true });
    this.#sound.unlock();
    this.#sound.play('absorb');
    await this.#animator.play({
      duration: TIMING.absorbMs,
      easing: ease.settle,
      update: (t) => {
        this.#scene.topAmount = 1 - t;
      },
    });
    this.#commit(moves.slice(0, -1));
  }

  async #add(move: Move): Promise<void> {
    const { moves, busy } = this.view.get();
    if (this.#locked || busy || moves.length >= TRAP_RULES.maxMoves) return;
    if (move.x < 0 || move.x > SHEET.cols || move.y < 0 || move.y > SHEET.rows) return;
    this.view.update({ busy: true });
    this.#sound.unlock();
    this.#sound.play(move.kind === 'drop' ? 'absorb' : move.kind === 'swirl' ? 'unswirl' : 'unstroke');
    const next = [...moves, move];
    this.#scene = new SheetScene({ ...this.#paper, moves: next }, next.length);
    // Pour the new move in: the same exact physics, run forwards.
    await this.#animator.play({
      duration: TIMING.absorbMs,
      easing: ease.outQuint,
      update: (t) => {
        this.#scene.topAmount = t;
      },
    });
    this.#commit(next);
  }

  #commit(moves: readonly Move[]): void {
    const check = checkTrap(moves, this.#paper.ground);
    this.#scene = new SheetScene({ ...this.#paper, moves }, moves.length);
    this.#overlay.highlight = this.#problemOutline(moves, check);
    this.view.update({ moves, check, busy: false });
    this.#draw();
  }

  /** Outlines the move a problem names, as the paper shows it. */
  #problemOutline(moves: readonly Move[], check: TrapCheck): OverlayModel['highlight'] {
    const problem = check.problem;
    if (!problem || !('move' in problem)) return null;
    const ops = opsForPrefix(moves, moves.length);
    const move = moves[problem.move];
    if (!move) return null;
    const points =
      move.kind === 'drop'
        ? dropOutline(ops, problem.move, ops.length)
        : move.kind === 'swirl'
          ? swirlEye(ops, problem.move, ops.length)
          : seamPath(ops, problem.move, ops.length);
    return { points, closed: move.kind !== 'stroke', opacity: 0.85 };
  }

  #draw(): void {
    if (this.#renderer && (this.#scene !== this.#renderedScene || this.#scene.revision !== this.#renderedRevision)) {
      this.#renderer.render(this.#scene.frame());
      this.#renderedScene = this.#scene;
      this.#renderedRevision = this.#scene.revision;
    }
    this.#painter?.paint(this.#overlay, this.#colors());
  }
}
