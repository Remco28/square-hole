import { beforeAll, describe, expect, it } from 'vitest';
import {
  CARRY_LIFT,
  LID_BOTTOM_Y,
  LID_TOP_Y,
  PAIL_DEPTH,
  PAIL_OUTER_R,
  PAIL_WALL,
  PIECE_T,
  U,
} from '../src/config';
import { holeCentres } from '../src/geometry/bodies';
import { SHAPES } from '../src/geometry/profiles';
import { BucketDump } from '../src/sim/dump';
import { createSim, type Piece, type Sim } from '../src/sim/world';

/**
 * The end of the round: seat every piece, and the pail gets emptied.
 *
 * This is the same bargain the rest of the suite makes — no rendering, just the
 * real Rapier world — and it is the only place the pail, its floor and the two
 * kinematic bodies are exercised at all. The pour is the one behaviour that has
 * nowhere to hide if it is wrong: either the pieces come out of the pail or they
 * do not.
 */

let sim: Sim;

beforeAll(async () => {
  sim = await createSim();
});

const bore = U(PAIL_OUTER_R - PAIL_WALL);

/**
 * Turns a world offset into the pail's own frame.
 *
 * Necessary because the whole point of the dump is that the pail stops being
 * where it was. Asking whether a piece is "inside the pail" against the pail's
 * resting footprint would report every piece as out the moment the pail moved,
 * whichever way the pour had gone.
 */
function intoPailFrame(point: { x: number; y: number; z: number }): {
  x: number;
  y: number;
  z: number;
} {
  const origin = sim.pail.translation();
  const q = sim.pail.rotation();
  const d = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
  const inverse = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  const tx = 2 * (inverse.y * d.z - inverse.z * d.y);
  const ty = 2 * (inverse.z * d.x - inverse.x * d.z);
  const tz = 2 * (inverse.x * d.y - inverse.y * d.x);
  return {
    x: d.x + inverse.w * tx + (inverse.y * tz - inverse.z * ty),
    y: d.y + inverse.w * ty + (inverse.z * tx - inverse.x * tz),
    z: d.z + inverse.w * tz + (inverse.x * ty - inverse.y * tx),
  };
}

/** Is the piece still down in the tub, wherever the tub happens to be? */
function inThePail(piece: Piece): boolean {
  const local = intoPailFrame(piece.body.translation());
  return (
    Math.hypot(local.x, local.z) < bore &&
    local.y > -U(PIECE_T) &&
    local.y < U(PAIL_DEPTH)
  );
}

/**
 * Fills the pail.
 *
 * `byTheRules` seats each piece in its own hole, which is how the toy is meant
 * to be used. `theJoke` sends every piece down the square hole instead, one after
 * another, so they pile up wherever they land. Both have to pour, and the messier
 * of the two is the one worth testing: it is the natural way to play this game,
 * and it is the arrangement that found the pour being held up by friction.
 */
function fillThePail(how: 'byTheRules' | 'theJoke' = 'byTheRules'): void {
  sim.reset();
  for (const spec of SHAPES) {
    const piece = sim.pieces.find((candidate) => candidate.spec.kind === spec.kind);
    const wanted = how === 'byTheRules' ? spec.kind : 'square';
    const hole = holeCentres.find((candidate) => candidate.kind === wanted);
    if (!piece || !hole) throw new Error(`no ${spec.kind} piece or ${wanted} hole`);

    piece.body.setTranslation(
      { x: hole.x, y: LID_TOP_Y + U(CARRY_LIFT), z: hole.z },
      true,
    );
    piece.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.setGravityScale(1, true);
    for (let i = 0; i < 300; i++) sim.step(1 / 120);
  }
}

/**
 * Runs the show to its end, and reports where the pieces were the last time the
 * show still thought it was settling them.
 *
 * That snapshot is the whole point. The show ends by sending the pieces home, so
 * checking where they are afterwards proves nothing about the pour — it only
 * proves the reset works. The last settled frame is the moment the game decided
 * the pieces had stopped, and it happens before the reset touches them.
 */
function runTheShow(dump: BucketDump): {
  steps: number;
  settled: { x: number; y: number; z: number }[] | null;
} {
  const cap = 120 * 40;
  let steps = 0;
  let settled: { x: number; y: number; z: number }[] | null = null;

  while (dump.active && steps < cap) {
    sim.step(1 / 120, dump);
    steps++;
    if (dump.current === 'settle') {
      settled = sim.pieces.map((piece) => ({ ...piece.body.translation() }));
    }
  }
  return { steps, settled };
}

describe('emptying the pail', () => {
  it('treats a seated round as the end of the game', () => {
    sim.reset();
    expect(sim.allBuried()).toBe(false);
    fillThePail();
    expect(sim.allBuried()).toBe(true);
  });

  it('does not call a part-finished round over', () => {
    fillThePail();
    const piece = sim.pieces[0];
    const home = piece.home;
    piece.body.setTranslation(home, true);
    for (let i = 0; i < 240; i++) sim.step(1 / 120);
    expect(sim.allBuried()).toBe(false);
  });

  it.each([
    ['by the rules', 'byTheRules'],
    ['through the square hole', 'theJoke'],
  ] as const)('pours them out and puts everything back, filled %s', (_label, how) => {
    fillThePail(how);
    expect(sim.asleep()).toBe(true);

    const dump = new BucketDump(sim);
    dump.start();
    expect(dump.active).toBe(true);

    const { steps, settled } = runTheShow(dump);
    expect(steps).toBeLessThan(120 * 40);
    expect(dump.active).toBe(false);
    expect(settled).not.toBeNull();

    // The pour happened: by the time the pieces had stopped moving, not one of
    // them was still down in the tub. Checked in the pail's own tipped frame, so
    // this cannot pass just because the pail moved away from under them.
    settled?.forEach((position, index) => {
      const piece = sim.pieces[index];
      const local = intoPailFrame(position);
      expect(
        Math.hypot(local.x, local.z) < bore && local.y > -U(PIECE_T) && local.y < U(PAIL_DEPTH),
        `${piece.spec.label} never left the pail: local ${local.x.toFixed(2)}, ${local.y.toFixed(2)}, ${local.z.toFixed(2)}`,
      ).toBe(false);
    });

    // They came to rest on the counter, not perched somewhere on the pail.
    for (const position of settled ?? []) {
      expect(position.y).toBeLessThan(LID_BOTTOM_Y);
    }

    // After the reset, still nothing is down there.
    for (const piece of sim.pieces) {
      expect(inThePail(piece), `${piece.spec.label} ended up back in the pail`).toBe(false);
    }
    expect(sim.allBuried()).toBe(false);

    // And it reset them: every piece is back home and lying on the counter.
    for (const piece of sim.pieces) {
      const position = piece.body.translation();
      const travelled = Math.hypot(
        position.x - piece.home.x,
        position.y - piece.home.y,
        position.z - piece.home.z,
      );
      expect(travelled, `${piece.spec.label} did not go home`).toBeLessThan(U(2));
      expect(position.y).toBeCloseTo(U(PIECE_T) / 2, 1);
    }

    // The toy itself is back together, not left tipped.
    const pail = sim.pail.translation();
    expect(Math.hypot(pail.x, pail.y, pail.z)).toBeLessThan(U(1));
    const lid = sim.lid.translation();
    expect(lid.y).toBeCloseTo(LID_TOP_Y, 2);
    expect(lid.z).toBeCloseTo(0, 2);
  });

  it('can be cut short without leaving the pail tipped', () => {
    fillThePail();
    const dump = new BucketDump(sim);
    dump.start();
    // Far enough in that the pail is properly over on its side.
    for (let i = 0; i < 120 * 2; i++) sim.step(1 / 120, dump);
    expect(dump.active).toBe(true);

    dump.abort();
    sim.reset();
    expect(dump.active).toBe(false);

    const pail = sim.pail.translation();
    expect(Math.hypot(pail.x, pail.y, pail.z)).toBeLessThan(U(1));
  });
});
