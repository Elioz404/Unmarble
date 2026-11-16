import { createAdaptiveRaster, rasterizeAdaptive, type AdaptiveRaster } from '../../shared/render/rasterize.ts';
import type { SheetFrame, SheetRenderer } from './renderer.ts';

export type CpuRendererOptions = {
  /** Samples per pixel axis where an edge is resampled (see `EDGE_SAMPLES`). */
  readonly edgeSamples: number;
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
      this.#image = this.#context.createImageData(width, height);
      this.#raster = createAdaptiveRaster(width, height);
    }
  }

  render(frame: SheetFrame): void {
    const image = this.#image ?? this.#context.createImageData(this.#canvas.width, this.#canvas.height);
    const raster = this.#raster ?? createAdaptiveRaster(image.width, image.height);
    this.#image = image;
    this.#raster = raster;
    rasterizeAdaptive(raster, frame.ops, frame.ground, frame.palette, this.#options.edgeSamples, image.data);
    this.#context.putImageData(image, 0, 0);
  }

  dispose(): void {
    this.#image = null;
    this.#raster = null;
  }
}
