import { SHEET } from '../../../shared/config.ts';
import { MAX_RENDER_OPS, type SheetFrame, type SheetRenderer } from '../renderer.ts';
import {
  FRAGMENT_SHADER,
  GROUND_FAMILY_CODES,
  OP_DROP,
  OP_STROKE,
  OP_SUCTION,
  VERTEX_SHADER,
} from './sheet-shader.ts';

const UNIFORMS = [
  'uSheet',
  'uResolution',
  'uOpCount',
  'uOpA',
  'uOpB',
  'uPaper',
  'uBand',
  'uRule',
  'uGhostColor',
  'uInks',
  'uGhost',
  'uGroundFamily',
  'uGroundPeriod',
  'uGroundRot',
  'uGroundAmplitude',
  'uGroundWavelength',
] as const;

type UniformName = (typeof UNIFORMS)[number];

export class WebGlUnavailableError extends Error {
  constructor(reason: string) {
    super(`WebGL2 unavailable: ${reason}`);
    this.name = 'WebGlUnavailableError';
  }
}

const compile = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new WebGlUnavailableError('cannot create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new WebGlUnavailableError(`shader compilation failed: ${log}`);
  }
  return shader;
};

/** Fragment-shader sheet renderer: the bath is evaluated per pixel on the GPU. */
export class WebGlSheetRenderer implements SheetRenderer {
  readonly kind = 'webgl';
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #buffer: WebGLBuffer;
  readonly #uniforms = new Map<UniformName, WebGLUniformLocation | null>();
  readonly #opA = new Float32Array(MAX_RENDER_OPS * 4);
  readonly #opB = new Float32Array(MAX_RENDER_OPS * 4);
  readonly #inks = new Float32Array(12);

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new WebGlUnavailableError('no context');
    this.#gl = gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new WebGlUnavailableError(`link failed: ${gl.getProgramInfoLog(program) ?? ''}`);
    }
    this.#program = program;
    this.#buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);
    for (const name of UNIFORMS) this.#uniforms.set(name, gl.getUniformLocation(program, name));
  }

  resize(width: number, height: number): void {
    const canvas = this.#gl.canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    this.#gl.viewport(0, 0, width, height);
  }

  render(frame: SheetFrame): void {
    const gl = this.#gl;
    const u = (name: UniformName): WebGLUniformLocation | null => this.#uniforms.get(name) ?? null;
    const count = Math.min(frame.ops.length, MAX_RENDER_OPS);
    this.#opA.fill(0);
    this.#opB.fill(0);
    for (let i = 0; i < count; i++) {
      const op = frame.ops[i];
      if (!op) continue;
      const o = i * 4;
      if (op.type === 'drop') {
        this.#opA.set([OP_DROP, op.cx, op.cy, op.r], o);
        this.#opB.set([op.ink, op.source, 0, 0], o);
      } else if (op.type === 'stroke') {
        this.#opA.set([OP_STROKE, op.bx, op.by, op.shift], o);
        this.#opB.set([op.ux, op.uy, op.falloff, op.source], o);
      } else {
        this.#opA.set([OP_SUCTION, op.cx, op.cy, op.r], o);
      }
    }
    const { palette, ground } = frame;
    palette.inks.slice(0, 4).forEach((ink, i) => this.#inks.set(ink, i * 3));
    const angle = (ground.angle * Math.PI) / 180;

    gl.useProgram(this.#program);
    gl.uniform2f(u('uSheet'), SHEET.cols, SHEET.rows);
    gl.uniform2f(u('uResolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1i(u('uOpCount'), count);
    gl.uniform4fv(u('uOpA'), this.#opA);
    gl.uniform4fv(u('uOpB'), this.#opB);
    gl.uniform3fv(u('uPaper'), palette.paper);
    gl.uniform3fv(u('uBand'), palette.band);
    gl.uniform3fv(u('uRule'), palette.rule);
    gl.uniform3fv(u('uGhostColor'), palette.ghost);
    gl.uniform3fv(u('uInks'), this.#inks);
    gl.uniform1f(u('uGhost'), frame.ghost);
    gl.uniform1i(u('uGroundFamily'), GROUND_FAMILY_CODES[ground.family]);
    gl.uniform1f(u('uGroundPeriod'), ground.period);
    gl.uniform2f(u('uGroundRot'), Math.cos(angle), Math.sin(angle));
    gl.uniform1f(u('uGroundAmplitude'), ground.amplitude);
    gl.uniform1f(u('uGroundWavelength'), ground.wavelength);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    this.#gl.deleteBuffer(this.#buffer);
    this.#gl.deleteProgram(this.#program);
    this.#gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
