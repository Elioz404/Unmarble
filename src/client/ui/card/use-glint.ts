import { useEffect, useState, type RefObject } from 'react';
import { prefersReducedMotion } from '../hooks/use-store.ts';

type GlintState = 'waiting' | 'on' | 'done';

/** Share of the sheet that must be on screen: the glint is for a reader, not a passer-by. */
const GLINT_THRESHOLD = 0.6;
/** The inline webview can report the card as visible at load; only a card that stays in view earns the glint. */
const GLINT_DELAY_MS = 400;

/**
 * One wet glint across the feed sheet, the first time it is really seen, and
 * never again. Returns 'on' while it should play; the caller reports the end
 * with `finish`, which retires it for good. Reduced motion never plays it.
 */
export const useGlintOnce = (target: RefObject<HTMLElement | null>): { readonly state: GlintState; readonly finish: () => void } => {
  const [state, setState] = useState<GlintState>('waiting');

  useEffect(() => {
    const element = target.current;
    if (!element || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    let inView = false;
    let timer: number | undefined;
    const arm = (): void => {
      window.clearTimeout(timer);
      if (!inView || document.visibilityState !== 'visible') return;
      timer = window.setTimeout(() => {
        stop();
        setState('on');
      }, GLINT_DELAY_MS);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        inView = entry !== undefined && entry.intersectionRatio >= GLINT_THRESHOLD;
        arm();
      },
      { threshold: GLINT_THRESHOLD },
    );
    const stop = (): void => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', arm);
    };
    observer.observe(element);
    document.addEventListener('visibilitychange', arm);
    return stop;
  }, [target]);

  return { state, finish: () => setState('done') };
};
