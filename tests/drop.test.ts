import { beforeAll, describe, expect, it } from 'vitest';
import { CARRY_LIFT, LID_BOTTOM_Y, LID_TOP_Y, PAIL_OUTER_R, U } from '../src/config';
import { holeCentres } from '../src/geometry/bodies';
import { SHAPES, type ShapeKind } from '../src/geometry/profiles';
import { createSim, type Piece, type Sim } from '../src/sim/world';

/**
 * The real proof, and the reason the mesh and the collider are the same vertices:
 * build the actual Rapier world, drop an actual piece at an actual hole, and see
 * whether it ends up inside the pail. No rendering, no browser.
 *
 * A piece has reached the pail when it sits below the lid and inside the pail's
 * wall. Jamming in the countersink and clattering off onto the counter both count
 * as not getting through, which is exactly the distinction the game is made of.
 *
 * These drops are the shape of the game, not a stress test: dead centre over the
 * hole, released from the height a carried piece rides at.
 */

let sim: Sim;

beforeAll(async () => {
  sim = await createSim();
});

const yawQuaternion = (degrees: number) => {
  const yaw = (degrees * Math.PI) / 180;
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
};

function insidePail(piece: Piece): boolean {
  const position = piece.body.translation();
  return position.y < LID_BOTTOM_Y && Math.hypot(position.x, position.z) < U(PAIL_OUTER_R);
}

function drop(kind: ShapeKind, holeKind: ShapeKind, yawDeg = 0, offsetMm = 0): boolean {
  sim.reset();
  const piece = sim.pieces.find((candidate) => candidate.spec.kind === kind);
  const hole = holeCentres.find((candidate) => candidate.kind === holeKind);
  if (!piece || !hole) throw new Error(`no ${kind} piece or ${holeKind} hole`);

  piece.body.setTranslation(
    { x: hole.x + U(offsetMm), y: LID_TOP_Y + U(CARRY_LIFT), z: hole.z },
    true,
  );
  piece.body.setRotation(yawQuaternion(yawDeg), true);
  piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

  // Four seconds at the sim's own fixed step.
  for (let i = 0; i < 480; i++) sim.step(1 / 120);
  return insidePail(piece);
}

describe('the square hole takes everything', () => {
  it.each(SHAPES.map((spec) => [spec.label, spec.kind] as const))(
    'drops the %s in',
    (_label, kind) => {
      expect(drop(kind, 'square', 0)).toBe(true);
    },
  );

  it('still takes them when the player is a millimetre or two off', () => {
    // This is what the countersink at the top of each hole is for.
    expect(drop('square', 'square', 0, 2)).toBe(true);
    expect(drop('circle', 'square', 0, -2)).toBe(true);
    expect(drop('triangle', 'square', 0, 2)).toBe(true);
  });

  it('refuses a square presented corner-first', () => {
    expect(drop('square', 'square', 45)).toBe(false);
  });

  it('refuses a house turned across the hole', () => {
    expect(drop('house', 'square', 45)).toBe(false);
  });
});

describe('the other holes still mean something', () => {
  it.each([
    ['square', 'square'],
    ['rectangle', 'rectangle'],
    ['circle', 'circle'],
    ['triangle', 'triangle'],
    ['house', 'house'],
  ] as const)('takes the %s piece in its own hole', (kind, hole) => {
    expect(drop(kind, hole, 0)).toBe(true);
  });

  it('refuses the square in the round hole at any angle', () => {
    expect(drop('square', 'circle', 0)).toBe(false);
    expect(drop('square', 'circle', 45)).toBe(false);
  });

  it('refuses pieces in holes they do not belong to', () => {
    expect(drop('square', 'triangle')).toBe(false);
    expect(drop('square', 'rectangle')).toBe(false);
    expect(drop('rectangle', 'circle')).toBe(false);
    expect(drop('circle', 'triangle')).toBe(false);
    expect(drop('house', 'circle')).toBe(false);
  });
});
