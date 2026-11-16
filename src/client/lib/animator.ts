/** Easing curves, all mapping [0, 1] → [0, 1]. */
export const ease = Object.freeze({
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  /** Ink settling into water: quick, then a long soft tail. */
  settle: (t: number) => 1 - (1 - t) ** 4 * Math.cos(t * Math.PI * 0.5),
});

export type Easing = (t: number) => number;

export type Tween = {
  readonly duration: number;
  readonly easing?: Easing;
  readonly update: (progress: number) => void;
};

type Running = { tween: Tween; start: number; resolve: () => void };

/**
 * Drives tweens on animation frames and calls `onFrame` after each update so
 * the owner can redraw once per frame. Respects reduced motion by finishing
 * tweens instantly.
 */
export class Animator {
  readonly #running = new Set<Running>();
  readonly #onFrame: () => void;
  readonly #reducedMotion: () => boolean;
  #handle: number | null = null;

  constructor(onFrame: () => void, reducedMotion: () => boolean) {
    this.#onFrame = onFrame;
    this.#reducedMotion = reducedMotion;
  }

  get busy(): boolean {
    return this.#running.size > 0;
  }

  play(tween: Tween): Promise<void> {
    if (this.#reducedMotion() || tween.duration <= 0) {
      tween.update(1);
      this.#onFrame();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#running.add({ tween, start: performance.now(), resolve });
      this.#schedule();
    });
  }

  /** Plays tweens one after another. */
  async sequence(tweens: readonly Tween[]): Promise<void> {
    for (const tween of tweens) await this.play(tween);
  }

  wait(ms: number): Promise<void> {
    return this.play({ duration: ms, update: () => undefined });
  }

  cancelAll(): void {
    for (const running of this.#running) {
      running.tween.update(1);
      running.resolve();
    }
    this.#running.clear();
    if (this.#handle !== null) cancelAnimationFrame(this.#handle);
    this.#handle = null;
    this.#onFrame();
  }

  #schedule(): void {
    if (this.#handle === null) this.#handle = requestAnimationFrame(this.#tick);
  }

  readonly #tick = (now: number): void => {
    this.#handle = null;
    for (const running of [...this.#running]) {
      const { tween, start } = running;
      const t = Math.min(1, (now - start) / tween.duration);
      tween.update((tween.easing ?? ease.linear)(t));
      if (t >= 1) {
        this.#running.delete(running);
        running.resolve();
      }
    }
    this.#onFrame();
    if (this.#running.size > 0) this.#schedule();
  };
}
