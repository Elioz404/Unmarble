/**
 * True small caps where the book face ships them. A subset may drop the
 * `smcp` glyphs; then the feature changes nothing, and the labels keep the
 * uppercase-and-tracking fallback in base.css.
 */

/** Lowercase only: `smcp` replaces exactly these, so any change in width means the glyphs exist. */
const PROBE_TEXT = 'small caps probe';

const probeWidth = (features: string): number => {
  const span = document.createElement('span');
  span.textContent = PROBE_TEXT;
  span.setAttribute('aria-hidden', 'true');
  // Offscreen and unsynthesised, so a browser-faked small cap never reads as the real thing.
  span.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;font-family:var(--font-book);font-feature-settings:${features};font-synthesis:none`;
  document.body.append(span);
  const width = span.getBoundingClientRect().width;
  span.remove();
  return width;
};

const probe = (): void => {
  const face = getComputedStyle(document.documentElement).getPropertyValue('--font-book');
  document.fonts
    .load(`1em ${face}`, PROBE_TEXT)
    .then(() => {
      if (probeWidth("'smcp' 1") !== probeWidth('normal')) document.documentElement.dataset.smcp = '';
    })
    // No face, no small caps: the uppercase fallback stands.
    .catch(() => undefined);
};

/**
 * Sets `html[data-smcp]` once the book face has loaded, if it has real small
 * caps. Waits for the page's stylesheets, which name the face (`--font-book`).
 */
export const probeSmallCaps = (): void => {
  if (document.readyState === 'complete') probe();
  else window.addEventListener('load', probe, { once: true });
};
