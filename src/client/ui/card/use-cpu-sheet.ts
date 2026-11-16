import { useEffect, type RefObject } from 'react';
import { EDGE_SAMPLES } from '../../../shared/render/rasterize.ts';
import { paintStaticSheet } from '../../render/paint-static.ts';
import type { SheetFrame } from '../../render/renderer.ts';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** The edges are refined this soon after the first paint even on a busy page, so the sheet never stays aliased. */
const REFINE_DEADLINE_MS = 300;
/** Without idle callbacks, refine just after the first paint has been shown. */
const REFINE_FALLBACK_MS = 60;

/**
 * Paints a sheet on the CPU, fast first: every pixel centre now, then only
 * the edges resampled when the browser is idle. Used on the feed, where a
 * WebGL context per post would be wasteful.
 */
export const useCpuSheet = (canvas: RefObject<HTMLCanvasElement | null>, frame: SheetFrame | null): void => {
  useEffect(() => {
    const target = canvas.current;
    if (!target || !frame) return;
    const idle: IdleWindow = window;
    const refine = paintStaticSheet(target, frame, EDGE_SAMPLES.still);
    if (!refine) return;
    if (idle.requestIdleCallback && idle.cancelIdleCallback) {
      const handle = idle.requestIdleCallback(refine, { timeout: REFINE_DEADLINE_MS });
      const cancel = idle.cancelIdleCallback;
      return () => cancel(handle);
    }
    const handle = window.setTimeout(refine, REFINE_FALLBACK_MS);
    return () => window.clearTimeout(handle);
  }, [canvas, frame]);
};
