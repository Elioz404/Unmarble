import { useEffect, useMemo, useRef } from 'react';
import type { GameController } from '../../game/controller.ts';
import { OverlayPainter } from '../../game/overlay.ts';
import { createInteractiveSurface, type SheetSurface } from '../../render/create-renderer.ts';
import { useSheetGestures } from '../hooks/use-sheet-gestures.ts';
import { prefersReducedMotion, useStore } from '../hooks/use-store.ts';
import './sheet-stage.css';

const TEAR_JOLT: Keyframe[] = [
  { transform: 'translate(0, 0) rotate(0deg)' },
  { transform: 'translate(-3px, 1px) rotate(-0.4deg)' },
  { transform: 'translate(2px, -1px) rotate(0.3deg)' },
  { transform: 'translate(-1px, 0) rotate(-0.1deg)' },
  { transform: 'translate(0, 0) rotate(0deg)' },
];

/** Device-pixel ceiling: beyond this the shader costs battery for no visible gain. */
const MAX_PIXEL_RATIO = 2.5;

type Props = {
  readonly controller: GameController;
  readonly label: string;
};

/**
 * The marbling tray: the sheet floating on water, with its drawing surfaces
 * and gesture input. All game logic lives in the controller.
 */
export const SheetStage = ({ controller, label }: Props) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const view = useStore(controller.view);

  useEffect(() => {
    const overlay = overlayRef.current;
    const sheet = sheetRef.current;
    if (!overlay || !sheet) return;
    let surface = createInteractiveSurface('tray__canvas');
    let size: { width: number; height: number } | null = null;
    let disposed = false;

    const mount = (next: SheetSurface): void => {
      surface = next;
      sheet.prepend(next.canvas);
      // Mobile GPUs can drop the context at any time; fall back to the CPU and keep going.
      next.canvas.addEventListener('webglcontextlost', onContextLost, { once: true });
      controller.attach(next.renderer, painter);
      if (size) controller.resize(size.width, size.height);
    };
    const onContextLost = (event: Event): void => {
      if (disposed) return;
      event.preventDefault();
      surface.canvas.remove();
      mount(createInteractiveSurface('tray__canvas', true));
    };

    const painter = new OverlayPainter(overlay);
    mount(surface);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const width = Math.round(entry.contentRect.width * ratio);
      const height = Math.round(entry.contentRect.height * ratio);
      if (width === 0 || height === 0) return;
      size = { width, height };
      controller.resize(width, height);
    });
    observer.observe(sheet);
    return () => {
      disposed = true;
      observer.disconnect();
      controller.detach();
      surface.renderer.dispose();
      surface.canvas.remove();
    };
  }, [controller]);

  const handlers = useMemo(
    () => ({
      onTap: controller.tap.bind(controller),
      onSwipe: controller.swipe.bind(controller),
      onTrace: controller.trace.bind(controller),
    }),
    [controller],
  );
  useSheetGestures(sheetRef, handlers);

  const lastBlot = view.feedback?.kind === 'blot' ? view.feedback.id : null;
  useEffect(() => {
    if (lastBlot === null || prefersReducedMotion()) return;
    // A tear jolts the paper on the water; Web Animations restart cleanly per blot.
    sheetRef.current?.animate(TEAR_JOLT, { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
  }, [lastBlot]);
  const state =
    view.settled && view.status === 'clean' ? 'lifted' : view.status === 'torn' && view.settled ? 'torn' : 'floating';

  return (
    <div className="stage">
      <div className="tray">
        <div ref={sheetRef} className="tray__sheet" data-state={state} role="img" aria-label={label}>
          <canvas ref={overlayRef} className="tray__overlay" />
        </div>
      </div>
    </div>
  );
};
