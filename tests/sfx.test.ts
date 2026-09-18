import { describe, expect, it } from 'vitest';
import { impactSamples, type SfxName } from '../src/audio/sfx';

/**
 * The synth voices are pure functions of (kind, sampleRate, seed), so their
 * invariants hold without an AudioContext: finite samples, the right length,
 * audibly non-silent, and deterministic per seed.
 */

const KINDS: SfxName[] = ['lid-tap', 'through', 'counter-tap', 'settle'];
const energy = (samples: Float32Array): number => {
  let total = 0;
  for (const s of samples) total += s * s;
  return total / samples.length;
};

describe('synth voices', () => {
  for (const kind of KINDS) {
    it(`renders a finite ${kind} of the right length`, () => {
      const rate = 44100;
      const samples = impactSamples(kind, rate, 3);
      expect(samples.length).toBeGreaterThan(rate * 0.05);
      for (const s of samples) expect(Number.isFinite(s)).toBe(true);
    });
  }

  it('is louder than silence and quieter than clipping', () => {
    for (const kind of KINDS) {
      const samples = impactSamples(kind, 48000, 3);
      expect(energy(samples)).toBeGreaterThan(1e-4);
      for (const s of samples) expect(Math.abs(s)).toBeLessThanOrEqual(1);
    }
  });

  it('varies the seed without changing the shape of the sound', () => {
    const a = impactSamples('through', 44100, 3);
    const b = impactSamples('through', 44100, 10);
    expect(energy(a)).toBeGreaterThan(0);
    expect(energy(b)).toBeGreaterThan(0);
    // Same voice, different dice: energies within a factor of two.
    expect(energy(a) / energy(b)).toBeGreaterThan(0.5);
    expect(energy(a) / energy(b)).toBeLessThan(2);
  });

  it('lands the settle twice', () => {
    const samples = impactSamples('settle', 44100, 3);
    const half = Math.floor(samples.length / 2);
    const first = energy(samples.slice(0, half));
    const second = energy(samples.slice(half));
    // The second tap is the main one; the first half must still carry sound.
    expect(first).toBeGreaterThan(1e-4);
    expect(second).toBeGreaterThan(1e-4);
  });
});
