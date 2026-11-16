import { EDGE_SAMPLES } from '../../shared/render/rasterize.ts';
import { CpuSheetRenderer } from './cpu-renderer.ts';
import type { SheetRenderer } from './renderer.ts';
import { WebGlSheetRenderer, WebGlUnavailableError } from './webgl/webgl-renderer.ts';

export type SheetSurface = {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: SheetRenderer;
};

const freshCanvas = (className: string): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  return canvas;
};

/**
 * Creates a drawing surface for an interactive sheet: a canvas the renderer
 * owns outright (a canvas can only ever hold one kind of context), WebGL2
 * when available, CPU otherwise.
 */
export const createInteractiveSurface = (className: string, preferCpu = false): SheetSurface => {
  if (!preferCpu) {
    const canvas = freshCanvas(className);
    try {
      return { canvas, renderer: new WebGlSheetRenderer(canvas) };
    } catch (error) {
      if (!(error instanceof WebGlUnavailableError)) throw error;
      console.warn(error.message);
    }
  }
  const canvas = freshCanvas(className);
  return { canvas, renderer: new CpuSheetRenderer(canvas, { edgeSamples: EDGE_SAMPLES.fallback }) };
};
