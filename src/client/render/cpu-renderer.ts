import { rasterizeSheet } from '../../shared/render/rasterize.ts';
import type { SheetFrame, SheetRenderer } from './renderer.ts';

export type CpuRendererOptions = {
  /** Samples per pixel axis. 2 is crisp; 1 is fast. */
  readonly supersample: number;
};

/**
 * Canvas 2D fallback that evaluates the bath in JavaScript. Used by the
 * in-feed card (no WebGL context creation on the feed) and wherever WebGL2
 * is missing or lost.
 */
export class CpuSheetRenderer implements SheetRenderer {
  readonly kind = 'cpu';
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #options: CpuRendererOptions;
  #image: ImageData | null = null;

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
    }
  }

  render(frame: SheetFrame): void {
    const image = this.#image ?? this.#context.createImageData(this.#canvas.width, this.#canvas.height);
    this.#image = image;
    rasterizeSheet(
      frame.ops,
      frame.ground,
      frame.palette,
      { width: image.width, height: image.height, supersample: this.#options.supersample },
      image.data,
    );
    this.#context.putImageData(image, 0, 0);
  }

  dispose(): void {
    this.#image = null;
  }
}
