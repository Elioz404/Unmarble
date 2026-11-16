/**
 * Small synthesised sound palette: water and paper, never music.
 *
 * Platform rules: no sound before the player interacts, a visible mute, and
 * silence when the post leaves the screen. The context is created lazily on
 * the first user gesture and suspended on `visibilitychange`.
 */
export type SoundCue = 'absorb' | 'unstroke' | 'unswirl' | 'tear' | 'miss' | 'clean' | 'lens';

type Voice = (ctx: AudioContext, out: AudioNode, at: number) => void;

const noiseBuffer = (ctx: AudioContext, seconds: number): AudioBuffer => {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buffer;
};

const envelope = (param: AudioParam, at: number, peak: number, attack: number, release: number): void => {
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(peak, at + attack);
  param.exponentialRampToValueAtTime(0.0001, at + attack + release);
};

const noise = (
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  o: { filter: BiquadFilterType; from: number; to: number; q: number; peak: number; attack: number; release: number },
): void => {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, o.attack + o.release + 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter;
  filter.Q.value = o.q;
  filter.frequency.setValueAtTime(o.from, at);
  filter.frequency.exponentialRampToValueAtTime(o.to, at + o.attack + o.release);
  const gain = ctx.createGain();
  envelope(gain.gain, at, o.peak, o.attack, o.release);
  source.connect(filter).connect(gain).connect(out);
  source.start(at);
  source.stop(at + o.attack + o.release + 0.05);
};

const drop = (ctx: AudioContext, out: AudioNode, at: number, from: number, to: number, peak: number): void => {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + 0.16);
  const gain = ctx.createGain();
  envelope(gain.gain, at, peak, 0.006, 0.18);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + 0.22);
};

const VOICES: Record<SoundCue, Voice> = {
  // A drop drawn back into water: falling bloop plus a soft sip.
  absorb: (ctx, out, at) => {
    drop(ctx, out, at, 520, 180, 0.16);
    noise(ctx, out, at + 0.02, { filter: 'bandpass', from: 1800, to: 600, q: 1.2, peak: 0.05, attack: 0.03, release: 0.25 });
  },
  // A stylus dragged back through the bath.
  unstroke: (ctx, out, at) =>
    noise(ctx, out, at, { filter: 'bandpass', from: 500, to: 1400, q: 2, peak: 0.07, attack: 0.08, release: 0.35 }),
  // Water turned back around an eye: a slow rising whirl.
  unswirl: (ctx, out, at) =>
    noise(ctx, out, at, { filter: 'bandpass', from: 350, to: 1800, q: 4, peak: 0.07, attack: 0.15, release: 0.45 }),
  // Paper tearing: a short crackle of high noise.
  tear: (ctx, out, at) => {
    noise(ctx, out, at, { filter: 'highpass', from: 2500, to: 1200, q: 0.8, peak: 0.12, attack: 0.005, release: 0.18 });
    noise(ctx, out, at + 0.07, { filter: 'bandpass', from: 3200, to: 1500, q: 3, peak: 0.06, attack: 0.004, release: 0.12 });
  },
  miss: (ctx, out, at) => drop(ctx, out, at, 260, 220, 0.04),
  // The stripes running straight: a rising zip and a sheet lifted from water.
  clean: (ctx, out, at) => {
    noise(ctx, out, at, { filter: 'bandpass', from: 300, to: 3200, q: 1.5, peak: 0.07, attack: 0.5, release: 0.3 });
    noise(ctx, out, at + 0.75, { filter: 'lowpass', from: 2000, to: 400, q: 0.7, peak: 0.08, attack: 0.05, release: 0.6 });
  },
  lens: (ctx, out, at) => drop(ctx, out, at, 880, 660, 0.05),
};

export class SoundBank {
  #context: AudioContext | null = null;
  #master: GainNode | null = null;
  #muted: boolean;
  readonly #onMuteChange: (muted: boolean) => void;

  constructor(muted: boolean, onMuteChange: (muted: boolean) => void) {
    this.#muted = muted;
    this.#onMuteChange = onMuteChange;
  }

  /**
   * Follows page visibility while attached; returns the matching teardown.
   * Symmetric so it survives React's mount → unmount → mount in StrictMode.
   */
  attach(): () => void {
    document.addEventListener('visibilitychange', this.#onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', this.#onVisibility);
      void this.#context?.close();
      this.#context = null;
      this.#master = null;
    };
  }

  get muted(): boolean {
    return this.#muted;
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    if (this.#master) this.#master.gain.value = muted ? 0 : 1;
    this.#onMuteChange(muted);
  }

  /** Must be called from a user gesture before the first cue can sound. */
  unlock(): void {
    if (this.#context) {
      void this.#context.resume();
      return;
    }
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    this.#context = new AudioContextClass();
    this.#master = this.#context.createGain();
    this.#master.gain.value = this.#muted ? 0 : 1;
    this.#master.connect(this.#context.destination);
  }

  play(cue: SoundCue): void {
    const ctx = this.#context;
    if (!ctx || !this.#master || this.#muted || ctx.state !== 'running') return;
    VOICES[cue](ctx, this.#master, ctx.currentTime + 0.01);
  }

  readonly #onVisibility = (): void => {
    if (!this.#context) return;
    if (document.hidden) void this.#context.suspend();
    else void this.#context.resume();
  };
}
