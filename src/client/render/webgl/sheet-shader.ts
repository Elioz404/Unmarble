import { CENTRE_EPSILON, RIM_SCALE_FLOOR } from '../../../shared/marbling/field.ts';
import { FLAT_GRADIENT, LOOK } from '../../../shared/render/shading.ts';
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

/** The rule nearest phase, ruled with a pen: near-constant width on screen, a 1 px analytic edge. */
float penLine(float phase, float gradient, float nominal, float px) {
  float g = max(gradient, ${f(FLAT_GRADIENT)});
  float pen = min(max(max(${f(LOOK.ruleWidth)} / g, ${f(LOOK.penMin)} * nominal), ${f(LOOK.penFloorPx)} * px), ${f(LOOK.penMax)} * nominal);
  float width = min(pen, ${f(LOOK.penShare)} / g);
  float distance = abs(fract(phase + 0.5) - 0.5) / g;
  return 1.0 - smoothstep((width - px) * 0.5, (width + px) * 0.5, distance);
}

/** Gradient of groundPhase (phase per cell). */
vec2 groundGradient(vec2 p) {
  vec2 d = p - uSheet * 0.5;
  if (uGroundFamily == 4) {
    float l = length(d);
    return (l > 0.0 ? d / l : vec2(1.0, 0.0)) / uGroundPeriod;
  }
  float s = d.x * uGroundRot.x + d.y * uGroundRot.y;
  float along = 0.0;
  if (uGroundFamily == 1) along = uGroundAmplitude * sign(s);
  if (uGroundFamily == 2) along = uGroundAmplitude * (TAU / uGroundWavelength) * cos(TAU * s / uGroundWavelength);
  return (vec2(-uGroundRot.y, uGroundRot.x) + along * uGroundRot) / uGroundPeriod;
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

/** A grid's crossing rules, J being the pull-back Jacobian; 0 everywhere else. */
float crossLine(vec2 p, mat2 J, float nominal, float px) {
  if (uGroundFamily != 3) return 0.0;
  vec2 d = p - uSheet * 0.5;
  float s = d.x * uGroundRot.x + d.y * uGroundRot.y;
  return penLine(s / uGroundPeriod, length((uGroundRot / uGroundPeriod) * J), nominal, px);
}

const float INK_BODY[4] = float[4](${LOOK.inkBody.map(f).join(', ')});

/**
 * Ink laid over the paper (Beer–Lambert): wash, tide line, mottle and
 * granulation, in the drop's own coordinates l, which move ‖J‖ cells per cell of screen.
 */
vec3 inkColor(int slot, vec2 l, float r, float source, mat2 J, float px) {
  float depth = r > 0.0 ? length(l) / r : 1.0;
  float body = mix(INK_BODY[slot], 1.0, smoothstep(${f(LOOK.inkBodyFrom)}, ${f(LOOK.inkBodyTo)}, depth));
  float t = min(0.0, depth - ${f(LOOK.tideAt)}) / ${f(LOOK.tideWidth)};
  float tide = ${f(LOOK.tide)} * smoothstep(${f(LOOK.tideFromPx)}, ${f(LOOK.tideToPx)}, ${f(LOOK.tideWidth)} * r / px) * exp(-t * t);
  float inner = 1.0 - smoothstep(${f(LOOK.mottleMaskFrom)}, ${f(LOOK.mottleMaskTo)}, depth);
  vec2 seed = vec2(${f(LOOK.mottleSeedX)}, ${f(LOOK.mottleSeedY)}) * source;
  float mottle = 2.0 * ${f(LOOK.mottle)} * (valueNoise(l * ${f(LOOK.mottleScale)} + seed) - 0.5) * inner;
  float grains = ${f(LOOK.grainScale)} * sqrt(dot(J[0], J[0]) + dot(J[1], J[1])) * px;
  float grain = ${f(LOOK.grain)} * valueNoise(l * ${f(LOOK.grainScale)} + seed) * inner
    * (1.0 - smoothstep(${f(LOOK.grainFadeFrom)}, ${f(LOOK.grainFadeTo)}, grains));
  return uPaper * exp((body + tide) * (1.0 + mottle + grain) * uInkLog[slot]);
}

/**
 * One sample before the paper finish: rgb, and ink coverage in w. Carries J,
 * the Jacobian of the pull-back from the screen (J ← J_op(p)·J before each op moves p).
 */
vec4 shade(vec2 q, float px) {
  vec2 p = q;
  mat2 J = mat2(1.0);
  for (int i = MAX_OPS - 1; i >= 0; i--) {
    if (i >= uOpCount) continue;
    vec4 a = uOpA[i];
    vec4 b = uOpB[i];
    int type = int(a.x + 0.5);
    if (type == ${OP_DROP}) {
      vec2 d = p - a.yz;
      float l2 = dot(d, d);
      float r2 = a.w * a.w;
      if (l2 <= r2) return vec4(inkColor(clamp(int(b.x + 0.5), 0, 3), d, a.w, b.y, J, px), 1.0);
      float k = sqrt(1.0 - r2 / l2);
      float kj = max(k, ${f(RIM_SCALE_FLOOR)});
      J = (kj * mat2(1.0) + r2 / (kj * l2 * l2) * outerProduct(d, d)) * J;
      p = a.yz + d * k;
    } else if (type == ${OP_STROKE}) {
      vec2 u = b.xy;
      vec2 n = vec2(-u.y, u.x);
      float side = dot(p - a.yz, n);
      float reach = abs(side) + b.z;
      J = (mat2(1.0) + sign(side) * a.w * b.z / (reach * reach) * outerProduct(u, n)) * J;
      p -= u * (a.w * b.z / reach);
    } else if (type == ${OP_SWIRL}) {
      vec2 d = p - a.yz;
      float rho = length(d);
      float reach = rho + b.x;
      float angle = -a.w * b.x / reach;
      float c = cos(angle);
      float s = sin(angle);
      mat2 R = mat2(c, s, -s, c);
      vec2 e = R * d;
      float w = rho * rho > ${f(CENTRE_EPSILON)} ? a.w * b.x / (reach * reach * rho) : 0.0;
      J = (R + outerProduct(vec2(-e.y, e.x), w * d)) * J;
      p = a.yz + e;
    } else {
      vec2 d = p - a.yz;
      float l2 = max(dot(d, d), ${f(CENTRE_EPSILON)});
      float t = sqrt(1.0 + a.w * a.w / l2);
      J = (t * mat2(1.0) - a.w * a.w / (t * l2 * l2) * outerProduct(d, d)) * J;
      p = a.yz + d * t;
    }
  }
  float phase = groundPhase(p);
  vec3 band = mod(floor(phase), 2.0) < 0.5 ? uPaper : uBand;
  float nominal = ${f(LOOK.ruleWidth)} * uGroundPeriod;
  float rule = penLine(phase, length(groundGradient(p) * J), nominal, px);
  return vec4(mix(band, uRule, max(rule, crossLine(p, J, nominal, px))), 0.0);
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
