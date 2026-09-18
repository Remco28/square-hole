import RAPIER from '@dimforge/rapier3d-compat';
import type { BufferGeometry } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { LID_R, LID_T, SQUARE_HOLE, U } from '../src/config';
import { holeCentres, lidGeometry, pailGeometry, pieceGeometry } from '../src/geometry/bodies';
import { SHAPES } from '../src/geometry/profiles';
import { createSim } from '../src/sim/world';

/**
 * The lid is generated rather than authored, so it needs invariants of its own.
 *
 * The important one is the winding: Rapier is told these meshes are `ORIENTED`,
 * which means "normals point outwards and this surface encloses a solid". If the
 * caps and walls are not wound consistently, that claim is false and the physics
 * goes strange in ways that are painful to debug. A closed, consistently wound
 * mesh has positive signed volume, so that is what is checked.
 */

function signedVolume(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) throw new Error('expected an indexed geometry');
  let total = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const ax = position.getX(a);
    const ay = position.getY(a);
    const az = position.getZ(a);
    const bx = position.getX(b);
    const by = position.getY(b);
    const bz = position.getZ(b);
    const cx = position.getX(c);
    const cy = position.getY(c);
    const cz = position.getZ(c);
    total += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return total / 6;
}

describe('generated solids', () => {
  it('winds every solid outwards', () => {
    expect(signedVolume(lidGeometry())).toBeGreaterThan(0);
    expect(signedVolume(pailGeometry())).toBeGreaterThan(0);
    for (const spec of SHAPES) {
      expect(signedVolume(pieceGeometry(spec)), `${spec.label} winding`).toBeGreaterThan(0);
    }
  });

  it('builds a lid the size of the spec, with no NaN vertices', () => {
    const geometry = lidGeometry();
    const position = geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(500);
    for (let i = 0; i < position.array.length; i++) {
      expect(Number.isFinite(position.array[i])).toBe(true);
    }
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box?.max.x).toBeCloseTo(U(LID_R), 6);
    expect(box?.max.y).toBeCloseTo(0, 6);
    expect(box?.min.y).toBeCloseTo(-U(LID_T), 6);
  });
});

describe('the assembled lid', () => {
  beforeAll(async () => {
    RAPIER.init && (await RAPIER.init());
  });

  it('has every hole open and the rest of the plate solid', async () => {
    const sim = await createSim();
    // Ray casts need the broad phase, which is built during a step.
    for (let i = 0; i < 2; i++) sim.step(1 / 120);

    const shootDown = (x: number, z: number): number => {
      const hit = sim.world.castRay(new RAPIER.Ray({ x, y: 2, z }, { x: 0, y: -1, z: 0 }), 4, true);
      return hit ? 2 - hit.timeOfImpact : -1;
    };

    for (const hole of holeCentres) {
      expect(shootDown(hole.x, hole.z), `${hole.kind} hole should be open`).toBeLessThan(0.05);
    }
    expect(shootDown(0, 0)).toBeGreaterThan(0.8);
    expect(shootDown(U(70), 0)).toBeGreaterThan(0.8);

    // The square hole really is the size the fit tests assume.
    const open: number[] = [];
    for (let i = -160; i <= 160; i++) {
      const dx = i * 0.001;
      if (shootDown(U(42 * Math.cos(Math.PI / 2)) + dx, U(42)) < 0.05) open.push(dx);
    }
    // Within one step of the 1 mm ray spacing.
    expect(Math.max(...open) - Math.min(...open)).toBeCloseTo(U(SQUARE_HOLE), 2);
  });
});
