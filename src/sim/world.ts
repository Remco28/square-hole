import RAPIER from '@dimforge/rapier3d-compat';
import type { BufferGeometry, Mesh } from 'three';
import {
  COUNTER_HALF,
  FIXED_DT,
  GRAVITY_Y,
  LID_BOTTOM_Y,
  LID_TOP_Y,
  PAIL_FLOOR_T,
  PAIL_OUTER_R,
  PAIL_WALL,
  PIECE_T,
  SETTLE_SPEED,
  SETTLE_SPIN,
  SPAWN_R,
  U,
} from '../config';
import { lidGeometry, pailGeometry, pieceGeometry } from '../geometry/bodies';
import { SHAPES, SPAWNS, type ShapeSpec } from '../geometry/profiles';

/**
 * The physics world. Geometry comes from `geometry/bodies.ts` and is handed to
 * both the renderer and Rapier, so what you see is exactly what collides: the
 * lid's triangle mesh really does have the flared holes you can look at.
 */

export interface Piece {
  index: number;
  spec: ShapeSpec;
  body: RAPIER.RigidBody;
  /** Where this piece goes back to on reset. */
  home: { x: number; y: number; z: number };
  mesh: Mesh;
}

export interface Substep {
  /** Runs before every fixed step, so anything driving a body stays stiff at 120 Hz. */
  before(dt: number): void;
}

export interface Sim {
  world: RAPIER.World;
  pieces: Piece[];
  /**
   * The two parts that move when the pail is emptied, and the only bodies in the
   * scene that are not nailed down. They are kinematic, so while they are left
   * alone they behave exactly like the fixed bodies they used to be, and driving
   * them is what makes the dump push pieces around properly instead of passing
   * through them.
   */
  lid: RAPIER.RigidBody;
  pail: RAPIER.RigidBody;
  /** Where the lid and the pail rest, which is where the dump puts them back. */
  lidHome: { x: number; y: number; z: number };
  /** Steps the world in fixed slices, calling `hook` before each one. */
  step(elapsed: number, hook?: Substep): void;
  /** True when nothing is moving, so the caller can skip the step entirely. */
  asleep(): boolean;
  /**
   * True when every piece has stopped moving.
   *
   * A different question from `asleep`, and not interchangeable. Rapier will not
   * put a body to sleep while it is resting against a body that is not static,
   * and the pail is kinematic, so a piece leaning on it stays awake forever.
   * Anything that waits on the pieces having stopped has to ask about their
   * speed instead.
   */
  settled(): boolean;
  /** True when every piece has gone through a hole and is sitting in the pail. */
  allBuried(): boolean;
  /** Puts every piece back where it started. */
  reset(): void;
}

function trimesh(geometry: BufferGeometry): { vertices: Float32Array; indices: Uint32Array } {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) throw new Error('a collider needs an indexed geometry');
  return {
    vertices: new Float32Array(position.array),
    indices: new Uint32Array(index.array),
  };
}

/**
 * Flags for every mesh in this scene, and they are load-bearing.
 *
 * These meshes are closed solids, built with duplicated vertices so that sharp
 * edges keep their own shading. That means Rapier has to be told two things:
 *
 * - `ORIENTED` so it knows which side of the surface is solid. Without it the
 *   narrow phase cannot reason about a piece that is inside a hole at all.
 * - `FIX_INTERNAL_EDGES` because the lid is mostly flat surfaces meeting at
 *   right angles. Its own documentation says that without it contact normals
 *   around shared edges produce "incorrect bumps in physics simulation
 *   (especially on flat surfaces)" — which is exactly the phantom contact that
 *   held pieces hovering inside a hole they had clearance to fall through. The
 *   flag also merges the duplicated vertices, which the edge fix needs in order
 *   to see the mesh as connected at all.
 */
const SOLID_MESH_FLAGS = RAPIER.TriMeshFlags.ORIENTED | RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES;

export async function createSim(): Promise<Sim> {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: GRAVITY_Y, z: 0 });
  world.timestep = FIXED_DT;

  // --- the counter: the table top at y = 0, which is also the pail's floor ---
  const counterBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(COUNTER_HALF, U(20), COUNTER_HALF)
      .setTranslation(0, -U(20), 0)
      .setFriction(0.8)
      .setRestitution(0.05),
    counterBody,
  );

  // --- the pail: a tub standing on the counter, open at the top ---
  // Kinematic rather than fixed so the dump can pick it up. Its origin is the
  // centre of its base, which is where a body rotates about, and that is exactly
  // the corner the pail tips over once a hinge is applied to it.
  const pail = trimesh(pailGeometry());
  const pailBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(pail.vertices, pail.indices, SOLID_MESH_FLAGS)
      .setFriction(0.5)
      .setRestitution(0.1),
    pailBody,
  );
  world.createCollider(
    // The pail's own floor, buried so its top face is the counter the pieces
    // already rest on. Invisible until the dump, when it becomes the thing that
    // carries the pieces up and tips them out.
    RAPIER.ColliderDesc.cylinder(
      U(PAIL_FLOOR_T) / 2,
      U(PAIL_OUTER_R - PAIL_WALL),
    )
      .setTranslation(0, -U(PAIL_FLOOR_T) / 2, 0)
      .setFriction(0.5)
      .setRestitution(0.1),
    pailBody,
  );

  // --- the lid: the plate everything has to get through ---
  const lid = trimesh(lidGeometry());
  const lidHome = { x: 0, y: LID_TOP_Y, z: 0 };
  const lidBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      lidHome.x,
      lidHome.y,
      lidHome.z,
    ),
  );
  world.createCollider(
    // Slick, like moulded plastic: a piece that does catch an edge can slide free
    // instead of wedging, which matters more than realism here.
    RAPIER.ColliderDesc.trimesh(lid.vertices, lid.indices, SOLID_MESH_FLAGS)
      .setFriction(0.3)
      .setRestitution(0.05),
    lidBody,
  );

  // --- the pieces ---
  const pieces: Piece[] = SHAPES.map((spec: ShapeSpec, index: number) => {
    const geometry = pieceGeometry(spec);
    const direction = SPAWNS[index];
    const home = {
      x: direction.x * SPAWN_R,
      y: U(PIECE_T) / 2,
      z: direction.y * SPAWN_R,
    };
    // No CCD here, on purpose. A piece is released from 26 mm above the lid and
    // covers about 20 world millimetres per step, while the plate is 160 world
    // millimetres thick, so a piece cannot cross it in one step. Turning CCD on
    // was tried and changed nothing except to add moving parts.
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(home.x, home.y, home.z)
        .setLinearDamping(0.1)
        .setAngularDamping(0.6),
    );
    const hull = RAPIER.ColliderDesc.convexHull(
      new Float32Array(geometry.getAttribute('position').array),
    );
    if (!hull) throw new Error(`could not build a collider for the ${spec.kind}`);
    world.createCollider(hull.setDensity(900).setFriction(0.7).setRestitution(0.08), body);
    return { index, spec, body, home, mesh: null as unknown as Mesh };
  });

  let accumulator = 0;

  const bore = U(PAIL_OUTER_R - PAIL_WALL);

  return {
    world,
    pieces,
    lid: lidBody,
    pail: pailBody,
    lidHome,
    step(elapsed: number, hook?: Substep) {
      accumulator = Math.min(accumulator + elapsed, 0.25);
      while (accumulator >= FIXED_DT) {
        hook?.before(FIXED_DT);
        world.step();
        accumulator -= FIXED_DT;
      }
    },
    asleep: () => pieces.every((piece) => piece.body.isSleeping()),
    settled: () =>
      pieces.every((piece) => {
        const velocity = piece.body.linvel();
        const spin = piece.body.angvel();
        return (
          Math.hypot(velocity.x, velocity.y, velocity.z) < U(SETTLE_SPEED) &&
          Math.hypot(spin.x, spin.y, spin.z) < SETTLE_SPIN
        );
      }),
    // Below the lid and inside the pail's bore. A resting piece sits on the
    // counter, so this is asking whether it got there through a hole rather than
    // by being dropped next to the pail.
    allBuried: () =>
      pieces.every((piece) => {
        const position = piece.body.translation();
        return position.y < LID_BOTTOM_Y && Math.hypot(position.x, position.z) < bore;
      }),
    reset() {
      for (const piece of pieces) {
        piece.body.setTranslation(piece.home, true);
        piece.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        piece.body.setGravityScale(1, true);
      }
      accumulator = 0;
    },
  };
}
