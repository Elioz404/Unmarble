/**
 * The bindery's finishing tools: the brass marks a finisher strikes into a
 * binding, in gilt foil when earned and blind (pressed, unfilled) when not.
 * They replace text glyphs (★ ● ○ ◐) that EB Garamond does not ship, which
 * fell back to a sans-serif on Android. Every mark is drawn in chrome, never
 * on the sheet.
 */
import type { ReactNode } from 'react';
import { Random } from '../../shared/math/random.ts';
import './ornaments.css';

/** The one foil gradient every gilt mark fills with; mounted once per document by `FoilDefs`. */
const FOIL = 'url(#um-foil)';

type OrnamentProps = {
  readonly viewBox: string;
  readonly width: number | string;
  readonly height: number | string;
  readonly className: string;
  readonly children: ReactNode;
};

const Ornament = ({ viewBox, width, height, className, children }: OrnamentProps) => (
  <svg className={`ornament ${className}`} viewBox={viewBox} width={width} height={height} aria-hidden focusable="false">
    {children}
  </svg>
);

/**
 * The foil itself: lit bright at the top, dark where the tool bit deepest,
 * bright again at the far lip. Stops take their colours from the theme.
 */
export const FoilDefs = () => (
  <svg className="foil-defs" width="0" height="0" aria-hidden focusable="false">
    <defs>
      {/* Runs at 160°, like the CSS --gilt-foil, so struck marks and foil roundels share one light. */}
      <linearGradient id="um-foil" x1="0.33" y1="0" x2="0.67" y2="1">
        <stop offset="0" className="foil-defs__lit" />
        <stop offset="0.38" className="foil-defs__body" />
        <stop offset="0.62" className="foil-defs__deep" />
        <stop offset="1" className="foil-defs__lit" />
      </linearGradient>
    </defs>
  </svg>
);

/**
 * A strip of deckle: `count + 1` stable offsets in [0, 1), the same for the
 * same seed on every render, so a torn edge never shimmers.
 */
export const deckle = (count: number, seed: string): readonly number[] => {
  const random = new Random(seed);
  return Array.from({ length: count + 1 }, () => random.next());
};

/** A six-point binder's star on a 12-unit tool face; inner radius half the outer, as the brass is cut. */
const STAR = Object.freeze({ points: 6, outer: 5.6, inner: 2.8, centre: 6 });

const STAR_PATH = `${Array.from({ length: STAR.points * 2 }, (_, i) => {
  const angle = -Math.PI / 2 + (i * Math.PI) / STAR.points;
  const radius = i % 2 === 0 ? STAR.outer : STAR.inner;
  const x = STAR.centre + radius * Math.cos(angle);
  const y = STAR.centre + radius * Math.sin(angle);
  return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
}).join('')}Z`;

/** One difficulty star: gilt when the sheet earns it, blind when not. Sized by the font (1em). */
export const ToolStar = ({ on }: { readonly on: boolean }) => (
  <Ornament viewBox="0 0 12 12" width="1em" height="1em" className={on ? 'star star--on' : 'star ornament--blind'}>
    <path d={STAR_PATH} fill={on ? FOIL : undefined} />
  </Ornament>
);

/** A row of `count` gilt stars, followed by blind ones up to `of` when given; `label` is what a screen reader hears. */
export const ToolStars = ({
  count,
  of = count,
  label,
}: {
  readonly count: number;
  readonly of?: number;
  readonly label?: string;
}) => (
  <span className="tool-stars">
    {Array.from({ length: of }, (_, i) => (
      <ToolStar key={i} on={i < count} />
    ))}
    {label ? <span className="visually-hidden">{label}</span> : null}
  </span>
);

export type SealState = 'empty' | 'gilt' | 'split' | 'lens';

/** The circle-and-dot tool: a ring of radius 5.2 round a dot of 2.2, on a 12-unit face. */
const SEAL = Object.freeze({ centre: 6, ring: 5.2, dot: 2.2, stroke: 1.3, splitShift: 0.35 });
const { centre: C, ring: R, dot: D } = SEAL;

/** Half a ring (and half its dot), on the left (sweep 0) or the right (sweep 1). */
const halfRing = (sweep: 0 | 1): string => `M${C} ${C - R}A${R} ${R} 0 0 ${sweep} ${C} ${C + R}`;
const halfDot = (sweep: 0 | 1): string => `M${C} ${C - D}A${D} ${D} 0 0 ${sweep} ${C} ${C + D}Z`;
/** The ragged line a split seal broke along (bottom to top), shared by both halves of its dot. */
const CRACK = [
  [0.4, 1.1],
  [-0.5, 0.2],
  [0.6, -0.9],
] as const;
const halfDotCracked = (sweep: 0 | 1): string =>
  `M${C} ${C - D}A${D} ${D} 0 0 ${sweep} ${C} ${C + D}${CRACK.map(([dx, dy]) => `L${C + dx} ${C + dy}`).join('')}Z`;

const SEAL_BODY: Record<SealState, ReactNode> = {
  // Blind: the tool pressed without foil.
  empty: (
    <>
      <circle className="seal__ring" cx={C} cy={C} r={R} strokeWidth={SEAL.stroke} />
      <circle className="seal__dot" cx={C} cy={C} r={D} />
    </>
  ),
  gilt: (
    <>
      <circle cx={C} cy={C} r={R} fill="none" stroke={FOIL} strokeWidth={SEAL.stroke} />
      <circle cx={C} cy={C} r={D} fill={FOIL} />
    </>
  ),
  // Oxblood, broken in two along a crack: the sheet tore here.
  split: (
    <>
      <g transform={`translate(${-SEAL.splitShift} ${SEAL.splitShift})`}>
        <path className="seal__ring" d={halfRing(0)} strokeWidth={SEAL.stroke} />
        <path className="seal__dot" d={halfDotCracked(0)} />
      </g>
      <g transform={`translate(${SEAL.splitShift} ${-SEAL.splitShift})`}>
        <path className="seal__ring" d={halfRing(1)} strokeWidth={SEAL.stroke} />
        <path className="seal__dot" d={halfDotCracked(1)} />
      </g>
    </>
  ),
  // Half struck: the Lens was used (or the sheet is under way).
  lens: (
    <>
      <path d={halfRing(0)} fill="none" stroke={FOIL} strokeWidth={SEAL.stroke} />
      <path d={halfDot(0)} fill={FOIL} />
      <path className="seal__ring" d={halfRing(1)} strokeWidth={SEAL.stroke} />
      <path className="seal__dot" d={halfDot(1)} />
    </>
  ),
};

/** A circle-and-dot seal: blind when empty, gilt when struck, oxblood and split when torn, half-gilt for the Lens. */
export const Seal = ({ state, size = 14 }: { readonly state: SealState; readonly size?: number }) => (
  <Ornament viewBox="0 0 12 12" width={size} height={size} className={`seal seal--${state}`}>
    {SEAL_BODY[state]}
  </Ornament>
);

/** A 22×6 strip of paper with a deckled lower edge; a torn one is ripped through the middle. */
const STRIP = Object.freeze({ width: 22, height: 6, body: 4.4, teeth: 11, tearAt: 10.2, gap: 1.6 });

const STRIP_EDGE = deckle(STRIP.teeth, 'tear-strip').map((jitter, i) => ({
  x: (i * STRIP.width) / STRIP.teeth,
  y: STRIP.body + jitter * (STRIP.height - STRIP.body),
}));

/** The deckled lower edge between two x positions, walked right to left. */
const edgeBetween = (from: number, to: number): string =>
  STRIP_EDGE.filter((p) => p.x >= from && p.x <= to)
    .reverse()
    .map((p) => `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join('');

/** The rip, top to bottom: a ragged line across the strip, the same on both pieces so they read as one paper parted. */
const RIP = [
  [0, 0],
  [1.1, 1.5],
  [-0.2, 3],
  [0.8, 4.4],
  [0.3, STRIP.height - 0.4],
] as const;
/** How far right the rip wanders: the deckle of the right piece starts past it. */
const RIP_REACH = Math.max(...RIP.map(([dx]) => dx));
const rip = (shift: number): string[] => RIP.map(([dx, y]) => `L${(STRIP.tearAt + shift + dx).toFixed(2)} ${y}`);

const INTACT_STRIP = `M0 0H${STRIP.width}${edgeBetween(0, STRIP.width)}Z`;
const TORN_LEFT = `M0 0${rip(0).join('')}${edgeBetween(0, STRIP.tearAt)}Z`;
const TORN_RIGHT = `M${STRIP.width} 0${edgeBetween(STRIP.tearAt + STRIP.gap + RIP_REACH, STRIP.width)}${rip(STRIP.gap).reverse().join('')}Z`;

export const TearStrip = ({ torn }: { readonly torn: boolean }) => (
  <Ornament
    viewBox={`0 0 ${STRIP.width} ${STRIP.height}`}
    width={STRIP.width}
    height={STRIP.height}
    className={torn ? 'tear-strip tear-strip--torn' : 'tear-strip ornament--blind'}
  >
    {torn ? (
      <>
        <path d={TORN_LEFT} />
        <path d={TORN_RIGHT} />
      </>
    ) : (
      <path d={INTACT_STRIP} />
    )}
  </Ornament>
);

/** A gilt rule broken by a centre lozenge, drawn on whole pixels so it stays crisp at 1×. */
const FILLET = Object.freeze({ height: 9, rule: 1, lozenge: 4, clearance: 3 });

export const Fillet = ({ width = 120 }: { readonly width?: number }) => {
  const mid = width / 2;
  const y = (FILLET.height - FILLET.rule) / 2;
  const half = FILLET.lozenge;
  const arm = mid - half - FILLET.clearance;
  return (
    <Ornament viewBox={`0 0 ${width} ${FILLET.height}`} width={width} height={FILLET.height} className="fillet">
      <rect x={0} y={y} width={arm} height={FILLET.rule} fill={FOIL} />
      <rect x={width - arm} y={y} width={arm} height={FILLET.rule} fill={FOIL} />
      <path d={`M${mid} 0.5L${mid + half} ${FILLET.height / 2}L${mid} ${FILLET.height - 0.5}L${mid - half} ${FILLET.height / 2}Z`} fill={FOIL} />
    </Ornament>
  );
};

/**
 * A corner fleuron for the top-left of a frame (rotate it for the others):
 * a lozenge at the corner, two tapered spurs running out along the edges and
 * one leaf pointing in. Every part is pointed, nothing round.
 */
export const Fleuron = ({ size = 14 }: { readonly size?: number }) => (
  <Ornament viewBox="0 0 14 14" width={size} height={size} className="fleuron">
    <path
      fill={FOIL}
      d={[
        'M4.5 1.6L7.4 4.5L4.5 7.4L1.6 4.5Z',
        'M7.9 3.9Q11 4.2 14 4.5Q11 4.8 7.9 5.1Z',
        'M3.9 7.9Q4.2 11 4.5 14Q4.8 11 5.1 7.9Z',
        'M7.2 7.2Q10.6 7.6 11.6 11.6Q7.6 10.6 7.2 7.2Z',
        'M0.4 0.4L2.6 1.2L1.2 2.6Z',
      ].join('')}
    />
  </Ornament>
);
