import { oklchToHex, type Oklch } from './color.ts';

/**
 * The palette catalogue. Each palette is a complete colourway for one sheet:
 * paper, the second tone of the ruled ground, the hairline between stripes,
 * and four inks.
 *
 * Palettes are authored in OKLCH. Inks only choose hue and chroma; their
 * lightness comes from a fixed ladder of value tiers (deep → light), the way a
 * marbler balances a bath. Distinct values keep every ink legible under every
 * colour-vision deficiency, not just distinct hues. The ground is one of six
 * laid stocks; each tints paper, band and rule but keeps the shared ground
 * lightnesses, so the seams read the same on every stock. `palettes.test.ts`
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

/** Chroma and hue of one ground tone; its lightness comes from GROUND_VALUES. */
type Tint = readonly [chroma: number, hue: number];

/**
 * A laid stock: tinted paper, the band in a neighbouring hue, and the coloured
 * ink its hairlines are ruled in. The band↔paper window leaves little room for
 * chroma, so the band stays within about 20° of the paper and the rule carries
 * the colour.
 */
type Stock = { readonly paper: Tint; readonly band: Tint; readonly rule: Tint };

type PaletteSpec = {
  readonly id: string;
  readonly name: string;
  readonly ground: Stock;
  readonly inks: readonly [InkSpec, InkSpec, InkSpec, InkSpec];
};

/** Ivory paper, an ochre band and a sepia rule. */
const IVORY: Stock = { paper: [0.017, 92], band: [0.03, 80], rule: [0.05, 58] };
/** Dutch blue-grey paper, a slate band and an indigo rule. */
const DUTCH: Stock = { paper: [0.011, 248], band: [0.022, 252], rule: [0.055, 266] };
/** Madder rose paper and band, with an oxblood rule. */
const MADDER: Stock = { paper: [0.015, 40], band: [0.028, 28], rule: [0.055, 20] };
/** Sage paper and band, with a green-black rule. */
const SAGE: Stock = { paper: [0.016, 112], band: [0.024, 130], rule: [0.045, 155] };
/** Buff paper, a tan band and a bistre rule. */
const BUFF: Stock = { paper: [0.026, 82], band: [0.038, 72], rule: [0.06, 50] };
/** Welsh slate: violet-grey paper and band, with a graphite rule. */
const SLATE: Stock = { paper: [0.008, 290], band: [0.016, 295], rule: [0.032, 305] };

const SPECS: readonly PaletteSpec[] = [
  { id: 'harbor-cobalt', name: 'Harbor Cobalt', ground: IVORY, inks: [[0.12, 262], [0.13, 28], [0.08, 175], [0.12, 78]] },
  { id: 'ochre-noon', name: 'Ochre Noon', ground: DUTCH, inks: [[0.11, 15], [0.07, 245], [0.09, 125], [0.13, 75]] },
  { id: 'moss-and-rust', name: 'Moss & Rust', ground: BUFF, inks: [[0.08, 255], [0.13, 40], [0.1, 120], [0.12, 90]] },
  { id: 'night-garden', name: 'Night Garden', ground: SLATE, inks: [[0.1, 275], [0.11, 350], [0.09, 160], [0.1, 95]] },
  { id: 'madder-lake', name: 'Madder Lake', ground: SAGE, inks: [[0.08, 320], [0.14, 20], [0.08, 200], [0.13, 80]] },
  { id: 'saffron-tide', name: 'Saffron Tide', ground: SAGE, inks: [[0.05, 50], [0.08, 220], [0.14, 35], [0.14, 85]] },
  { id: 'lamp-and-linen', name: 'Lamp & Linen', ground: IVORY, inks: [[0.012, 260], [0.15, 32], [0.09, 235], [0.11, 100]] },
  { id: 'verdigris', name: 'Verdigris', ground: SLATE, inks: [[0.09, 250], [0.12, 45], [0.09, 170], [0.12, 80]] },
  { id: 'prussian-rain', name: 'Prussian Rain', ground: DUTCH, inks: [[0.1, 245], [0.12, 5], [0.07, 140], [0.12, 70]] },
  { id: 'plum-ledger', name: 'Plum Ledger', ground: MADDER, inks: [[0.1, 320], [0.08, 200], [0.12, 50], [0.09, 85]] },
  { id: 'copper-leaf', name: 'Copper Leaf', ground: BUFF, inks: [[0.1, 0], [0.08, 250], [0.14, 50], [0.09, 125]] },
  { id: 'indigo-mill', name: 'Indigo Mill', ground: BUFF, inks: [[0.12, 270], [0.12, 35], [0.08, 160], [0.13, 75]] },
  { id: 'cinnabar', name: 'Cinnabar', ground: IVORY, inks: [[0.09, 255], [0.16, 32], [0.09, 150], [0.12, 80]] },
  { id: 'sea-glass', name: 'Sea Glass', ground: DUTCH, inks: [[0.08, 275], [0.11, 45], [0.09, 195], [0.08, 85]] },
  { id: 'burnt-umber', name: 'Burnt Umber', ground: SAGE, inks: [[0.05, 55], [0.12, 15], [0.08, 240], [0.12, 90]] },
  { id: 'rose-madder', name: 'Rose Madder', ground: IVORY, inks: [[0.11, 0], [0.07, 190], [0.1, 115], [0.11, 60]] },
  { id: 'slate-orchard', name: 'Slate Orchard', ground: SLATE, inks: [[0.05, 245], [0.12, 40], [0.1, 135], [0.12, 90]] },
  { id: 'gold-and-ink', name: 'Gold & Ink', ground: SAGE, inks: [[0.03, 265], [0.11, 20], [0.08, 185], [0.13, 82]] },
  { id: 'teal-fathom', name: 'Teal Fathom', ground: MADDER, inks: [[0.09, 305], [0.09, 200], [0.14, 50], [0.11, 115]] },
  { id: 'brick-and-sage', name: 'Brick & Sage', ground: IVORY, inks: [[0.08, 255], [0.13, 35], [0.07, 145], [0.11, 92]] },
  { id: 'ember-blue', name: 'Ember Blue', ground: DUTCH, inks: [[0.13, 262], [0.1, 10], [0.09, 140], [0.15, 60]] },
  { id: 'fig-season', name: 'Fig Season', ground: SLATE, inks: [[0.09, 340], [0.07, 175], [0.13, 45], [0.11, 85]] },
  { id: 'lichen', name: 'Lichen', ground: SLATE, inks: [[0.08, 260], [0.13, 30], [0.1, 120], [0.12, 98]] },
  { id: 'storm-ochre', name: 'Storm Ochre', ground: DUTCH, inks: [[0.04, 250], [0.12, 35], [0.06, 190], [0.13, 80]] },
  { id: 'carmine-map', name: 'Carmine Map', ground: BUFF, inks: [[0.09, 255], [0.16, 10], [0.08, 150], [0.11, 82]] },
  { id: 'juniper', name: 'Juniper', ground: SLATE, inks: [[0.07, 165], [0.09, 275], [0.13, 40], [0.12, 92]] },
  { id: 'tobacco-lane', name: 'Tobacco Lane', ground: BUFF, inks: [[0.06, 55], [0.07, 225], [0.13, 25], [0.11, 110]] },
  { id: 'winter-cobalt', name: 'Winter Cobalt', ground: DUTCH, inks: [[0.13, 263], [0.13, 30], [0.07, 175], [0.12, 85]] },
];

const resolve = (spec: PaletteSpec): Palette => {
  const tone = (l: number, [c, h]: Tint): string => oklchToHex([l, c, h] satisfies Oklch);
  const ink = (slot: number): string => {
    const [c, h] = spec.inks[slot] as InkSpec;
    return oklchToHex([INK_VALUE_LADDER[slot] as number, c, h]);
  };
  return {
    id: spec.id,
    name: spec.name,
    paper: tone(GROUND_VALUES.paper, spec.ground.paper),
    band: tone(GROUND_VALUES.band, spec.ground.band),
    rule: tone(GROUND_VALUES.rule, spec.ground.rule),
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
