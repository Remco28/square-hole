import { BufferAttribute, BufferGeometry, ShapeUtils, Vector2 } from 'three';
import type { Vec2 } from './profiles';

/**
 * Builds the platonic solids this toy is made of: a prism whose cross-section is
 * one outline, or a plate punctuated by hole outlines.
 *
 * Everything visible and everything collidable comes out of this one function,
 * so a piece's mesh and its convex hull, and the lid's mesh and its triangle
 * mesh, are the same vertices. Nothing can drift out of sync, which is the only
 * way the fit tests can mean anything about what happens on screen.
 *
 * Rings are stacked top to bottom. Growing a ring outward is how the holes get
 * their countersink: the top ring of a hole is wider than the bore below it, so
 * a piece dropped slightly off-centre slides down the flare and centres itself
 * instead of balancing on the rim.
 */

export interface Ring {
  /** World height of this ring. */
  y: number;
  /** How far this ring's outline grows outward, in world metres. */
  expand: number;
}

export interface Profile {
  /** Outline in the parent's (x, z) plane, centred on its own origin. */
  points: Vec2[];
  /** Where this outline sits in the parent's plane. */
  centre: Vec2;
  /** Stacked rings, top first. Two or more. */
  rings: Ring[];
  /** Share normals around the outline: true for round profiles, false for faceted. */
  smooth?: boolean;
}

const signedArea = (points: Vec2[]): number => {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    total += p.x * q.y - q.x * p.y;
  }
  return total / 2;
};

function wind(points: Vec2[], clockwise: boolean): Vec2[] {
  const isCcw = signedArea(points) > 0;
  if (isCcw === !clockwise) return points;
  return [...points].reverse();
}

/** Distance from the outline's centre to its nearest edge. */
function inradius(points: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (length < 1e-12) continue;
    best = Math.min(best, Math.abs(p.x * q.y - q.x * p.y) / length);
  }
  return Math.max(best, 1e-6);
}

export function buildSolid(outer: Profile, holes: Profile[] = []): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const vertex = (x: number, y: number, z: number): number => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const tri = (a: number, b: number, c: number) => indices.push(a, b, c);
  const quad = (a: number, b: number, c: number, d: number) => {
    tri(a, b, c);
    tri(a, c, d);
  };

  const profiles = [outer, ...holes];
  // three's triangulator expects a counter-clockwise outline with clockwise holes.
  const wound = profiles.map((p, i) => wind(p.points, i > 0));

  // --- end caps ---------------------------------------------------------------
  // Caps get their own vertices so the rim between a wall and a face stays sharp.
  for (const cap of ['top', 'bottom'] as const) {
    const contour: Vector2[] = [];
    const holeContours: Vector2[][] = [];
    const lookup: number[] = [];

    profiles.forEach((profile, index) => {
      const local = wound[index];
      const ring = cap === 'top' ? profile.rings[0] : profile.rings[profile.rings.length - 1];
      const scale = 1 + ring.expand / inradius(local);
      const face = local.map((point) => {
        const x = profile.centre.x + point.x * scale;
        const z = profile.centre.y + point.y * scale;
        lookup.push(vertex(x, ring.y, z));
        return new Vector2(x, z);
      });
      if (index === 0) contour.push(...face);
      else holeContours.push(face);
    });

    for (const face of ShapeUtils.triangulateShape(contour, holeContours)) {
      // A face wound counter-clockwise in (x, z) points along -y, so the top cap
      // is reversed and the bottom cap is already facing the right way.
      if (cap === 'top') tri(lookup[face[2]], lookup[face[1]], lookup[face[0]]);
      else tri(lookup[face[0]], lookup[face[1]], lookup[face[2]]);
    }
  }

  // --- side walls -------------------------------------------------------------
  profiles.forEach((profile, index) => {
    const local = wound[index];
    const n = local.length;
    const rings = profile.rings.map((ring) => {
      const scale = 1 + ring.expand / inradius(local);
      return local.map((point) => ({
        x: profile.centre.x + point.x * scale,
        y: ring.y,
        z: profile.centre.y + point.y * scale,
      }));
    });

    if (profile.smooth) {
      const ringIndices = rings.map((ring) => ring.map((p) => vertex(p.x, p.y, p.z)));
      for (let r = 0; r < rings.length - 1; r++) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          quad(ringIndices[r][i], ringIndices[r][j], ringIndices[r + 1][j], ringIndices[r + 1][i]);
        }
      }
      return;
    }

    // Faceted profiles get a vertex per corner per band, so each flat wall keeps
    // its own normal and the piece reads as a moulded block rather than a blob.
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = rings[r][i];
        const b = rings[r][j];
        const c = rings[r + 1][j];
        const d = rings[r + 1][i];
        quad(
          vertex(a.x, a.y, a.z),
          vertex(b.x, b.y, b.z),
          vertex(c.x, c.y, c.z),
          vertex(d.x, d.y, d.z),
        );
      }
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    uv.push(positions[i] + positions[i + 1] * 0.7, positions[i + 2] + positions[i + 1] * 0.7);
  }
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Convenience for round profiles. */
export const circlePoints = (radius: number, segments = 64): Vec2[] =>
  Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });
