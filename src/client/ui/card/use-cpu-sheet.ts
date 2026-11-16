import { useEffect, type RefObject } from 'react';
import { EDGE_SAMPLES } from '../../../shared/render/rasterize.ts';
import { whenIdle } from '../../render/idle.ts';
import { paintStaticSheet } from '../../render/paint-static.ts';
import type { SheetFrame } from '../../render/renderer.ts';

/**
 * Paints a sheet on the CPU, fast first: every pixel centre now, then only
 * the edges resampled when the browser is idle. Used on the feed, where a
 * WebGL context per post would be wasteful.
 */
export const useCpuSheet = (canvas: RefObject<HTMLCanvasElement | null>, frame: SheetFrame | null): void => {
  useEffect(() => {
    const target = canvas.current;
    if (!target || !frame) return;
    const refine = paintStaticSheet(target, frame, EDGE_SAMPLES.still);
    if (!refine) return;
    return whenIdle(refine);
  }, [canvas, frame]);
};
