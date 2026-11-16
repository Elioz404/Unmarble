/**
 * Developer tool: generates the sheets for a range of days (on the preview
 * calendar, whose seed is public), prints the recipe of each and how it
 * reads (fairness margin, naive-bot failures, generation effort) and writes
 * PNG previews of every solving step to `previews/`.
 *
 *   npm run sheets -- 2026-11-25 7
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSheet } from '../src/shared/puzzle/generator.ts';
import { opsForPrefix } from '../src/shared/puzzle/moves.ts';
import { recipeForDay } from '../src/shared/puzzle/calendar-recipes.ts';
import type { SheetSpec } from '../src/shared/puzzle/sheet.ts';
import { templateForWeekday } from '../src/shared/puzzle/templates.ts';
import { rasterizeSheet } from '../src/shared/render/rasterize.ts';
import { shadingPaletteOf } from '../src/shared/render/shading.ts';
import { getPalette } from '../src/shared/sheet/palettes.ts';
import { addDays, paletteIdForDay, sheetNumberOf, weekdayNameOf, weekdayOf } from '../src/shared/time/calendar.ts';
import { encodePng } from './png.ts';

const [startArg, daysArg] = process.argv.slice(2);
const start = startArg ?? '2026-11-25';
const days = Number(daysArg ?? 7);
const outDir = join(process.cwd(), 'previews');
const WIDTH = 360;
const HEIGHT = 480;
const GAP = 12;
const PREVIEW_CALENDAR = 'preview:calendar';

/** One strip per sheet: the finished sheet first, then each step back to bare ground. */
const renderStrip = (spec: SheetSpec): Buffer => {
  const palette = shadingPaletteOf(getPalette(spec.paletteId));
  const frames = spec.moves.length + 1;
  const stripWidth = frames * WIDTH + (frames - 1) * GAP;
  const strip = new Uint8ClampedArray(stripWidth * HEIGHT * 4).fill(40);
  for (let f = 0; f < frames; f++) {
    const prefix = spec.moves.length - f;
    const frame = rasterizeSheet(opsForPrefix(spec.moves, prefix), spec.ground, palette, {
      width: WIDTH,
      height: HEIGHT,
      supersample: 2,
    });
    const x0 = f * (WIDTH + GAP);
    for (let y = 0; y < HEIGHT; y++) {
      strip.set(frame.subarray(y * WIDTH * 4, (y + 1) * WIDTH * 4), (y * stripWidth + x0) * 4);
    }
  }
  return encodePng(stripWidth, HEIGHT, strip);
};

mkdirSync(outDir, { recursive: true });
for (let d = 0; d < days; d++) {
  const key = addDays(start, d);
  // Before the first calendar version, a day still has its weekly template.
  const recipe = recipeForDay(PREVIEW_CALENDAR, key) ?? templateForWeekday(weekdayOf(key));
  const number = sheetNumberOf(key, start);
  const began = performance.now();
  try {
    const { spec, reading, attempts } = generateSheet(`preview:${key}`, recipe, paletteIdForDay(key));
    const ms = Math.round(performance.now() - began);
    const kinds = spec.moves
      .map((m) => (m.kind === 'drop' ? `${m.size}${m.ink}` : m.kind === 'stroke' ? `~${m.heading}` : m.turn > 0 ? '@+' : '@-'))
      .join(' ');
    console.log(
      `${key} No.${String(number).padStart(3)} ${weekdayNameOf(key).slice(0, 3)} ${recipe.id.padEnd(18)} ${'★'.repeat(spec.stars).padEnd(5)} ` +
        `${spec.ground.family.padEnd(7)} ${spec.paletteId.padEnd(14)} margin ${reading.margin.toFixed(2).padStart(5)} ` +
        `naive✗ ${reading.naiveFailures} tries ${String(attempts).padStart(4)} ${String(ms).padStart(5)}ms  ${kinds}`,
    );
    writeFileSync(join(outDir, `${key}-${recipe.id}.png`), renderStrip(spec));
  } catch (error) {
    console.log(`${key} ${recipe.id}: ${(error as Error).message}`);
  }
}
console.log(`Previews written to ${outDir}`);
