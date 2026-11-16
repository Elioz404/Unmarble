import type { MoveKind } from './moves.ts';
import type { SheetSpec } from './sheet.ts';

/**
 * Hand-made teaching sheets. Each introduces exactly one reading of one form,
 * is played the first time that form appears in a player's sheet, and is held
 * to the same fairness contract as generated sheets (see `tutorial.test.ts`).
 */
export type Lesson = {
  readonly id: string;
  /** The form this lesson teaches; it is shown before the first sheet that has it. */
  readonly teaches: MoveKind;
  /** One line, shown above the sheet. */
  readonly prompt: string;
  readonly spec: SheetSpec;
};

const GROUND = { family: 'bands', period: 1.3, angle: 0, amplitude: 0, wavelength: 6 } as const;

export const LESSONS: readonly Lesson[] = [
  {
    id: 'one-drop',
    teaches: 'drop',
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
    teaches: 'drop',
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
    teaches: 'stroke',
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
  {
    id: 'swirl',
    teaches: 'swirl',
    prompt: 'A swirl turned the water. Circle its eye with your finger, against the turn.',
    spec: {
      paletteId: 'harbor-cobalt',
      ground: GROUND,
      stars: 1,
      moves: [
        { kind: 'drop', x: 6, y: 9.5, size: 'L', ink: 2 },
        { kind: 'swirl', x: 6, y: 7.5, turn: 1 },
      ],
    },
  },
];

/** The lessons a player still needs before playing `spec`, in teaching order. */
export const lessonsFor = (spec: SheetSpec, seen: (lessonId: string) => boolean): Lesson[] => {
  const forms = new Set(spec.moves.map((move) => move.kind));
  // Drops and folds are the basics: taught on the first visit, whatever the sheet.
  forms.add('drop');
  forms.add('stroke');
  return LESSONS.filter((lesson) => forms.has(lesson.teaches) && !seen(lesson.id));
};

/**
 * The two-drop specimen on the in-feed card: the whole idea of the game in
 * one tap. It borrows the day's palette so the card stays one colourway.
 */
export const cardSample = (paletteId: string): SheetSpec => ({
  paletteId,
  ground: { family: 'bands', period: 1.6, angle: 0, amplitude: 0, wavelength: 6 },
  stars: 1,
  moves: [
    { kind: 'drop', x: 4.5, y: 9, size: 'L', ink: 0 },
    { kind: 'drop', x: 8, y: 7, size: 'L', ink: 3 },
  ],
});
