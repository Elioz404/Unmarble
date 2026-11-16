import { useEffect, type RefObject } from 'react';
import { paintStaticSheet } from '../../render/paint-static.ts';
import type { SheetFrame } from '../../render/renderer.ts';

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };

/**
 * Paints a sheet on the CPU, fast first: a quick pass now, an anti-aliased
 * pass when the browser is idle. Used on the feed, where a WebGL context per
 * post would be wasteful.
 */
export const useCpuSheet = (canvas: RefObject<HTMLCanvasElement | null>, frame: SheetFrame | null): void => {
  useEffect(() => {
    const target = canvas.current;
    if (!target || !frame) return;
    const idle: IdleWindow = window;
    paintStaticSheet(target, frame, 1);
    const refine = (): void => paintStaticSheet(target, frame, 2);
    if (idle.requestIdleCallback && idle.cancelIdleCallback) {
      const handle = idle.requestIdleCallback(refine);
      const cancel = idle.cancelIdleCallback;
      return () => cancel(handle);
    }
    const handle = window.setTimeout(refine, 60);
    return () => window.clearTimeout(handle);
  }, [canvas, frame]);
};
