import { createAdaptiveRaster, finishRaster, refineEdges, shadeCentres } from '../../shared/render/rasterize.ts';
import type { SheetFrame } from './renderer.ts';

/** Pixel-ratio ceiling for static previews: crisp enough, cheap enough. */
const MAX_RATIO = 2;

/**
 * Paints one still frame of a sheet into a canvas at its CSS size, fast
 * first: every pixel centre at once. Returns `refine`, which resamples only
 * the edges (`edgeSamples` per axis) and repaints, for when there is time.
 */
export const paintStaticSheet = (canvas: HTMLCanvasElement, frame: SheetFrame, edgeSamples: number): (() => void) | null => {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const image = context.createImageData(width, height);
  const raster = createAdaptiveRaster(width, height);
  shadeCentres(raster, frame.ops, frame.ground, frame.palette);
  finishRaster(raster, image.data);
  context.putImageData(image, 0, 0);
  return () => {
    refineEdges(raster, frame.ops, frame.ground, frame.palette, edgeSamples);
    finishRaster(raster, image.data);
    context.putImageData(image, 0, 0);
  };
};
