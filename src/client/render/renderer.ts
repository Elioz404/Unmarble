import type { FieldOp } from '../../shared/marbling/field-ops.ts';
import type { ShadingPalette } from '../../shared/render/shading.ts';
import type { Ground } from '../../shared/sheet/ground.ts';

/** Everything needed to draw one frame of a sheet. */
export type SheetFrame = {
  readonly ops: readonly FieldOp[];
  readonly ground: Ground;
  readonly palette: ShadingPalette;
  /** Magnifier ghost strength, 0–1. */
  readonly ghost: number;
};

/** A drawing backend for sheets. WebGL2 when available, CPU otherwise. */
export type SheetRenderer = {
  readonly kind: 'webgl' | 'cpu';
  /** Sets the drawing buffer size in device pixels. */
  resize(width: number, height: number): void;
  render(frame: SheetFrame): void;
  dispose(): void;
};

/** Upper bound of ops a renderer must handle: all moves plus one transient. */
export const MAX_RENDER_OPS = 12;
