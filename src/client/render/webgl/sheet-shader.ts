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
uniform vec3 uGhostColor;
uniform vec3 uInks[4];
uniform float uGhost;

uniform int uGroundFamily;    // 0 bands/combed, 1 chevron, 2 waves, 3 grid, 4 rings
uniform float uGroundPeriod;
uniform vec2 uGroundRot;      // (cos, sin) of the stripe angle
uniform float uGroundAmplitude;
uniform float uGroundWavelength;

float hash(vec2 p) { return fract(sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453); }

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
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

/** A grid's crossing lines at a given line width; 0 everywhere else. */
float crossLineW(vec2 p, float width) {
  if (uGroundFamily != 3) return 0.0;
  vec2 d = p - uSheet * 0.5;
  float s = d.x * uGroundRot.x + d.y * uGroundRot.y;
  return hairline(s / uGroundPeriod, width);
}
float crossLine(vec2 p) { return crossLineW(p, ${f(LOOK.ruleWidth)}); }

float paperTexture(vec2 p) {
  float fibre = valueNoise(vec2(p.x * ${f(LOOK.paperFibreScale)}, p.y * ${f(LOOK.paperFibreScale)} * 0.35)) - 0.5;
  float laid = cos(p.y / ${f(LOOK.laidSpacing)} * TAU) * 0.5;
  float cx = fract(p.x / ${f(LOOK.chainSpacing)}) - 0.5;
  float chain = exp(-cx * cx * 900.0);
  return 1.0 + fibre * ${f(LOOK.paperFibre)} * 2.0 + laid * ${f(LOOK.laidStrength)} - chain * ${f(LOOK.chainStrength)};
}

vec3 shade(vec2 q) {
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
      if (l2 <= r2) {
        float depth = a.w > 0.0 ? sqrt(l2) / a.w : 1.0;
        vec3 ink = uInks[clamp(int(b.x + 0.5), 0, 3)];
        float rim = 1.0 - ${f(LOOK.rimStrength)} * smoothstep(${f(LOOK.rimStart)}, 1.0, depth);
        float grain = 1.0 + (valueNoise(vec2(depth * ${f(LOOK.inkGrainScale)} * 6.0, b.y * 7.31)) - 0.5) * ${f(LOOK.inkGrain)} * 2.0;
        return mix(uPaper, ink * rim * grain, ${f(LOOK.inkOpacity)});
      }
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
  return mix(band, uRule, max(hairline(phase, ${f(LOOK.ruleWidth)}), crossLine(p)));
}

vec3 toSrgb(vec3 c) {
  vec3 lo = 12.92 * c;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  vec2 cell = uSheet / uResolution;
  vec2 base = vUv * uSheet;
  // 4-sample rotated grid: crisp ink edges at any device pixel ratio.
  vec3 color = vec3(0.0);
  color += shade(base + cell * vec2(-0.125, -0.375));
  color += shade(base + cell * vec2(0.375, -0.125));
  color += shade(base + cell * vec2(0.125, 0.375));
  color += shade(base + cell * vec2(-0.375, 0.125));
  color *= 0.25 * paperTexture(base);
  if (uGhost > 0.0) {
    float line = max(hairline(groundPhase(base), ${f(LOOK.ghostWidth)}), crossLineW(base, ${f(LOOK.ghostWidth)})) * uGhost * 0.7;
    color = mix(color, uGhostColor, line);
  }
  outColor = vec4(toSrgb(color), 1.0);
}`;
