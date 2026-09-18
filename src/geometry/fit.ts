import type { Vec2 } from './profiles';

/**
 * Can this silhouette be rotated into that hole?
 *
 * For a thin plate the question is exactly two-dimensional: a convex prism
 * passes through a hole when its cross-section can be rotated and translated
 * inside the hole's outline. Tilting a flat piece can only make its projection
 * bigger, so yaw is the only degree of freedom that matters — which is what
 * makes this game a rotation puzzle and nothing else.
 *
 * A convex polygon A fits inside a convex polygon B when some translation t
 * satisfies `A + t ⊆ B`. Writing B as a set of half-planes `n·x ≤ d`, that
 * becomes a set of half-planes on t alone:
 *
 *     n·t ≤ d − h_A(n)
 *
 * where h_A is A's support function. So the legal translations form a convex
 * region, and A fits iff that region has any area at all. `slack` goes further
 * and reports the radius of the largest disc of legal translations, which is how
 * much room a piece has left over — the snugness number the tests assert on.
 *
 * If the shape of that invariant changes, the joke stops being true.
 */

interface HalfPlane {
  nx: number;
  ny: number;
  d: number;
}

export const rotate = (points: Vec2[], radians: number): Vec2[] => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return points.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
};

export const signedArea = (points: Vec2[]): number => {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    total += p.x * q.y - q.x * p.y;
  }
  return total / 2;
};

/** Outward half-planes of a counter-clockwise convex polygon. */
function halfPlanes(poly: Vec2[]): HalfPlane[] {
  const planes: HalfPlane[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-12) continue;
    // Wound counter-clockwise, the interior lies to the left of each edge, so
    // the outward normal is the edge direction turned a quarter turn clockwise.
    const nx = dy / length;
    const ny = -dx / length;
    planes.push({ nx, ny, d: nx * p.x + ny * p.y });
  }
  return planes;
}

function support(poly: Vec2[], nx: number, ny: number): number {
  let best = -Infinity;
  for (const p of poly) best = Math.max(best, nx * p.x + ny * p.y);
  return best;
}

/**
 * The largest radius the piece can be nudged in any direction and still pass.
 * Positive means it fits, non-positive means it jams. Both polygons must be
 * convex; every silhouette in this toy is.
 */
export function slack(piece: Vec2[], hole: Vec2[]): number {
  const planes = halfPlanes(hole);
  if (planes.length < 3 || piece.length < 3) return -Infinity;

  // Shift each half-plane inwards by how far the piece reaches that way.
  const limits = planes.map((plane) => ({
    nx: plane.nx,
    ny: plane.ny,
    c: plane.d - support(piece, plane.nx, plane.ny),
  }));

  // Maximising r subject to `n·t + r ≤ c` is a three-unknown linear program, so
  // the optimum sits on three active constraints. Try every triple.
  let best = -Infinity;
  const n = limits.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        const p = limits[a];
        const q = limits[b];
        const r = limits[c];
        const m11 = p.nx - q.nx;
        const m12 = p.ny - q.ny;
        const m21 = p.nx - r.nx;
        const m22 = p.ny - r.ny;
        const det = m11 * m22 - m12 * m21;
        if (Math.abs(det) < 1e-12) continue;
        const b1 = p.c - q.c;
        const b2 = p.c - r.c;
        const tx = (b1 * m22 - b2 * m12) / det;
        const ty = (m11 * b2 - m21 * b1) / det;
        const radius = p.c - p.nx * tx - p.ny * ty;
        if (!Number.isFinite(radius)) continue;
        let ok = true;
        for (const limit of limits) {
          if (limit.nx * tx + limit.ny * ty + radius > limit.c + 1e-9) {
            ok = false;
            break;
          }
        }
        if (ok) best = Math.max(best, radius);
      }
    }
  }
  return best;
}

export interface Fit {
  /** Best-observed slack across the sweep. */
  slack: number;
  /** Rotation that achieved it, in degrees. */
  angle: number;
}

/** Sweep a piece through a full turn and report its best fit. */
export function bestFit(piece: Vec2[], hole: Vec2[], stepDeg = 0.25): Fit {
  let best: Fit = { slack: -Infinity, angle: 0 };
  for (let deg = 0; deg < 360; deg += stepDeg) {
    const s = slack(rotate(piece, (deg * Math.PI) / 180), hole);
    // A shape rotated by half a turn has the same bounding box, so ties are common
    // and the smallest angle should win. The epsilon keeps rounding noise from
    // handing the answer to whichever equivalent angle came out a bit-flip ahead.
    if (s > best.slack + 1e-9) best = { slack: s, angle: deg > 180 ? deg - 360 : deg };
  }
  return best;
}

/** All rotations, in degrees, at which the piece squeezes through. */
export function fitWindow(piece: Vec2[], hole: Vec2[], stepDeg = 0.25): number[] {
  const angles: number[] = [];
  for (let deg = -90; deg < 90; deg += stepDeg) {
    if (slack(rotate(piece, (deg * Math.PI) / 180), hole) > 0) angles.push(deg);
  }
  return angles;
}
