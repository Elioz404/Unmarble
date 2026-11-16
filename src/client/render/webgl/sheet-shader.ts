import { LOOK } from '../../../shared/render/shading.ts';
import { MAX_RENDER_OPS } from '../renderer.ts';

/**
 * GLSL twin of `shared/marbling/field.ts` + `shared/render/shading.ts`.
 * Constants are injected from `LOOK` so the CPU and GPU looks cannot drift.
 */

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

export const OP_DROP = 0;
export const OP_STROKE = 1;
export const OP_SUCTION = 2;
export const OP_SWIRL = 3;

export const GROUND_FAMILY_CODES = Object.freeze({ bands: 0, combed: 0, chevron: 1, waves: 2, grid: 3, rings: 4 });

export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

#define MAX_OPS ${MAX_RENDER_OPS}
#define TAU 6.283185307179586

in vec2 vUv;
out vec4 outColor;

uniform vec2 uSheet;          // sheet size in cells
uniform vec2 uResolution;     // drawing buffer in pixels
uniform int uOpCount;
uniform vec4 uOpA[MAX_OPS];   // drop/suction: (type, cx, cy, r)   stroke: (type, bx, by, shift)   swirl: (type, cx, cy, turn)
uniform vec4 uOpB[MAX_OPS];   // drop: (ink, source, -, -)          stroke: (ux, uy, falloff, source) swirl: (falloff, source, -, -)

uniform vec3 uPaper;
uniform vec3 uBand;
uniform vec3 uRule;
uniform vec3 uInkLog[4];      // per ink, ln(ink / paper)

uniform int uGroundFamily;    // 0 bands/combed, 1 chevron, 2 waves, 3 grid, 4 rings
uniform float uGroundPeriod;
uniform vec2 uGroundRot;      // (cos, sin) of the stripe angle
uniform float uGroundAmplitude;
uniform float uGroundWavelength;

// Integer lattice hash (lowbias32), bit-identical to the CPU's.
float hash(ivec2 i) {
  uint h = uint(i.x) * 0x8DA6B343u ^ uint(i.y) * 0xD8163841u;
  h = (h ^ (h >> 16u)) * 0x7FEB352Du;
  h = (h ^ (h >> 15u)) * 0x846CA68Bu;
  h ^= h >> 16u;
  return float(h >> 8u) / 16777216.0;
}

float valueNoise(vec2 p) {
  vec2 fl = floor(p);
  ivec2 i = ivec2(fl);
  vec2 f = p - fl;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + ivec2(1, 0));
  float c = hash(i + ivec2(0, 1));
  float d = hash(i + ivec2(1, 1));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

float hairline(float phase, float width) {
  float d = abs(fract(phase + 0.5) - 0.5);
  return 1.0 - smoothstep(width * 0.5, width, d);
}

float groundPhase(vec2 p) {
  vec2 d = p - uSheet * 0.5;
  if (uGroundFamily == 4) return length(d) / uGroundPeriod;
  float s = d.x * uGroundRot.x + d.y * uGroundRot.y;
  float t = -d.x * uGroundRot.y + d.y * uGroundRot.x;
  if (uGroundFamily == 1) return (t + uGroundAmplitude * abs(s)) / uGroundPeriod;
  if (uGroundFamily == 2) return (t + uGroundAmplitude * sin(TAU * s / uGroundWavelength)) / uGroundPeriod;
  return t / uGroundPeriod;
}

/** A grid's crossing hairlines; 0 everywhere else. */
float crossLine(vec2 p) {
  if (uGroundFamily != 3) return 0.0;
  vec2 d = p - uSheet * 0.5;
  float s = d.x * uGroundRot.x + d.y * uGroundRot.y;
  return hairline(s / uGroundPeriod, ${f(LOOK.ruleWidth)});
}

const float INK_BODY[4] = float[4](${LOOK.inkBody.map(f).join(', ')});

/** Ink laid over the paper (Beer–Lambert): wash, tide line and mottle, in the drop's own coordinates. */
vec3 inkColor(int slot, vec2 l, float r, float source, float px) {
  float depth = r > 0.0 ? length(l) / r : 1.0;
  float body = mix(INK_BODY[slot], 1.0, smoothstep(${f(LOOK.inkBodyFrom)}, ${f(LOOK.inkBodyTo)}, depth));
  float t = min(0.0, depth - ${f(LOOK.tideAt)}) / ${f(LOOK.tideWidth)};
  float tide = ${f(LOOK.tide)} * smoothstep(${f(LOOK.tideFromPx)}, ${f(LOOK.tideToPx)}, ${f(LOOK.tideWidth)} * r / px) * exp(-t * t);
  float blotch = valueNoise(l * ${f(LOOK.mottleScale)} + vec2(${f(LOOK.mottleSeedX)}, ${f(LOOK.mottleSeedY)}) * source);
  float mottle = 2.0 * ${f(LOOK.mottle)} * (blotch - 0.5) * (1.0 - smoothstep(${f(LOOK.mottleMaskFrom)}, ${f(LOOK.mottleMaskTo)}, depth));
  return uPaper * exp((body + tide) * (1.0 + mottle) * uInkLog[slot]);
}

/** One sample before the paper finish: rgb, and ink coverage in w. */
vec4 shade(vec2 q, float px) {
  vec2 p = q;
  for (int i = MAX_OPS - 1; i >= 0; i--) {
    if (i >= uOpCount) continue;
    vec4 a = uOpA[i];
    vec4 b = uOpB[i];
    int type = int(a.x + 0.5);
    if (type == ${OP_DROP}) {
      vec2 d = p - a.yz;
      float l2 = dot(d, d);
      float r2 = a.w * a.w;
      if (l2 <= r2) return vec4(inkColor(clamp(int(b.x + 0.5), 0, 3), d, a.w, b.y, px), 1.0);
      p = a.yz + d * sqrt(1.0 - r2 / l2);
    } else if (type == ${OP_STROKE}) {
      vec2 u = b.xy;
      float dist = abs(dot(p - a.yz, vec2(-u.y, u.x)));
      p -= u * (a.w * b.z / (dist + b.z));
    } else if (type == ${OP_SWIRL}) {
      vec2 d = p - a.yz;
      float angle = -a.w * b.x / (length(d) + b.x);
      float c = cos(angle);
      float s = sin(angle);
      p = a.yz + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
    } else {
      vec2 d = p - a.yz;
      float l2 = max(dot(d, d), 1e-9);
      p = a.yz + d * sqrt(1.0 + a.w * a.w / l2);
    }
  }
  float phase = groundPhase(p);
  vec3 band = mod(floor(phase), 2.0) < 0.5 ? uPaper : uBand;
  return vec4(mix(band, uRule, max(hairline(phase, ${f(LOOK.ruleWidth)}), crossLine(p))), 0.0);
}

/** Paper finish at a pixel centre: tooth through ink, laid and chain lines on bare paper, prefiltered by pixel size. */
float paperFinish(vec2 p, float coverage, float px) {
  float fine = 1.0 - smoothstep(0.5 / ${f(LOOK.toothFineX)}, 1.0 / ${f(LOOK.toothFineX)}, px);
  float tooth = ${f(LOOK.toothCoarse)} * (valueNoise(p * vec2(${f(LOOK.toothCoarseX)}, ${f(LOOK.toothCoarseY)})) - 0.5)
    + (1.0 - ${f(LOOK.toothCoarse)}) * (valueNoise(p * vec2(${f(LOOK.toothFineX)}, ${f(LOOK.toothFineY)})) - 0.5) * fine;
  float laid = cos(p.y / ${f(LOOK.laidSpacing)} * TAU) * 0.5 * (1.0 - smoothstep(${f(LOOK.laidSpacing)} / 4.0, ${f(LOOK.laidSpacing)} / 2.0, px));
  float sigma = length(vec2(${f(LOOK.chainWidth)}, ${f(LOOK.pixelFootprint)} * px));
  float offset = (fract(p.x / ${f(LOOK.chainSpacing)}) - 0.5) * ${f(LOOK.chainSpacing)};
  float chain = ${f(LOOK.chainWidth)} / sigma * exp(-offset * offset / (2.0 * sigma * sigma));
  return 1.0 + 2.0 * ${f(LOOK.toothStrength)} * tooth * mix(1.0, ${f(LOOK.toothThroughInk)}, coverage)
    + (1.0 - coverage) * (laid * ${f(LOOK.laidStrength)} - chain * ${f(LOOK.chainStrength)});
}

vec3 toSrgb(vec3 c) {
  vec3 lo = 12.92 * c;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  vec2 cell = uSheet / uResolution;
  float px = cell.x;
  vec2 base = vUv * uSheet;
  // 4-sample rotated grid: crisp ink edges at any device pixel ratio.
  vec4 sum = shade(base + cell * vec2(-0.125, -0.375), px)
    + shade(base + cell * vec2(0.375, -0.125), px)
    + shade(base + cell * vec2(0.125, 0.375), px)
    + shade(base + cell * vec2(-0.375, 0.125), px);
  outColor = vec4(toSrgb(sum.rgb * 0.25 * paperFinish(base, sum.w * 0.25, px)), 1.0);
}`;
