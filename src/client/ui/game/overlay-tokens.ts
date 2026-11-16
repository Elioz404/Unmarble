import type { OverlayColors } from '../../game/overlay.ts';

/** The overlay's colours but the paper, which comes from the sheet's own palette. */
export type OverlayTokens = Omit<OverlayColors, 'paper'>;

const DARK = '(prefers-color-scheme: dark)';

let cached: OverlayTokens | null = null;

/**
 * The `overlay marks` tokens from tokens.css, read once per theme: overlays
 * repaint on every animation frame, where a computed-style read could force a
 * style recalculation each time.
 */
export const overlayTokens = (): OverlayTokens => {
  if (cached) return cached;
  const style = getComputedStyle(document.documentElement);
  const token = (name: keyof OverlayTokens): string => style.getPropertyValue(`--overlay-${name}`).trim();
  const tokens: OverlayTokens = {
    ink: token('ink'),
    water: token('water'),
    shade: token('shade'),
    accent: token('accent'),
    blot: token('blot'),
  };
  // Until the stylesheet has loaded the tokens are empty: read them again next time.
  if (tokens.water) {
    cached = tokens;
    window.matchMedia(DARK).addEventListener('change', () => (cached = null), { once: true });
  }
  return tokens;
};
