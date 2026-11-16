/**
 * Renders the app icon with the game's own marbling engine: a crop of a real
 * sheet, the game's idea in one look. The round red drop fell last; the blue
 * one under it was pushed into a crescent.
 *
 *   npm run icon            → assets/icon.png (1024 × 1024, the size Devvit asks for)
 *   npm run icon -- 64      → also writes assets/icon-64.png, to check it small
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHEET } from '../src/shared/config.ts';
import { opsForPrefix, type Move } from '../src/shared/puzzle/moves.ts';
import { rasterizeSheet } from '../src/shared/render/rasterize.ts';
import { shadingPaletteOf } from '../src/shared/render/shading.ts';
import type { Ground } from '../src/shared/sheet/ground.ts';
import { getPalette } from '../src/shared/sheet/palettes.ts';
import { encodePng } from './png.ts';

/** The icon's sheet: hand-composed, like the lessons. */
const ICON = Object.freeze({
  paletteId: 'cinnabar',
  ground: { family: 'bands', period: 1.15, angle: 0, amplitude: 0, wavelength: 6 } satisfies Ground,
  moves: [
    { kind: 'drop', x: 4.6, y: 9.2, size: 'L', ink: 0 },
    { kind: 'drop', x: 7.4, y: 6.9, size: 'L', ink: 1 },
  ] satisfies Move[],
  /** Anti-aliasing samples per pixel, per axis. */
  supersample: 3,
});

/** Devvit's requirement for marketing icons. */
const DEVVIT_ICON = Object.freeze({ size: 1024, maxBytes: 500 * 1024 });

/** A square crop from the middle of the (portrait) sheet, `size` pixels wide. */
const renderSquare = (size: number): Uint8ClampedArray => {
  const fullHeight = Math.round((size * SHEET.rows) / SHEET.cols);
  const top = Math.round((fullHeight - size) / 2);
  const sheet = rasterizeSheet(
    opsForPrefix(ICON.moves, ICON.moves.length),
    ICON.ground,
    shadingPaletteOf(getPalette(ICON.paletteId)),
    { width: size, height: fullHeight, supersample: ICON.supersample, ghost: 0, rows: [top, top + size] },
  );
  return sheet.slice(top * size * 4, (top + size) * size * 4);
};

const outDir = join(process.cwd(), 'assets');
mkdirSync(outDir, { recursive: true });

const icon = encodePng(DEVVIT_ICON.size, DEVVIT_ICON.size, renderSquare(DEVVIT_ICON.size));
if (icon.length > DEVVIT_ICON.maxBytes) {
  throw new Error(`The icon is ${icon.length} bytes; Devvit accepts at most ${DEVVIT_ICON.maxBytes}.`);
}
writeFileSync(join(outDir, 'icon.png'), icon);
console.log(`assets/icon.png  ${DEVVIT_ICON.size}×${DEVVIT_ICON.size}  ${Math.round(icon.length / 1024)} KB`);

const preview = Number(process.argv[2]);
if (Number.isInteger(preview) && preview > 0) {
  writeFileSync(join(outDir, `icon-${preview}.png`), encodePng(preview, preview, renderSquare(preview)));
  console.log(`assets/icon-${preview}.png  ${preview}×${preview}`);
}
