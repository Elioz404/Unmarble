import { rasterizeSheet } from '../../shared/render/rasterize.ts';
import type { SheetFrame } from './renderer.ts';

/** Pixel-ratio ceiling for static previews: crisp enough, cheap enough. */
const MAX_RATIO = 2;

/** Paints one still frame of a sheet into a canvas at its CSS size. */
export const paintStaticSheet = (canvas: HTMLCanvasElement, frame: SheetFrame, supersample: number): void => {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const image = context.createImageData(width, height);
  rasterizeSheet(frame.ops, frame.ground, frame.palette, { width, height, supersample, ghost: frame.ghost }, image.data);
  context.putImageData(image, 0, 0);
};
