import { INPUT, TIMING } from '../../shared/config.ts';
import type { SheetPoint } from '../../shared/game/session.ts';
import { seamSegment } from '../../shared/puzzle/evidence.ts';
import { strokeOp } from '../../shared/puzzle/moves.ts';
import type { SheetSpec } from '../../shared/puzzle/sheet.ts';
import { ease, type Animator } from '../lib/animator.ts';

/** Points along the ghost finger's path. */
const DEMO_POINTS = 28;
/** Radius (cells) of the ghost finger's circle around a swirl's eye. */
const DEMO_CIRCLE_RADIUS = 1.6;
/** How far (cells) the ghost finger swipes along a fold. */
const DEMO_SWIPE_LENGTH = INPUT.minSwipeLength + 2;

/**
 * The drag that undoes the top of `remaining` moves, as a finger would draw
 * it (folds and swirls only: a drop is a plain tap and needs no showing).
 */
export const demoPath = (spec: SheetSpec, remaining: number): SheetPoint[] | null => {
  const index = remaining - 1;
  const top = spec.moves[index];
  if (top?.kind === 'stroke') {
    const op = strokeOp(top, index);
    const segment = seamSegment(op);
    if (!segment) return null;
    const mid = { x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2 };
    const half = DEMO_SWIPE_LENGTH / 2;
    // Against the fold's point: from ahead of it, back past it.
    return Array.from({ length: DEMO_POINTS }, (_, i) => {
      const t = half - (2 * half * i) / (DEMO_POINTS - 1);
      return { x: mid.x + op.ux * t, y: mid.y + op.uy * t };
    });
  }
  if (top?.kind === 'swirl') {
    // Against the turn, most of the way round the eye.
    const sweep = -top.turn * Math.PI * 1.4;
    return Array.from({ length: DEMO_POINTS }, (_, i) => {
      const a = -Math.PI / 2 + (sweep * i) / (DEMO_POINTS - 1);
      return { x: top.x + DEMO_CIRCLE_RADIUS * Math.cos(a), y: top.y + DEMO_CIRCLE_RADIUS * Math.sin(a) };
    });
  }
  return null;
};

export type GhostFingerHost = {
  readonly animator: Animator;
  readonly reducedMotion: () => boolean;
  /** False once this demo must stop (the player touched the sheet, or it went away). */
  readonly alive: () => boolean;
  /** Draws the trail the finger has left so far (empty to clear it). */
  readonly show: (trail: SheetPoint[]) => void;
};

/**
 * Draws a gesture with a ghost finger, over and over, while the host keeps it
 * alive. With reduced motion, the whole gesture is drawn once and stays (a
 * loop of instant tweens would never yield).
 */
export const playGhostFinger = async (path: readonly SheetPoint[], host: GhostFingerHost): Promise<void> => {
  const { animator, alive, show } = host;
  if (host.reducedMotion()) {
    show([...path]);
    return;
  }
  while (alive()) {
    await animator.play({
      duration: TIMING.demoStrokeMs,
      easing: ease.inOutCubic,
      update: (t) => {
        if (alive()) show(path.slice(0, Math.max(2, Math.round(t * path.length))));
      },
    });
    if (!alive()) break;
    await animator.wait(TIMING.demoRestMs);
    if (!alive()) break;
    show([]);
    await animator.wait(TIMING.demoRestMs / 2);
  }
};
