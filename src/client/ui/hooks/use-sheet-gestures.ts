import { useEffect, type RefObject } from 'react';
import { SHEET } from '../../../shared/config.ts';
import type { SheetPoint } from '../../../shared/game/session.ts';

export type SheetGestureHandlers = {
  readonly onTap: (point: SheetPoint) => void;
  /** A finished drag, as every point the finger passed through. */
  readonly onDrag: (path: readonly SheetPoint[]) => void;
  readonly onTrace: (points: readonly SheetPoint[]) => void;
};

/** Movement (CSS px) under which a press still counts as a tap. */
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 600;

/**
 * Pointer handling for the expanded sheet: taps and drags, in sheet cells.
 * One pointer at a time; a drag that turns into a tap or vice versa is
 * decided on release, never mid-gesture.
 */
export const useSheetGestures = (target: RefObject<HTMLElement | null>, handlers: SheetGestureHandlers): void => {
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    let active: {
      id: number;
      startedAt: number;
      points: SheetPoint[];
      startX: number;
      startY: number;
      /** Farthest the finger has been from where it started (CSS px). */
      excursion: number;
    } | null = null;

    const toSheet = (event: PointerEvent): SheetPoint => {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.min(SHEET.cols, Math.max(0, ((event.clientX - rect.left) / rect.width) * SHEET.cols)),
        y: Math.min(SHEET.rows, Math.max(0, ((event.clientY - rect.top) / rect.height) * SHEET.rows)),
      };
    };

    const down = (event: PointerEvent): void => {
      if (active || !event.isPrimary) return;
      element.setPointerCapture(event.pointerId);
      active = {
        id: event.pointerId,
        startedAt: performance.now(),
        points: [toSheet(event)],
        startX: event.clientX,
        startY: event.clientY,
        excursion: 0,
      };
    };

    const move = (event: PointerEvent): void => {
      if (!active || event.pointerId !== active.id) return;
      active.points.push(toSheet(event));
      active.excursion = Math.max(active.excursion, Math.hypot(event.clientX - active.startX, event.clientY - active.startY));
      if (active.excursion > TAP_SLOP_PX) handlers.onTrace(active.points);
    };

    const up = (event: PointerEvent): void => {
      if (!active || event.pointerId !== active.id) return;
      const gesture = active;
      active = null;
      const end = toSheet(event);
      // A circle ends where it began: judge a tap by the farthest excursion, not the end point.
      const moved = Math.max(gesture.excursion, Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY));
      const start = gesture.points[0] ?? end;
      if (moved <= TAP_SLOP_PX && performance.now() - gesture.startedAt <= TAP_MAX_MS) {
        handlers.onTrace([]);
        handlers.onTap(start);
      } else {
        handlers.onDrag([...gesture.points, end]);
      }
    };

    const cancel = (event: PointerEvent): void => {
      if (!active || event.pointerId !== active.id) return;
      active = null;
      handlers.onTrace([]);
    };

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', cancel);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', cancel);
    };
  }, [target, handlers]);
};
