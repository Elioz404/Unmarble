/**
 * Colour science used to author and verify palettes: sRGB ↔ linear, OKLab
 * distances, and colour-vision-deficiency simulation (Machado, Oliveira &
 * Fernandes 2009, severity 1.0). Lives in shared code so the palette tests,
 * the renderer and any tooling agree on the same maths.
 */

export type Rgb = readonly [number, number, number];

export type VisionMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export const VISION_MODES: readonly VisionMode[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];

const HEX = /^#?([0-9a-f]{6})$/i;

/** Parses `#rrggbb` into sRGB components in [0, 1]. */
export const parseHex = (hex: string): Rgb => {
  const match = HEX.exec(hex);
  if (!match?.[1]) throw new TypeError(`Invalid colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const toLinearChannel = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

export const srgbToLinear = (rgb: Rgb): Rgb => [
  toLinearChannel(rgb[0]),
  toLinearChannel(rgb[1]),
  toLinearChannel(rgb[2]),
];

const CVD_MATRICES: Record<Exclude<VisionMode, 'normal'>, readonly number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Simulates how a linear-RGB colour appears under a vision mode. */
export const simulateVision = (linear: Rgb, mode: VisionMode): Rgb => {
  if (mode === 'normal') return linear;
  const m = CVD_MATRICES[mode];
  const [r, g, b] = linear;
  const at = (i: number): number => m[i] ?? 0;
  return [
    clamp01(at(0) * r + at(1) * g + at(2) * b),
    clamp01(at(3) * r + at(4) * g + at(5) * b),
    clamp01(at(6) * r + at(7) * g + at(8) * b),
  ];
};

export type Oklab = readonly [number, number, number];

export const linearToOklab = ([r, g, b]: Rgb): Oklab => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/** Perceptual distance (ΔE in OKLab) between two hex colours under a vision mode. */
export const colorDistance = (a: string, b: string, mode: VisionMode = 'normal'): number => {
  const la = linearToOklab(simulateVision(srgbToLinear(parseHex(a)), mode));
  const lb = linearToOklab(simulateVision(srgbToLinear(parseHex(b)), mode));
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
};

/** Perceived lightness (OKLab L) of a hex colour. */
export const lightness = (hex: string): number => linearToOklab(srgbToLinear(parseHex(hex)))[0];

/** OKLCH triple: lightness 0–1, chroma ≥ 0, hue in degrees. */
export type Oklch = readonly [number, number, number];

const oklabToLinear = ([L, a, b]: Oklab): Rgb => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};

const oklchToLinear = ([l, c, h]: Oklch): Rgb => {
  const rad = (h * Math.PI) / 180;
  return oklabToLinear([l, c * Math.cos(rad), c * Math.sin(rad)]);
};

const inGamut = (rgb: Rgb): boolean => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

const fromLinearChannel = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/**
 * Converts OKLCH to `#rrggbb`, preserving lightness and hue and reducing
 * chroma just enough to land inside the sRGB gamut.
 */
export const oklchToHex = (color: Oklch): string => {
  const [l, c, h] = color;
  let low = 0;
  let high = c;
  let rgb = oklchToLinear([l, c, h]);
  if (!inGamut(rgb)) {
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear([l, mid, h]))) low = mid;
      else high = mid;
    }
    rgb = oklchToLinear([l, low, h]);
  }
  const channel = (v: number): string =>
    Math.round(clamp01(fromLinearChannel(clamp01(v))) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`.toUpperCase();
};
