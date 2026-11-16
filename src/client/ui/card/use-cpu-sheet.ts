import { useEffect, type RefObject } from 'react';
import { EDGE_SAMPLES } from '../../../shared/render/rasterize.ts';
import { whenIdle } from '../../render/idle.ts';
import { paintStaticSheet } from '../../render/paint-static.ts';
import type { SheetFrame } from '../../render/renderer.ts';

/**
 * Paints a sheet on the CPU, fast first: every pixel centre now, then only
 * the edges resampled when the browser is idle. Used on the feed, where a
 * WebGL context per post would be wasteful.
 *
 * The canvas is sized by CSS (container units), which may only resolve after
 * the first layout, and the feed can change width (rotation, split views):
 * the sheet is painted whenever its laid-out size changes, never at size 0.
 */
export const useCpuSheet = (canvas: RefObject<HTMLCanvasElement | null>, frame: SheetFrame | null): void => {
  useEffect(() => {
    const target = canvas.current;
    if (!target || !frame) return;
    let cancelRefine: (() => void) | null = null;
    let painted = { width: 0, height: 0 };

    const paint = (): void => {
      const width = target.clientWidth;
      const height = target.clientHeight;
      if (width === 0 || height === 0 || (width === painted.width && height === painted.height)) return;
      painted = { width, height };
      cancelRefine?.();
      const refine = paintStaticSheet(target, frame, EDGE_SAMPLES.still);
      cancelRefine = refine ? whenIdle(refine) : null;
    };

    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(target);
    return () => {
      observer.disconnect();
      cancelRefine?.();
    };
  }, [canvas, frame]);
};
