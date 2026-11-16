/**
 * Single source of truth for every tunable number in UNMARBLE.
 *
 * Everything the playtest gate may need to calibrate lives here, grouped by
 * domain, so tuning never means hunting for literals across the codebase.
 * Units: "cells" are sheet units (the sheet is SHEET.cols × SHEET.rows cells).
 */

export const SHEET = Object.freeze({
  /** Sheet width in cells. */
  cols: 12,
  /** Sheet height in cells (3:4 portrait). */
  rows: 16,
});

export const PHYSICS = Object.freeze({
  /** Drop radii in cells, by size class. */
  dropRadius: Object.freeze({ S: 1.2, M: 1.8, L: 2.6 }),
  /** Maximum shift of a stroke at its own line, in cells (Jaffer's α). */
  strokeShift: 1.6,
  /** Fall-off length of a stroke, in cells (Jaffer's λ). */
  strokeFalloff: 1.8,
  /** Angular snapping for strokes, in degrees. */
  strokeAngleStep: 15,
  /** Rotation of a swirl at its eye, in radians. */
  swirlTurn: 2.4,
  /** Fall-off length of a swirl, in cells. */
  swirlFalloff: 1.8,
});

/**
 * Evidence thresholds: how much deformation a human can reliably read on a
 * ~340 px phone sheet. Calibrated by the playtest gate.
 */
export const EVIDENCE = Object.freeze({
  /** Relative out-of-roundness of a drop outline that reads as "not round". */
  dropOvality: 0.08,
  /** Perpendicular bend of a seam (cells) that reads as "not straight". */
  seamBend: 0.45,
  /** Every covered move must exceed its threshold by this factor. */
  safetyMargin: 1.2,
  /** Boundary samples used to measure a drop outline. */
  outlineSamples: 96,
  /** Samples used to measure a seam. */
  seamSamples: 64,
  /** Minimum share of a stroke's crossings that must cut the stripes steeply. */
  minSteepCrossingShare: 0.7,
  /** Minimum angle between a stroke and the local stripe direction, degrees. */
  minCrossingAngle: 30,
  /** Minimum visible length of a seam inside the sheet, in cells. */
  minSeamLength: 7,
  /** Radius (cells) of the circle around a swirl's eye whose shape is its evidence. */
  swirlProbeRadius: 1.4,
  /** Relative out-of-roundness of a swirl's eye circle that reads as disturbed. */
  swirlOvality: 0.08,
});

export const GENERATION = Object.freeze({
  /** Candidate sheets tried before generation gives up. */
  maxAttempts: 4000,
  /** Placement retries for a single move inside one candidate. */
  placementRetries: 24,
  /** A new drop lands this many (r_prev + r) away from the previous one. */
  dropSpacing: Object.freeze({ min: 0.55, max: 1.15 }),
  /** A stroke passes within this distance (cells) of the previous move. */
  strokeReach: 1.2,
  /** A drop after a stroke lands within this distance (cells) of its seam. */
  seamReach: 1.4,
  /** A crescent is a drop outline deformed at least this strongly. */
  crescentStrength: 4,
  /** A decoy is a covered drop whose mark stays at or below this strength. */
  decoyCeiling: 1.9,
  /** Twin inks: the later drop touches the earlier one within this gap (cells). */
  twinGap: 0.3,
  /** Crossed seams must intersect at least this far inside the sheet (cells). */
  crossingInset: 1.5,
  /** A swirl's eye lands within this distance (cells) of the previous move. */
  swirlReach: 1.6,
  /** A swirl's eye keeps this distance (cells) from the sheet edge. */
  swirlEdgeMargin: 2.5,
});

export const GROUND_STYLE = Object.freeze({
  period: Object.freeze({ min: 1.1, max: 1.6 }),
  combedPeriod: Object.freeze({ min: 0.62, max: 0.8 }),
  angles: Object.freeze([0, 90, 30, 150, 60, 120]),
  chevronSlope: Object.freeze({ min: 0.45, max: 0.85 }),
  waveAmplitude: Object.freeze({ min: 0.45, max: 0.95 }),
  wavelength: Object.freeze({ min: 5, max: 8 }),
});

export const CALENDAR = Object.freeze({
  /** UTC date of Sheet No. 1. */
  epoch: '2026-11-25',
  /** Palette rotation stride; coprime with the catalogue size so 28 days never repeat. */
  paletteStride: 11,
  paletteOffset: 3,
});

export const VISIBILITY = Object.freeze({
  /** Coarse raster resolution used by the validator, samples per cell. */
  rasterDensity: 4,
  /** Minimum share of a drop's ink area that must remain on the sheet. */
  minVisibleInk: 0.55,
  /** Radius (cells) of fully-owned ink needed for a comfortable tap. */
  tapCoreRadius: 0.45,
  /** Accepted ink coverage of the finished sheet. */
  coverage: Object.freeze({ min: 0.22, max: 0.62 }),
  /** Max distance (cells) between the ink's centre of mass and the sheet centre. */
  compositionTolerance: 2.2,
  /** Margin (cells) kept between a drop's initial disk and the sheet edge. */
  dropEdgeMargin: 0.6,
});

export const INPUT = Object.freeze({
  /** Radius (cells) of the finger footprint used when resolving a tap. */
  fingerRadius: 0.55,
  /** Probe points sampled across the finger footprint. */
  fingerProbes: 19,
  /** Share of probes that must agree on a drop before a tap counts. */
  tapConsensus: 0.4,
  /** Minimum swipe length, in cells, to be read as a stroke gesture. */
  minSwipeLength: 2,
  /** Max distance (cells) from a seam for a swipe to address it. */
  swipeSeamTolerance: 1,
  /** Max angle (degrees) between a swipe and a seam. */
  swipeAngleTolerance: 15,
  /** A drag must turn at least this far (degrees) around an eye to undo a swirl. */
  minSwirlSweep: 110,
  /** Accepted distance (cells) of a circling drag from a swirl's eye. */
  swirlRadius: Object.freeze({ min: 0.4, max: 4.5 }),
  /** Max spread of a circling drag's distance to the eye, relative to its mean. */
  swirlRoundness: 0.4,
});

export const RULES = Object.freeze({
  /** Blots that tear the sheet. */
  maxBlots: 3,
  /** Magnifier uses per sheet. */
  magnifiers: 1,
  /** Longest attempt time recorded; later timestamps are clamped to it. */
  maxAttemptMs: 86_400_000,
});

export const TIMING = Object.freeze({
  absorbMs: 650,
  tearPreviewMs: 1200,
  tearRevertMs: 520,
  magnifierMs: 1500,
  cleanWaveMs: 1400,
  replayStepMs: 700,
});
