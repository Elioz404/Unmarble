import type { SheetPoint } from '../../shared/game/session.ts';
import type { SheetRenderer } from '../render/renderer.ts';
import type { OverlayPainter } from './overlay.ts';

/**
 * What the sheet stage drives: something that draws a sheet and takes taps
 * and drags in sheet cells. Implemented by the game (unmarbling a sheet) and
 * by the composer (marbling a trap).
 */
export type StageController = {
  attach(renderer: SheetRenderer, painter: OverlayPainter): void;
  detach(): void;
  resize(width: number, height: number): void;
  tap(point: SheetPoint): void;
  drag(path: readonly SheetPoint[]): void;
  trace(points: readonly SheetPoint[]): void;
};

/**
 * How the paper sits in the bath: floating while played; rising out of it
 * clean, then lifted; sinking torn, then resting torn.
 */
export type StageMood = 'floating' | 'rising' | 'lifted' | 'sinking' | 'torn';
