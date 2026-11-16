import type { FieldOp } from '../../shared/marbling/field-ops.ts';
import { moveToOp } from '../../shared/puzzle/moves.ts';
import type { SheetSpec } from '../../shared/puzzle/sheet.ts';
import { shadingPaletteOf, type ShadingPalette } from '../../shared/render/shading.ts';
import { getPalette } from '../../shared/sheet/palettes.ts';
import type { SheetFrame } from '../render/renderer.ts';

/**
 * What the sheet looks like right now: the moves still on the bath, the
 * partial amount of the move being animated, and any transient op layered on
 * top for feedback. Animations only ever change amounts, so every frame is a
 * physically exact marbling state.
 *
 * Every change bumps `revision`, so drawing code re-renders the (expensive)
 * sheet only when it actually changed, not for overlay-only updates.
 */
export class SheetScene {
  readonly spec: SheetSpec;
  readonly palette: ShadingPalette;
  #visible: number;
  #topAmount = 1;
  #transient: FieldOp | null = null;
  #ghost = 0;
  #revision = 0;

  constructor(spec: SheetSpec, visible: number) {
    this.spec = spec;
    this.palette = shadingPaletteOf(getPalette(spec.paletteId));
    this.#visible = visible;
  }

  get revision(): number {
    return this.#revision;
  }

  /** Moves currently on the bath (fully or partially). */
  get visible(): number {
    return this.#visible;
  }

  set visible(value: number) {
    this.#visible = value;
    this.#revision++;
  }

  /** Amount (0–1) of the top visible move; < 1 while it is absorbed or poured. */
  set topAmount(value: number) {
    this.#topAmount = value;
    this.#revision++;
  }

  /** Extra op drawn above everything, e.g. a seam dragged the wrong way. */
  set transient(value: FieldOp | null) {
    this.#transient = value;
    this.#revision++;
  }

  /** Magnifier ghost strength, 0–1. */
  set ghost(value: number) {
    this.#ghost = value;
    this.#revision++;
  }

  ops(): FieldOp[] {
    const ops: FieldOp[] = [];
    for (let i = 0; i < this.#visible; i++) {
      const move = this.spec.moves[i];
      if (!move) break;
      ops.push(moveToOp(move, i, i === this.#visible - 1 ? this.#topAmount : 1));
    }
    if (this.#transient) ops.push(this.#transient);
    return ops;
  }

  frame(): SheetFrame {
    return { ops: this.ops(), ground: this.spec.ground, palette: this.palette, ghost: this.#ghost };
  }
}
