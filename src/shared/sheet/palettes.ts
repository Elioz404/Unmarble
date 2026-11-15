import { oklchToHex, type Oklch } from './color.ts';

/**
 * The palette catalogue. Each palette is a complete colourway for one sheet:
 * paper, the second tone of the ruled ground, the hairline between stripes,
 * and four inks.
 *
 * Palettes are authored in OKLCH. Inks only choose hue and chroma; their
 * lightness comes from a fixed ladder of value tiers (deep → light), the way a
 * marbler balances a bath. Distinct values keep every ink legible under every
 * colour-vision deficiency, not just distinct hues. `palettes.test.ts`
 * verifies the result, so an unreadable palette fails the build.
 */

export type Palette = {
  readonly id: string;
  readonly name: string;
  readonly paper: string;
  readonly band: string;
  readonly rule: string;
  readonly inks: readonly [string, string, string, string];
};

/** Lightness of each ink slot, from the deepest to the lightest. */
export const INK_VALUE_LADDER = [0.35, 0.49, 0.62, 0.76] as const;

/** Lightness of the paper, the second ground tone and the hairline. */
export const GROUND_VALUES = Object.freeze({ paper: 0.948, band: 0.885, rule: 0.68 });

type InkSpec = readonly [chroma: number, hue: number];

type PaletteSpec = {
  readonly id: string;
  readonly name: string;
  /** Hue and chroma of the paper tint; band and rule share it. */
  readonly ground: readonly [chroma: number, hue: number];
  readonly inks: readonly [InkSpec, InkSpec, InkSpec, InkSpec];
};

const WARM: PaletteSpec['ground'] = [0.016, 82];
const COOL: PaletteSpec['ground'] = [0.009, 210];
const ROSE: PaletteSpec['ground'] = [0.014, 40];

const SPECS: readonly PaletteSpec[] = [
  { id: 'harbor-cobalt', name: 'Harbor Cobalt', ground: WARM, inks: [[0.12, 262], [0.13, 28], [0.08, 175], [0.12, 78]] },
  { id: 'ochre-noon', name: 'Ochre Noon', ground: WARM, inks: [[0.11, 15], [0.07, 245], [0.09, 125], [0.13, 75]] },
  { id: 'moss-and-rust', name: 'Moss & Rust', ground: WARM, inks: [[0.08, 255], [0.13, 40], [0.1, 120], [0.12, 90]] },
  { id: 'night-garden', name: 'Night Garden', ground: WARM, inks: [[0.1, 275], [0.11, 350], [0.09, 160], [0.1, 95]] },
  { id: 'madder-lake', name: 'Madder Lake', ground: ROSE, inks: [[0.08, 320], [0.14, 20], [0.08, 200], [0.13, 80]] },
  { id: 'saffron-tide', name: 'Saffron Tide', ground: WARM, inks: [[0.05, 50], [0.08, 220], [0.14, 35], [0.14, 85]] },
  { id: 'lamp-and-linen', name: 'Lamp & Linen', ground: WARM, inks: [[0.012, 260], [0.15, 32], [0.09, 235], [0.11, 100]] },
  { id: 'verdigris', name: 'Verdigris', ground: COOL, inks: [[0.09, 250], [0.12, 45], [0.09, 170], [0.12, 80]] },
  { id: 'prussian-rain', name: 'Prussian Rain', ground: COOL, inks: [[0.1, 245], [0.12, 5], [0.07, 140], [0.12, 70]] },
  { id: 'plum-ledger', name: 'Plum Ledger', ground: ROSE, inks: [[0.1, 320], [0.08, 200], [0.12, 50], [0.09, 85]] },
  { id: 'copper-leaf', name: 'Copper Leaf', ground: WARM, inks: [[0.1, 0], [0.08, 250], [0.14, 50], [0.09, 125]] },
  { id: 'indigo-mill', name: 'Indigo Mill', ground: WARM, inks: [[0.12, 270], [0.12, 35], [0.08, 160], [0.13, 75]] },
  { id: 'cinnabar', name: 'Cinnabar', ground: WARM, inks: [[0.09, 255], [0.16, 32], [0.09, 150], [0.12, 80]] },
  { id: 'sea-glass', name: 'Sea Glass', ground: COOL, inks: [[0.08, 275], [0.11, 45], [0.09, 195], [0.08, 85]] },
  { id: 'burnt-umber', name: 'Burnt Umber', ground: WARM, inks: [[0.05, 55], [0.12, 15], [0.08, 240], [0.12, 90]] },
  { id: 'rose-madder', name: 'Rose Madder', ground: ROSE, inks: [[0.11, 0], [0.07, 190], [0.1, 115], [0.11, 60]] },
  { id: 'slate-orchard', name: 'Slate Orchard', ground: WARM, inks: [[0.05, 245], [0.12, 40], [0.1, 135], [0.12, 90]] },
  { id: 'gold-and-ink', name: 'Gold & Ink', ground: WARM, inks: [[0.03, 265], [0.11, 20], [0.08, 185], [0.13, 82]] },
  { id: 'teal-fathom', name: 'Teal Fathom', ground: COOL, inks: [[0.09, 305], [0.09, 200], [0.14, 50], [0.11, 115]] },
  { id: 'brick-and-sage', name: 'Brick & Sage', ground: WARM, inks: [[0.08, 255], [0.13, 35], [0.07, 145], [0.1, 92]] },
  { id: 'ember-blue', name: 'Ember Blue', ground: WARM, inks: [[0.13, 262], [0.1, 10], [0.09, 140], [0.15, 60]] },
  { id: 'fig-season', name: 'Fig Season', ground: ROSE, inks: [[0.09, 340], [0.07, 175], [0.13, 45], [0.11, 85]] },
  { id: 'lichen', name: 'Lichen', ground: WARM, inks: [[0.08, 260], [0.13, 30], [0.1, 120], [0.12, 98]] },
  { id: 'storm-ochre', name: 'Storm Ochre', ground: COOL, inks: [[0.04, 250], [0.12, 35], [0.06, 190], [0.13, 80]] },
  { id: 'carmine-map', name: 'Carmine Map', ground: ROSE, inks: [[0.09, 255], [0.16, 10], [0.08, 150], [0.11, 82]] },
  { id: 'juniper', name: 'Juniper', ground: COOL, inks: [[0.07, 165], [0.09, 275], [0.13, 40], [0.12, 92]] },
  { id: 'tobacco-lane', name: 'Tobacco Lane', ground: WARM, inks: [[0.06, 55], [0.07, 225], [0.13, 25], [0.1, 110]] },
  { id: 'winter-cobalt', name: 'Winter Cobalt', ground: COOL, inks: [[0.13, 263], [0.13, 30], [0.07, 175], [0.12, 85]] },
];

const resolve = (spec: PaletteSpec): Palette => {
  const [gc, gh] = spec.ground;
  const ground = (l: number, chromaScale: number): string => oklchToHex([l, gc * chromaScale, gh] satisfies Oklch);
  const ink = (slot: number): string => {
    const [c, h] = spec.inks[slot] as InkSpec;
    return oklchToHex([INK_VALUE_LADDER[slot] as number, c, h]);
  };
  return {
    id: spec.id,
    name: spec.name,
    paper: ground(GROUND_VALUES.paper, 1),
    band: ground(GROUND_VALUES.band, 1.6),
    rule: ground(GROUND_VALUES.rule, 2.2),
    inks: [ink(0), ink(1), ink(2), ink(3)],
  };
};

export const PALETTES: readonly Palette[] = SPECS.map(resolve);

const BY_ID = new Map(PALETTES.map((p) => [p.id, p]));

export const getPalette = (id: string): Palette => {
  const palette = BY_ID.get(id);
  if (!palette) throw new RangeError(`Unknown palette: ${id}`);
  return palette;
};
