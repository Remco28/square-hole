import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARRY_Y, LID_BOTTOM_Y, LID_TOP_Y } from '../src/config';
import { holeCentres } from '../src/geometry/bodies';
import { Grabber } from '../src/sim/grab';
import { createSim } from '../src/sim/world';

afterEach(() => vi.unstubAllGlobals());

describe('touch pickup and recovery', () => {
  it('lifts a rectangle rejected by the circle, preserves its angle, and drops dynamically', async () => {
    const sim = await createSim();
      const piece = sim.pieces.find(p => p.spec.kind === 'rectangle')!;
      const hole = holeCentres.find(h => h.kind === 'circle')!;
      piece.body.setTranslation({ x: hole.x, y: CARRY_Y, z: hole.z }, true);
      for (let i = 0; i < 480; i++) sim.step(1 / 120);
      expect(piece.body.translation().y).toBeGreaterThan(LID_BOTTOM_Y);
      vi.stubGlobal('window', new EventTarget());
      const element = new EventTarget();
      const grabber = new Grabber({ element: element as HTMLElement, pick: () => piece, plane: () => hole });
      const send = (type: string, pointerId = 1, x = 0, y = 0) => {
        const event = new Event(type);
        Object.assign(event, { pointerId, clientX: x, clientY: y, button: 0, pointerType: 'touch' });
        element.dispatchEvent(event);
      };
      send('pointerdown');
      send('pointerup');
      expect(grabber.holding).toBe(piece);
      for (let i = 0; i < 120; i++) sim.step(1 / 120, grabber);
      expect(piece.body.translation().y).toBeGreaterThan(LID_TOP_Y + 0.18);
      expect(piece.body.translation().y).toBeCloseTo(CARRY_Y, 3);
      // A second touch turns the piece; lifting the first finger must not drop it.
      send('pointerdown');
      send('pointerdown', 2, 50, 0);
      send('pointermove', 2, 0, 50);
      sim.step(1 / 60, grabber);
      expect(Math.abs(piece.body.rotation().y)).toBeGreaterThan(0.5);
      send('pointerup');
      expect(grabber.holding).toBe(piece);
      send('pointerup', 2);
      expect(grabber.holding).toBeNull();
      expect(piece.body.isDynamic()).toBe(true);
      expect(piece.body.gravityScale()).toBe(1);
    sim.world.free();
  });
});
