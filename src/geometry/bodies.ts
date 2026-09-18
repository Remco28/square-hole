import type { BufferGeometry } from 'three';
import {
  COUNTER_HALF,
  LID_FLARE,
  LID_FLARE_DEPTH,
  LID_R,
  LID_T,
  PAIL_DEPTH,
  PAIL_OUTER_R,
  PAIL_WALL,
  PIECE_T,
  U,
} from '../config';
import { SHAPES, holeOutline, type ShapeSpec, type Vec2 } from './profiles';
import { buildSolid, circlePoints, type Profile } from './solid';

/**
 * Every solid in the scene, in the (x, z) plane with y as the prism axis.
 *
 * A piece's local origin sits at the centre of its prism, which is where Rapier
 * puts its centre of mass, so a body's translation is genuinely the piece's
 * position and the tests can assert on it directly. The lid's origin is the
 * centre of its top face.
 */

const world = (points: Vec2[]): Vec2[] => points.map((p) => ({ x: U(p.x), y: U(p.y) }));

/** The lid: a round plate with one hole per shape, each flared at the top face. */
export function lidGeometry(): BufferGeometry {
  const outer: Profile = {
    points: circlePoints(U(LID_R), 128),
    centre: { x: 0, y: 0 },
    rings: [
      // One continuous rounded edge. An overlapping decorative torus caused
      // a dotted seam and unstable self-shadows as the view turned.
      { y: 0, expand: -U(1.5) },
      { y: -U(0.4), expand: -U(0.5) },
      { y: -U(1.5), expand: 0 },
      { y: -U(LID_T - 1.5), expand: 0 },
      { y: -U(LID_T - 0.4), expand: -U(0.5) },
      { y: -U(LID_T), expand: -U(1.5) },
    ],
    smooth: true,
  };

  const holes: Profile[] = SHAPES.map((spec) => ({
    points: world(holeOutline(spec)),
    centre: { x: U(spec.hole.x), y: U(spec.hole.y) },
    rings: [
      { y: 0, expand: U(LID_FLARE) },
      { y: -U(LID_FLARE_DEPTH), expand: 0 },
      { y: -U(LID_T), expand: 0 },
    ],
    smooth: spec.kind === 'circle',
  }));

  return buildSolid(outer, holes);
}

/** One shape sorter piece: a flat prism of the piece's silhouette. */
export function pieceGeometry(spec: ShapeSpec): BufferGeometry {
  const half = U(PIECE_T) / 2;
  return buildSolid({
    points: world(spec.outline),
    centre: { x: 0, y: 0 },
    rings: [
      { y: half, expand: -U(0.25) },
      { y: half - U(0.25), expand: 0 },
      { y: -half + U(0.25), expand: 0 },
      { y: -half, expand: -U(0.25) },
    ],
    smooth: spec.kind === 'circle',
  });
}

/** The pail: a cylindrical wall with thickness, sitting on the counter. */
export function pailGeometry(): BufferGeometry {
  const outer: Profile = {
    points: circlePoints(U(PAIL_OUTER_R)),
    centre: { x: 0, y: 0 },
    rings: [
      { y: U(PAIL_DEPTH), expand: 0 },
      { y: 0, expand: 0 },
    ],
    smooth: true,
  };
  const bore: Profile = {
    points: circlePoints(U(PAIL_OUTER_R - PAIL_WALL)),
    centre: { x: 0, y: 0 },
    rings: [
      { y: U(PAIL_DEPTH), expand: 0 },
      { y: 0, expand: 0 },
    ],
    smooth: true,
  };
  return buildSolid(outer, [bore]);
}

export const counterSize = COUNTER_HALF * 2;

/** Where each piece's matching hole ends up, in world metres. */
export const holeCentres = SHAPES.map((spec) => ({
  kind: spec.kind,
  x: U(spec.hole.x),
  z: U(spec.hole.y),
}));
