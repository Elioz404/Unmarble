/**
 * Renders the bath's caustics: the faint light filaments a lamp throws through
 * rippled size-water. One seamless tile, drawn once, drifted slowly by CSS.
 *
 *   node --experimental-strip-types tools/render-caustics.ts
 *                → src/client/ui/game/bath-caustics.png (256 × 256)
 *
 * Each octave is a smooth random field built only from whole-number waves
 * over the unit square (so the tile wraps exactly), seen through |sin| so its
 * level lines become ridges. The PNG is pale light with the filaments in its
 * alpha: laid over the water at a low opacity it brightens with no blend mode.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.ts';

const CAUSTICS = Object.freeze({
  size: 256,
  /** Fixed, so the tile is the same on every run. */
  seed: 0x5eed_ba7e,
  /** Waves summed per octave field: enough to look random, few enough to stay smooth. */
  waves: 9,
  /** Octaves, coarse to fine: wave number (cycles per tile) and weight. */
  octaves: [
    { cycles: 2, weight: 1 },
    { cycles: 4, weight: 0.55 },
    { cycles: 6, weight: 0.3 },
  ],
  /** Field swing in radians: about two level lines per blob, so ridges mesh instead of nesting. */
  swing: 1.6,
  /** Domain warp (tile units): bends the ridges like light through a moving surface. */
  warp: 0.09,
  /** Ridge sharpness: pow(1 − |sin|, n). Higher is thinner filaments. */
  sharpness: 6,
  /** Brightening so the strongest filaments reach full alpha. */
  gain: 1.9,
  /** Lamp-warmed water light (sRGB). */
  light: [236, 246, 244] as const,
});

/** Mulberry32: a tiny deterministic generator, good enough for wave phases. */
const random = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Wave = { readonly kx: number; readonly ky: number; readonly phase: number };

/** Whole-number wave vectors of about `cycles` cycles per tile, in random directions. */
const wavesOf = (next: () => number, cycles: number): Wave[] =>
  Array.from({ length: CAUSTICS.waves }, () => {
    const angle = next() * 2 * Math.PI;
    const kx = Math.round(Math.cos(angle) * cycles);
    const ky = Math.round(Math.sin(angle) * cycles);
    // A zero vector would be a constant, not a wave.
    return { kx: kx === 0 && ky === 0 ? 1 : kx, ky, phase: next() * 2 * Math.PI };
  });

/** A zero-mean field with unit amplitude per wave count, periodic on the unit square. */
const field = (waves: readonly Wave[], u: number, v: number): number => {
  let sum = 0;
  for (const w of waves) sum += Math.cos(2 * Math.PI * (w.kx * u + w.ky * v) + w.phase);
  return sum / Math.sqrt(waves.length);
};

const render = (): Uint8ClampedArray => {
  const next = random(CAUSTICS.seed);
  const warpX = wavesOf(next, CAUSTICS.octaves[0]?.cycles ?? 2);
  const warpY = wavesOf(next, CAUSTICS.octaves[0]?.cycles ?? 2);
  const octaves = CAUSTICS.octaves.map((o) => ({ ...o, waves: wavesOf(next, o.cycles) }));
  const totalWeight = octaves.reduce((sum, o) => sum + o.weight, 0);
  const { size, light } = CAUSTICS;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u0 = x / size;
      const v0 = y / size;
      const u = u0 + CAUSTICS.warp * field(warpX, u0, v0);
      const v = v0 + CAUSTICS.warp * field(warpY, u0, v0);
      let filaments = 0;
      for (const o of octaves) {
        const ridge = 1 - Math.abs(Math.sin(CAUSTICS.swing * field(o.waves, u, v)));
        filaments += o.weight * ridge ** CAUSTICS.sharpness;
      }
      const i = (y * size + x) * 4;
      rgba[i] = light[0];
      rgba[i + 1] = light[1];
      rgba[i + 2] = light[2];
      rgba[i + 3] = Math.round(255 * Math.min(1, (CAUSTICS.gain * filaments) / totalWeight));
    }
  }
  return rgba;
};

const out = join(process.cwd(), 'src/client/ui/game/bath-caustics.png');
const png = encodePng(CAUSTICS.size, CAUSTICS.size, render());
writeFileSync(out, png);
console.log(`src/client/ui/game/bath-caustics.png  ${CAUSTICS.size}×${CAUSTICS.size}  ${Math.round(png.length / 1024)} KB`);
