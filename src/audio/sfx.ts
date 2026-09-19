/**
 * Synthesised plastic sounds, no audio files.
 *
 * Each voice is a short filtered-noise tick — plastic on plastic, no pitched
 * body. `impactSamples` is pure and tested; `SfxEngine` plays the pre-rendered
 * buffers through a graph that feeds both the speakers and a
 * `MediaStreamAudioDestinationNode`, so `MemeRecorder` can record the game
 * sounds mixed with the mic.
 *
 * Graph:
 *   buffer -> voice gain -> gameBus -> { destination, recordDest }
 *   mic source -> micGain -> recordDest only (never the speakers: no feedback)
 */

export type SfxName = 'lid-tap' | 'through' | 'counter-tap' | 'settle';

interface Voice {
  /** Bandpass centres for the noise clatter, in Hz. */
  bands: number[];
  /** Noise decay time, in seconds. */
  decay: number;
  duration: number;
}

const VOICES: Record<SfxName, Voice> = {
  // Dry plastic tick against the lid.
  'lid-tap': { bands: [1600, 2800], decay: 0.014, duration: 0.06 },
  // Duller, a bit longer: piece drops into the pail.
  through: { bands: [380, 820, 1600], decay: 0.045, duration: 0.14 },
  // Soft table thud.
  'counter-tap': { bands: [500, 1100, 2000], decay: 0.022, duration: 0.08 },
  // Quiet rest, one tap.
  settle: { bands: [320, 640], decay: 0.05, duration: 0.1 },
};

export function impactSamples(kind: SfxName, sampleRate: number, seed = 1): Float32Array {
  const voice = VOICES[kind];
  const length = Math.max(1, Math.ceil(sampleRate * voice.duration));
  const samples = new Float32Array(length);
  let state = seed >>> 0;
  const rand = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const tuning = 0.94 + rand() * 0.12;

  // Low-Q bandpass filters: broad material colour, not pitched notes.
  const bands = voice.bands.map((frequency) => {
    const w = (2 * Math.PI * frequency * tuning) / sampleRate;
    const q = 0.7;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    return {
      b0: alpha / a0,
      a1: (-2 * Math.cos(w)) / a0,
      a2: (1 - alpha) / a0,
      x1: 0,
      x2: 0,
      y1: 0,
      y2: 0,
    };
  });

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const contact = (rand() * 2 - 1) * Math.exp(-t / voice.decay);
    let value = contact * 0.45 * Math.exp(-t / 0.002);
    const mix = [0.9, 0.55, 0.28];
    for (let m = 0; m < bands.length; m++) {
      const b = bands[m];
      const y = b.b0 * (contact - b.x2) - b.a1 * b.y1 - b.a2 * b.y2;
      b.x2 = b.x1;
      b.x1 = contact;
      b.y2 = b.y1;
      b.y1 = y;
      value += y * (mix[m] ?? 0.2);
    }
    const onset = Math.min(1, t / 0.00025);
    samples[i] = Math.max(-1, Math.min(1, value * onset * 0.5));
  }
  return samples;
}

export class SfxEngine {
  private context: AudioContext | null = null;
  private gameBus: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private buffers = new Map<SfxName, AudioBuffer[]>();
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private variation = 0;
  private voices = 0;
  private volume = 0.6;

  get ready(): boolean {
    return !!this.context && this.context.state === 'running';
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.context) this.initialize();
      const ctx = this.context;
      if (!ctx) return false;
      if (ctx.state !== 'running') await ctx.resume();
      return ctx.state === 'running';
    } catch {
      return false;
    }
  }

  private initialize(): void {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.context = ctx;
    const bus = ctx.createGain();
    bus.gain.value = this.volume;
    this.gameBus = bus;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.09;
    this.recordDest = ctx.createMediaStreamDestination();
    // The game is heard live AND in the recording; the limiter keeps stacked
    // clatters from clipping either one.
    bus.connect(limiter);
    limiter.connect(ctx.destination);
    bus.connect(this.recordDest);
    for (const kind of Object.keys(VOICES) as SfxName[]) {
      this.buffers.set(
        kind,
        Array.from({ length: 5 }, (_, i) => {
          const values = impactSamples(kind, ctx.sampleRate, i * 7 + 3);
          const buffer = ctx.createBuffer(1, values.length, ctx.sampleRate);
          buffer.getChannelData(0).set(values);
          return buffer;
        }),
      );
    }
  }

  /** strength 0..1, from impact speed. Silent when locked/muted. */
  play(name: SfxName, strength = 1): void {
    const ctx = this.context;
    const bus = this.gameBus;
    if (!ctx || !bus || ctx.state !== 'running' || this.voices >= 16) return;
    const set = this.buffers.get(name);
    if (!set) return;
    const s = Math.max(0, Math.min(1, strength));
    if (s <= 0.01) return;
    const source = ctx.createBufferSource();
    source.buffer = set[this.variation++ % set.length];
    source.playbackRate.value = 0.96 + Math.random() * 0.08;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600 + s * 2400;
    const gain = ctx.createGain();
    gain.gain.value = (name === 'settle' ? 0.35 : 0.55) * Math.pow(s, 0.7);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    this.voices++;
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.voices--;
    };
    source.start();
  }

  /** A single audio track with the game mix, for the recorder. Null until unlock. */
  get recordTrack(): MediaStreamTrack | null {
    return this.recordDest?.stream.getAudioTracks()[0] ?? null;
  }

  /**
   * Fold the mic into the recording mix without monitoring it locally.
   * Pass null (or a dead stream) to detach.
   */
  attachMic(stream: MediaStream | null): void {
    const ctx = this.context;
    if (!ctx || !this.recordDest) return;
    this.detachMic();
    if (!stream) return;
    const live = stream.getAudioTracks().some((t) => t.readyState === 'live');
    if (!live) return;
    try {
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micGain = ctx.createGain();
      this.micGain.gain.value = 1;
      this.micSource.connect(this.micGain);
      this.micGain.connect(this.recordDest);
    } catch {
      this.detachMic();
    }
  }

  detachMic(): void {
    try {
      this.micSource?.disconnect();
      this.micGain?.disconnect();
    } catch {
      /* already torn down */
    }
    this.micSource = null;
    this.micGain = null;
  }
}
