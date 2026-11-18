import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMUNITY, RULES } from '../../../shared/config.ts';
import { apprenticeRun } from '../../../shared/game/apprentice.ts';
import type { Move } from '../../../shared/puzzle/moves.ts';
import { recipeById, recipeTag } from '../../../shared/puzzle/recipes.ts';
import type { SheetSpec } from '../../../shared/puzzle/sheet.ts';
import type { SheetDescriptor, SheetStats } from '../../../shared/protocol/api.ts';
import { COPY } from '../copy.ts';
import { metaLine } from './meta-line.ts';

const specOf = (moves: Move[]): SheetSpec => ({
  paletteId: 'harbor-cobalt',
  ground: { family: 'bands', period: 1.2, angle: 0, amplitude: 0, wavelength: 6 },
  moves,
  stars: 1,
});

/** Fooled once: the roundest drop lies under a fold. */
const folded = specOf([
  { kind: 'drop', x: 5, y: 8, size: 'L', ink: 0 },
  { kind: 'drop', x: 7.5, y: 8, size: 'M', ink: 1 },
  { kind: 'stroke', x: 6, y: 8, heading: 90 },
]);

/** Never fooled: only drops, the last one roundest. */
const plain = specOf([
  { kind: 'drop', x: 4, y: 6, size: 'L', ink: 0 },
  { kind: 'drop', x: 9, y: 10, size: 'M', ink: 1 },
]);

/** Fooled on every fold, so the sheet gives way under it. */
const tearing = specOf([
  { kind: 'drop', x: 8, y: 8, size: 'L', ink: 0 },
  ...Array.from({ length: RULES.maxBlots + 1 }, (_, i): Move => ({ kind: 'stroke', x: 3 + 2 * i, y: 8, heading: 90 })),
]);

const recipe = recipeById('old-fold') ?? assert.fail('no old-fold recipe');

const sheetOf = (overrides: Partial<SheetDescriptor> = {}): SheetDescriptor => ({
  id: 'sheet',
  kind: 'daily',
  author: null,
  number: 12,
  // A Monday.
  dateKey: '2026-11-16',
  weekday: 'Monday',
  paletteName: 'Harbor Cobalt',
  spec: folded,
  name: null,
  recipe: recipeTag(recipe),
  ...overrides,
});

const statsOf = (hands: number): SheetStats => ({ hands, cleans: 0, caught: 0 });
const fooled = apprenticeRun(folded);
const unfooled = apprenticeRun(plain);
const promise = COPY.cardPromise(recipe.promise);

test('before the stats arrive, or if they never do, the card claims nothing: the motto', () => {
  assert.equal(metaLine(sheetOf(), null, fooled), COPY.tagline);
  assert.equal(metaLine(sheetOf({ kind: 'trap', author: 'maker', recipe: null }), null, fooled), COPY.tagline);
});

test('an untouched daily shows its promise, with how often the Apprentice is fooled', () => {
  assert.equal(metaLine(sheetOf(), statsOf(0), fooled), `${COPY.apprentice.fools(1)} · ${promise}`);
  assert.equal(metaLine(sheetOf(), statsOf(0), unfooled), promise, 'no count when it is never fooled');
  assert.equal(metaLine(sheetOf({ recipe: null }), statsOf(0), unfooled), COPY.tagline, 'sheets made before recipes');
});

test('an untouched trap invites the first hand; an untouched mixed Sunday says no trap qualified', () => {
  assert.equal(metaLine(sheetOf({ kind: 'trap', author: 'maker', recipe: null }), statsOf(0), unfooled), COPY.trap.beFirst);
  // A Sunday.
  const sunday = sheetOf({ dateKey: '2026-11-15', weekday: 'Sunday', recipe: null });
  assert.equal(metaLine(sunday, statsOf(0), unfooled), COPY.trap.noneQualified);
  assert.equal(metaLine({ ...sunday, author: 'maker' }, statsOf(0), unfooled), COPY.tagline, 'a featured Sunday is no mixed one');
});

test('the Apprentice stands in only while the sheet is quiet', () => {
  const quiet = COMMUNITY.quietHands - 1;
  assert.equal(metaLine(sheetOf(), statsOf(quiet), fooled), `${COPY.apprentice.fools(1)} · ${COPY.cardHands(quiet)}`);
  assert.equal(metaLine(sheetOf(), statsOf(COMMUNITY.quietHands), fooled), COPY.cardHands(COMMUNITY.quietHands));
});

test('a trap tells how it is catching people once enough hands have played', () => {
  const trap = sheetOf({ kind: 'trap', author: 'maker', recipe: null });
  const quiet = COMMUNITY.quietHands - 1;
  assert.equal(metaLine(trap, statsOf(quiet), unfooled), COPY.cardHands(quiet));
  const stats = { hands: COMMUNITY.quietHands, cleans: 1, caught: 2 };
  assert.equal(metaLine(trap, stats, fooled), COPY.trap.caught(2, COMMUNITY.quietHands));
});

test('when the sheet gives way under the Apprentice, the card says so instead of a capped count', () => {
  const run = apprenticeRun(tearing);
  assert.equal(run.state.status, 'torn');
  assert.equal(metaLine(sheetOf({ spec: tearing }), statsOf(0), run), `${COPY.apprentice.tears} · ${promise}`);
});
