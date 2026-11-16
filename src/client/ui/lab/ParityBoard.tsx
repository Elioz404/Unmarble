import { useEffect, useRef, useState } from 'react';
import { generateSheet } from '../../../shared/puzzle/generator.ts';
import { opsForPrefix } from '../../../shared/puzzle/moves.ts';
import type { SheetSpec } from '../../../shared/puzzle/sheet.ts';
import { RECIPES } from '../../../shared/puzzle/recipes.ts';
import { LESSONS } from '../../../shared/puzzle/tutorial.ts';
import { createAdaptiveRaster, EDGE_SAMPLES, rasterizeAdaptive, rasterizeSheet } from '../../../shared/render/rasterize.ts';
import { shadingPaletteOf } from '../../../shared/render/shading.ts';
import { getPalette, PALETTES } from '../../../shared/sheet/palettes.ts';
import type { SheetFrame } from '../../render/renderer.ts';
import { WebGlSheetRenderer } from '../../render/webgl/webgl-renderer.ts';
import './parity-board.css';

/** Drawing-buffer size of each comparison: a phone sheet at DPR 1. */
const SIZE = Object.freeze({ width: 360, height: 480 });
/** The parity budget: no channel may differ by more than this (sRGB bytes). */
const BUDGET = 3;
/** Differences are drawn this many times brighter, so a 1/255 miss is visible. */
const DIFF_GAIN = 40;
/** What the feed spent per pixel before edge-adaptive sampling: a quick centre pass, then a full 2 × 2 pass. */
const OLD_FEED_SAMPLES = 1 + 4;

type Specimen = { readonly name: string; readonly spec: SheetSpec };

type Comparison = {
  readonly name: string;
  readonly maxDiff: number;
  readonly overBudget: number;
  readonly cpuMs: number;
  /** Field samples per pixel the feed's edge-adaptive path takes on this sheet. */
  readonly feedSamples: number;
  readonly gpu: ImageData;
  readonly cpu: ImageData;
  readonly diff: ImageData;
};

const specimens = (): Specimen[] => {
  const lessons = LESSONS.map((lesson) => ({ name: `Lesson: ${lesson.id}`, spec: lesson.spec }));
  // One sheet per recipe, each on its own colourway.
  const recipes = RECIPES.map((recipe, i) => {
    const palette = PALETTES[i % PALETTES.length]?.id ?? 'harbor-cobalt';
    return { name: `${recipe.title} (${palette})`, spec: generateSheet(`parity:${recipe.id}`, recipe, palette).spec };
  });
  return [...lessons, ...recipes];
};

const frameOf = (spec: SheetSpec): SheetFrame => ({
  ops: opsForPrefix(spec.moves, spec.moves.length),
  ground: spec.ground,
  palette: shadingPaletteOf(getPalette(spec.paletteId)),
});

/** Renders on the GPU and reads the pixels back, top row first. */
const renderGpu = (frame: SheetFrame): ImageData => {
  const canvas = document.createElement('canvas');
  const renderer = new WebGlSheetRenderer(canvas);
  renderer.resize(SIZE.width, SIZE.height);
  renderer.render(frame);
  const gl = canvas.getContext('webgl2');
  const rows = new Uint8ClampedArray(SIZE.width * SIZE.height * 4);
  gl?.readPixels(0, 0, SIZE.width, SIZE.height, gl.RGBA, gl.UNSIGNED_BYTE, rows);
  renderer.dispose();
  const image = new ImageData(SIZE.width, SIZE.height);
  const stride = SIZE.width * 4;
  for (let y = 0; y < SIZE.height; y++) image.data.set(rows.subarray((SIZE.height - 1 - y) * stride, (SIZE.height - y) * stride), y * stride);
  return image;
};

const compare = ({ name, spec }: Specimen): Comparison => {
  const frame = frameOf(spec);
  const gpu = renderGpu(frame);
  const cpu = new ImageData(SIZE.width, SIZE.height);
  const began = performance.now();
  rasterizeSheet(frame.ops, frame.ground, frame.palette, { ...SIZE, supersample: 2 }, cpu.data);
  const cpuMs = performance.now() - began;
  const feed = createAdaptiveRaster(SIZE.width, SIZE.height);
  rasterizeAdaptive(feed, frame.ops, frame.ground, frame.palette, EDGE_SAMPLES.still, new Uint8ClampedArray(cpu.data.length));
  const feedSamples = feed.samples / (SIZE.width * SIZE.height);
  const diff = new ImageData(SIZE.width, SIZE.height);
  let maxDiff = 0;
  let overBudget = 0;
  for (let o = 0; o < cpu.data.length; o += 4) {
    let worst = 0;
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs((cpu.data[o + k] as number) - (gpu.data[o + k] as number)));
    maxDiff = Math.max(maxDiff, worst);
    if (worst > BUDGET) overBudget++;
    diff.data.set([worst * DIFF_GAIN, worst > BUDGET ? 0 : worst * DIFF_GAIN, worst > BUDGET ? 0 : worst * DIFF_GAIN, 255], o);
  }
  return { name, maxDiff, overBudget, cpuMs, feedSamples, gpu, cpu, diff };
};

const Picture = ({ image, label }: { readonly image: ImageData; readonly label: string }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')?.putImageData(image, 0, 0);
  }, [image]);
  return (
    <figure className="parity__picture">
      <canvas ref={ref} />
      <figcaption className="label">{label}</figcaption>
    </figure>
  );
};

/**
 * Lab-only check that the two renderers agree: every lesson and a sheet for
 * each weekday, drawn by the WebGL shader and by the CPU rasteriser at the
 * same size, with their largest per-channel difference.
 */
export const ParityBoard = () => {
  const [results, setResults] = useState<Comparison[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // After the first paint, so 'Rendering…' shows while the sheets are drawn.
    const handle = window.setTimeout(() => {
      try {
        setResults(specimens().map(compare));
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    });
    return () => window.clearTimeout(handle);
  }, []);

  if (error) return <main className="parity">{error}</main>;
  if (!results) return <main className="parity">Rendering…</main>;
  const worst = Math.max(...results.map((r) => r.maxDiff));
  const costliest = Math.max(...results.map((r) => r.feedSamples));
  return (
    <main className="parity">
      <p className="parity__verdict" data-pass={worst <= BUDGET}>
        Largest GPU/CPU difference: {worst}/255 (budget {BUDGET}/255)
      </p>
      <p className="parity__verdict" data-pass={costliest <= OLD_FEED_SAMPLES}>
        Costliest feed sheet: {costliest.toFixed(2)} samples per pixel (was {OLD_FEED_SAMPLES})
      </p>
      {results.map((r) => (
        <section key={r.name} className="parity__row">
          <h2 className="parity__name">
            {r.name}: max {r.maxDiff}/255, {r.overBudget} pixels over budget, CPU {r.cpuMs.toFixed(0)} ms, feed {r.feedSamples.toFixed(2)} samples/px
          </h2>
          <Picture image={r.gpu} label="WebGL" />
          <Picture image={r.cpu} label="CPU" />
          <Picture image={r.diff} label={`Difference ×${DIFF_GAIN}`} />
        </section>
      ))}
    </main>
  );
};
