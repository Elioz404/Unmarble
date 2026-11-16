import {
  createAdaptiveRaster,
  finishRaster,
  rasterizeAdaptive,
  refineEdges,
  shadeCentres,
  type AdaptiveRaster,
} from '../../shared/render/rasterize.ts';
import { whenIdle } from './idle.ts';
import type { SheetFrame, SheetRenderer } from './renderer.ts';

export type CpuRendererOptions = {
  /** Samples per pixel axis where an edge is resampled (see `EDGE_SAMPLES`). */
  readonly edgeSamples: number;
  /**
   * When the edges are resampled: with every frame (`'frame'`, for a canvas
   * small enough to afford it), or once the sheet has come to rest
   * (`'rest'`: animating frames are pixel centres only, so each one costs a
   * single sample per pixel, and the next frame cancels a pending refine).
   */
  readonly refine: 'frame' | 'rest';
};

/**
 * Canvas 2D fallback that evaluates the bath in JavaScript, edge-adaptively.
 * Used by the feed specimen (no WebGL context creation on the feed) and
 * wherever WebGL2 is missing or lost.
 */
export class CpuSheetRenderer implements SheetRenderer {
  readonly kind = 'cpu';
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #options: CpuRendererOptions;
  #image: ImageData | null = null;
  #raster: AdaptiveRaster | null = null;
  #cancelRefine: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, options: CpuRendererOptions) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.#canvas = canvas;
    this.#context = context;
    this.#options = options;
  }

  resize(width: number, height: number): void {
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    if (!this.#image || this.#image.width !== width || this.#image.height !== height) {
      this.#stopRefine();
      this.#image = this.#context.createImageData(width, height);
      this.#raster = createAdaptiveRaster(width, height);
    }
  }

  render(frame: SheetFrame): void {
    this.#stopRefine();
    const image = this.#image ?? this.#context.createImageData(this.#canvas.width, this.#canvas.height);
    const raster = this.#raster ?? createAdaptiveRaster(image.width, image.height);
    this.#image = image;
    this.#raster = raster;
    if (this.#options.refine === 'frame') {
      rasterizeAdaptive(raster, frame.ops, frame.ground, frame.palette, this.#options.edgeSamples, image.data);
      this.#context.putImageData(image, 0, 0);
      return;
    }
    shadeCentres(raster, frame.ops, frame.ground, frame.palette);
    finishRaster(raster, image.data);
    this.#context.putImageData(image, 0, 0);
    this.#cancelRefine = whenIdle(() => {
      this.#cancelRefine = null;
      this.#refine(raster, image, frame);
    });
  }

  dispose(): void {
    this.#stopRefine();
    this.#image = null;
    this.#raster = null;
  }

  #refine(raster: AdaptiveRaster, image: ImageData, frame: SheetFrame): void {
    refineEdges(raster, frame.ops, frame.ground, frame.palette, this.#options.edgeSamples);
    finishRaster(raster, image.data);
    this.#context.putImageData(image, 0, 0);
  }

  #stopRefine(): void {
    this.#cancelRefine?.();
    this.#cancelRefine = null;
  }
}
