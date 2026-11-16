import { useEffect, type RefObject } from 'react';
import { opsForPrefix } from '../../../shared/puzzle/moves.ts';
import type { SheetSpec } from '../../../shared/puzzle/sheet.ts';
import { createAdaptiveRaster, EDGE_SAMPLES, rasterizeAdaptive } from '../../../shared/render/rasterize.ts';
import { shadingPaletteOf } from '../../../shared/render/shading.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';

/** A thumbnail's CSS size (px), matching `.book__thumb`. */
const THUMB = Object.freeze({ width: 48, height: 64 });
/** Pixel-ratio ceiling: crisp on phones, and a quarter the work of a full preview. */
const MAX_RATIO = 2;

type Job = { readonly key: string; readonly canvas: HTMLCanvasElement; readonly spec: SheetSpec; cancelled: boolean };

/** Rendered thumbnails by sheet and pixel size; a sheet's look never changes once published. */
const cache = new Map<string, ImageData>();
const queue: Job[] = [];
let scheduled = false;

const ratio = (): number => Math.min(window.devicePixelRatio || 1, MAX_RATIO);

const render = (spec: SheetSpec, width: number, height: number): ImageData => {
  const image = new ImageData(width, height);
  rasterizeAdaptive(
    createAdaptiveRaster(width, height),
    opsForPrefix(spec.moves, spec.moves.length),
    spec.ground,
    shadingPaletteOf(getPalette(spec.paletteId)),
    EDGE_SAMPLES.still,
    image.data,
  );
  return image;
};

const put = (canvas: HTMLCanvasElement, image: ImageData): void => {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d', { alpha: false })?.putImageData(image, 0, 0);
};

/** Paints one queued thumbnail per frame, so a long shelf never blocks the page. */
const drain = (): void => {
  scheduled = false;
  let job = queue.shift();
  while (job?.cancelled) job = queue.shift();
  if (!job) return;
  const cached = cache.get(job.key);
  const scale = ratio();
  const image = cached ?? render(job.spec, Math.round(THUMB.width * scale), Math.round(THUMB.height * scale));
  cache.set(job.key, image);
  put(job.canvas, image);
  if (queue.length > 0) schedule();
};

const schedule = (): void => {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(drain);
};

/**
 * Paints a sheet's finished state into a Book thumbnail: at once from the
 * cache, otherwise in turn with the others, one per frame.
 */
export const useThumbnail = (canvas: RefObject<HTMLCanvasElement | null>, sheetId: string, spec: SheetSpec): void => {
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const key = `${sheetId}@${ratio()}`;
    const cached = cache.get(key);
    if (cached) {
      put(target, cached);
      return;
    }
    const job: Job = { key, canvas: target, spec, cancelled: false };
    queue.push(job);
    schedule();
    return () => {
      job.cancelled = true;
    };
  }, [canvas, sheetId, spec]);
};
