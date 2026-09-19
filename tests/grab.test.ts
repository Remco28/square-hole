import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARRY_Y, LID_BOTTOM_Y, LID_TOP_Y } from '../src/config';
import { holeCentres } from '../src/geometry/bodies';
import { Grabber } from '../src/sim/grab';
import { createSim } from '../src/sim/world';

afterEach(() => vi.unstubAllGlobals());

describe('touch pickup and recovery', () => {
  it('slides a grabbed piece under the pointer instead of keeping its world xz', async () => {
    const sim = await createSim();
    const piece = sim.pieces.find(p => p.spec.kind === 'square')!;
    const pos = piece.body.translation();
    const start = { x: pos.x, z: pos.z };
    const underPointer = { x: start.x + 0.4, z: start.z + 0.05 };
    vi.stubGlobal('window', new EventTarget());
    const element = new EventTarget();
    // Perspective: the same click hits the piece at its centre and the carry
    // plane further along the ray.
    const grabber = new Grabber({
      element: element as HTMLElement,
      pick: () => piece,
      atY: (_x: number, _y: number, height: number) => height > 1 ? underPointer : { x: start.x, z: start.z },
    });
    const event = new Event('pointerdown');
    Object.assign(event, { pointerId: 1, clientX: 0, clientY: 0, button: 0, pointerType: 'mouse' });
    element.dispatchEvent(event);
    expect(grabber.holding).toBe(piece);
    const target = (grabber as unknown as { target: { x: number; z: number } }).target;
    expect(target.x, 'piece should ride the pointer ray, not stay at the click xz').toBeCloseTo(underPointer.x, 5);
    expect(target.z).toBeCloseTo(underPointer.z, 5);
    sim.world.free();
  });

  it('lifts a rectangle rejected by the circle, preserves its angle, and drops dynamically', async () => {
    const sim = await createSim();
    const piece = sim.pieces.find(p => p.spec.kind === 'rectangle')!;
    const hole = holeCentres.find(h => h.kind === 'circle')!;
    piece.body.setTranslation({ x: hole.x, y: CARRY_Y, z: hole.z }, true);
    for (let i = 0; i < 480; i++) sim.step(1 / 120);
    expect(piece.body.translation().y).toBeGreaterThan(LID_BOTTOM_Y);
    vi.stubGlobal('window', new EventTarget());
    const element = new EventTarget();
    const grabber = new Grabber({ element: element as HTMLElement, pick: () => piece, atY: () => hole });
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
    // A second touch turns the piece; lifting fingers must keep holding.
    send('pointerdown');
    send('pointerdown', 2, 50, 0);
    send('pointermove', 2, 0, 50);
    sim.step(1 / 60, grabber);
    expect(Math.abs(piece.body.rotation().y)).toBeGreaterThan(0.5);
    send('pointerup');
    expect(grabber.holding).toBe(piece);
    send('pointerup', 2);
    expect(grabber.holding).toBe(piece);
    send('pointerdown');
    send('pointerup');
    expect(grabber.holding).toBeNull();
    expect(piece.body.isDynamic()).toBe(true);
    expect(piece.body.gravityScale()).toBe(1);
    sim.world.free();
  });

  it('keeps a touch-dragged piece after release, then drops on a tap', async () => {
    const sim = await createSim();
    const piece = sim.pieces[0]!;
    vi.stubGlobal('window', new EventTarget());
    const element = new EventTarget();
    const grabber = new Grabber({ element: element as HTMLElement, pick: () => piece, atY: () => ({ x: 0, z: 0 }) });
    const send = (type: string, x = 0, y = 0) => {
      const event = new Event(type);
      Object.assign(event, { pointerId: 1, clientX: x, clientY: y, button: 0, pointerType: 'touch' });
      element.dispatchEvent(event);
    };
    send('pointerdown');
    send('pointermove', 40, 0);
    send('pointerup');
    expect(grabber.holding).toBe(piece);
    send('pointerdown');
    send('pointerup');
    expect(grabber.holding).toBeNull();
    sim.world.free();
  });

  it('drops a mouse-dragged piece on release', async () => {
    const sim = await createSim();
    const piece = sim.pieces[0]!;
    vi.stubGlobal('window', new EventTarget());
    const element = new EventTarget();
    const grabber = new Grabber({ element: element as HTMLElement, pick: () => piece, atY: () => ({ x: 0, z: 0 }) });
    const send = (type: string, x = 0, y = 0) => {
      const event = new Event(type);
      Object.assign(event, { pointerId: 1, clientX: x, clientY: y, button: 0, pointerType: 'mouse' });
      element.dispatchEvent(event);
    };
    send('pointerdown');
    send('pointermove', 40, 0);
    send('pointerup');
    expect(grabber.holding).toBeNull();
    sim.world.free();
  });

  it('aims a touch carry above the finger', async () => {
    const sim = await createSim();
    const piece = sim.pieces[0]!;
    vi.stubGlobal('window', new EventTarget());
    const element = new EventTarget();
    const carryY: number[] = [];
    const grabber = new Grabber({
      element: element as HTMLElement,
      pick: () => piece,
      atY: (_x: number, y: number, height: number) => {
        if (height > 1) carryY.push(y);
        return { x: 0, z: 0 };
      },
    });
    const event = new Event('pointerdown');
    Object.assign(event, { pointerId: 1, clientX: 10, clientY: 200, button: 0, pointerType: 'touch' });
    element.dispatchEvent(event);
    expect(grabber.holding).toBe(piece);
    expect(carryY[0]).toBe(200 - 64);
    sim.world.free();
  });
});
