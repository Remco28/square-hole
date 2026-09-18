import { describe, expect, it } from 'vitest';
import { LID_BOTTOM_Y, LID_TOP_Y, U } from '../src/config';
import { ImpactWatcher, type BodyReading } from '../src/audio/impacts';

/**
 * The watcher turns per-frame body readings into sound events, with the same
 * zones the game reasons about: above the lid, through it, back on the table.
 * No Rapier here — just the state machine, fed synthetic frames.
 */

const rest = (overrides: Partial<BodyReading> = {}): BodyReading => ({
  x: 0,
  y: LID_TOP_Y + U(20),
  z: 0,
  vy: 0,
  speed: 0,
  ...overrides,
});

describe('ImpactWatcher', () => {
  it('starts quiet and voices a through when a piece crosses the plate', () => {
    const watcher = new ImpactWatcher();
    expect(watcher.observe([rest()], true, 0)).toEqual([]);
    // Falling fast above the lid: no sound yet.
    expect(
      watcher.observe([rest({ vy: -6, speed: 6 })], false, 0.01),
    ).toEqual([]);
    // Now below the plate, still falling: the through.
    const hits = watcher.observe(
      [rest({ y: (LID_TOP_Y + LID_BOTTOM_Y) / 2, vy: -5, speed: 5 })],
      false,
      0.02,
    );
    expect(hits.map((h) => h.name)).toEqual(['through']);
    expect(hits[0].strength).toBeGreaterThan(0);
    expect(hits[0].strength).toBeLessThanOrEqual(1);
  });

  it('taps the lid when a fall stops on the plate', () => {
    const watcher = new ImpactWatcher();
    watcher.observe([rest()], true, 0);
    watcher.observe([rest({ vy: -6, speed: 6 })], false, 0.01);
    const hits = watcher.observe(
      [rest({ y: LID_TOP_Y + U(2), vy: 0.2, speed: 0.2 })],
      false,
      0.02,
    );
    expect(hits.map((h) => h.name)).toEqual(['lid-tap']);
  });

  it('taps the counter when a piece lands back on the table', () => {
    const watcher = new ImpactWatcher();
    watcher.observe([rest()], true, 0);
    // Falling fast but still above the plate: no sound yet.
    expect(
      watcher.observe([rest({ y: LID_TOP_Y + U(10), vy: -5, speed: 5 })], false, 0.01),
    ).toEqual([]);
    const hits = watcher.observe(
      [rest({ y: U(9) / 2 + U(4), vy: 0, speed: 0 })],
      false,
      0.02,
    );
    expect(hits.map((h) => h.name)).toEqual(['counter-tap']);
  });

  it('settles once after a noisy spell stops', () => {
    const watcher = new ImpactWatcher();
    watcher.observe([rest()], true, 0);
    watcher.observe([rest({ vy: -6, speed: 6 })], false, 0.01);
    watcher.observe(
      [rest({ y: (LID_TOP_Y + LID_BOTTOM_Y) / 2, vy: -5, speed: 5 })],
      false,
      0.02,
    );
    // Still falling inside the pail: no settle yet.
    expect(
      watcher.observe([rest({ y: U(30), vy: -2, speed: 2 })], false, 0.5),
    ).toEqual([]);
    // Landing day: the counter tap voices, and the hush after it settles.
    const hits = watcher.observe([rest({ y: 0.05, vy: 0, speed: 0 })], true, 0.6);
    expect(hits.map((h) => h.name)).toContain('settle');
    // Settled stays quiet afterwards.
    expect(watcher.observe([rest({ y: 0.05, vy: 0, speed: 0 })], true, 0.7)).toEqual([]);
  });

  it('debounces a rattling piece', () => {
    const watcher = new ImpactWatcher();
    watcher.observe([rest()], true, 0);
    watcher.observe([rest({ vy: -6, speed: 6 })], false, 0.01);
    const first = watcher.observe(
      [rest({ y: LID_TOP_Y + U(2), vy: 0.2, speed: 0.2 })],
      false,
      0.02,
    );
    const second = watcher.observe(
      [rest({ y: LID_TOP_Y + U(2), vy: -6, speed: 6 })],
      false,
      0.03,
    );
    expect(first.length).toBe(1);
    // 10 ms later: still in cooldown, no double clatter.
    expect(second).toEqual([]);
  });
});
