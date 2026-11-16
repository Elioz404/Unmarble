import type { SheetSpec } from './sheet.ts';

/**
 * Hand-made teaching sheets, played once before the first daily sheet. Each
 * one introduces exactly one reading, and each is held to the same fairness
 * contract as generated sheets (see `tutorial.test.ts`).
 */
export type Lesson = {
  readonly id: string;
  /** One line, shown above the sheet. */
  readonly prompt: string;
  readonly spec: SheetSpec;
};

const GROUND = { family: 'bands', period: 1.3, angle: 0, amplitude: 0, wavelength: 6 } as const;

export const LESSONS: readonly Lesson[] = [
  {
    id: 'one-drop',
    prompt: 'Tap the drop to draw it back into the water.',
    spec: {
      paletteId: 'harbor-cobalt',
      ground: GROUND,
      stars: 1,
      moves: [{ kind: 'drop', x: 6, y: 8, size: 'L', ink: 0 }],
    },
  },
  {
    id: 'round-is-last',
    prompt: 'The perfectly round drop fell last. Undo it first.',
    spec: {
      paletteId: 'harbor-cobalt',
      ground: GROUND,
      stars: 1,
      moves: [
        { kind: 'drop', x: 5, y: 8.5, size: 'L', ink: 0 },
        { kind: 'drop', x: 8, y: 7, size: 'M', ink: 3 },
      ],
    },
  },
  {
    id: 'seam',
    prompt: 'Nothing round? A stroke bent the water. Drag along the fold, against its point.',
    spec: {
      paletteId: 'harbor-cobalt',
      ground: GROUND,
      stars: 1,
      moves: [
        { kind: 'drop', x: 6, y: 8, size: 'L', ink: 1 },
        { kind: 'stroke', x: 6, y: 8, heading: 90 },
      ],
    },
  },
];
