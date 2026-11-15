import { SHEET, VISIBILITY } from '../config.ts';
import { sampleField } from '../marbling/field.ts';
import { dropRadius, opsForPrefix, type Move } from './moves.ts';

/**
 * Coarse rasterisation of a sheet to check that every drop stays readable and
 * tappable at every step: enough of its ink remains on the paper, and some of
 * it is thick enough to land a finger on without ambiguity.
 */
export type InkVisibility = {
  readonly move: number;
  /** Share of the drop's original ink area that is still on the sheet. */
  readonly visibleShare: number;
  /** Whether a finger-sized disk fits fully inside this ink somewhere. */
  readonly tappable: boolean;
};

export type StepVisibility = {
  readonly prefix: number;
  readonly inks: readonly InkVisibility[];
  /** Share of the sheet covered by ink. */
  readonly coverage: number;
  /** Centre of mass of all ink, in cells (sheet centre when there is none). */
  readonly inkCentroid: { readonly x: number; readonly y: number };
};

export const measureVisibility = (moves: readonly Move[], prefix: number): StepVisibility => {
  const ops = opsForPrefix(moves, prefix);
  const density = VISIBILITY.rasterDensity;
  const width = SHEET.cols * density;
  const height = SHEET.rows * density;
  const owner = new Int16Array(width * height).fill(-1);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const sample = sampleField(ops, (i + 0.5) / density, (j + 0.5) / density);
      if (sample.kind === 'ink') owner[j * width + i] = sample.source;
    }
  }

  const cellArea = 1 / (density * density);
  const counts = new Map<number, number>();
  let inked = 0;
  let sumX = 0;
  let sumY = 0;
  owner.forEach((o, index) => {
    if (o < 0) return;
    inked++;
    sumX += ((index % width) + 0.5) / density;
    sumY += (Math.floor(index / width) + 0.5) / density;
    counts.set(o, (counts.get(o) ?? 0) + 1);
  });
  const inkCentroid =
    inked > 0 ? { x: sumX / inked, y: sumY / inked } : { x: SHEET.cols / 2, y: SHEET.rows / 2 };

  const coreRadius = Math.ceil(VISIBILITY.tapCoreRadius * density);
  const coreOffsets: number[] = [];
  for (let dy = -coreRadius; dy <= coreRadius; dy++) {
    for (let dx = -coreRadius; dx <= coreRadius; dx++) {
      if (dx * dx + dy * dy <= coreRadius * coreRadius) coreOffsets.push(dy * width + dx);
    }
  }
  const tappable = new Set<number>();
  for (let j = coreRadius; j < height - coreRadius; j++) {
    for (let i = coreRadius; i < width - coreRadius; i++) {
      const o = owner[j * width + i] as number;
      if (o < 0 || tappable.has(o)) continue;
      const index = j * width + i;
      if (coreOffsets.every((offset) => owner[index + offset] === o)) tappable.add(o);
    }
  }

  const inks: InkVisibility[] = [];
  moves.slice(0, prefix).forEach((move, index) => {
    if (move.kind !== 'drop') return;
    const r = dropRadius(move.size);
    const area = Math.PI * r * r;
    inks.push({
      move: index,
      visibleShare: ((counts.get(index) ?? 0) * cellArea) / area,
      tappable: tappable.has(index),
    });
  });
  return { prefix, inks, coverage: inked / owner.length, inkCentroid };
};
