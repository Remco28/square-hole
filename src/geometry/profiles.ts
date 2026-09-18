import { CLEARANCE, HOLE_RING_R, SQUARE_SIDE, SQUARE_HOLE } from '../config';

export interface Vec2 {
  x: number;
  y: number;
}

export type ShapeKind = 'square' | 'rectangle' | 'circle' | 'triangle' | 'house';

export interface ShapeSpec {
  kind: ShapeKind;
  label: string;
  color: string;
  /** Silhouette in toy millimetres, centred on the prism axis. */
  outline: Vec2[];
  /** Where the matching hole sits, in lid millimetres. */
  hole: Vec2;
}

const regular = (sides: number, radius: number, startDeg = 90): Vec2[] =>
  Array.from({ length: sides }, (_, i) => {
    const a = ((startDeg + (i * 360) / sides) * Math.PI) / 180;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });

const squareOutline = (side: number): Vec2[] => {
  const h = side / 2;
  return [
    { x: -h, y: -h },
    { x: h, y: -h },
    { x: h, y: h },
    { x: -h, y: h },
  ];
};

/** An equilateral triangle, centroid on the origin, apex toward +v. */
const triangleOutline = (side: number): Vec2[] => {
  const h = (side * Math.sqrt(3)) / 2;
  return [
    { x: 0, y: (2 * h) / 3 },
    { x: -side / 2, y: -h / 3 },
    { x: side / 2, y: -h / 3 },
  ];
};

/** A house: rectangular body with a triangular roof, centred on the origin. */
const houseOutline = (width: number, bodyHeight: number, roofHeight: number): Vec2[] => {
  const w = width / 2;
  // Half the total height, so the shape is centred on its own origin.
  const b = (bodyHeight + roofHeight) / 2;
  const t = b - roofHeight;
  return [
    { x: -w, y: -b },
    { x: w, y: -b },
    { x: w, y: t },
    { x: 0, y: b },
    { x: -w, y: t },
  ];
};

const RECT_W = 15;
const RECT_H = 25.5;
const CIRCLE_D = 25.5;
/**
 * Everything here is sized so its silhouette leaves about a millimetre against
 * the square hole, with the triangle's 15 degree trick buying it closer to 1.5.
 * Under about a millimetre a piece catches its own corner on the way in and jams,
 * which a player experiences as the game being broken rather than as the puzzle
 * being hard.
 */
const TRIANGLE_SIDE = 26;
const HOUSE_W = 25.2;
const HOUSE_BODY = 15;
const HOUSE_ROOF = 8;

const onRing = (deg: number): Vec2 => ({
  x: Math.cos((deg * Math.PI) / 180) * HOLE_RING_R,
  y: Math.sin((deg * Math.PI) / 180) * HOLE_RING_R,
});

/**
 * Five shapes, laid out the way a real shape sorter is: the holes are spread
 * around a ring and each piece starts in the same orientation as its own hole,
 * so seating a piece where it belongs needs no rotation at all.
 */
export const SHAPES: ShapeSpec[] = [
  {
    kind: 'square',
    label: 'Square',
    color: '#d9584c',
    outline: squareOutline(SQUARE_SIDE),
    hole: onRing(90),
  },
  {
    kind: 'rectangle',
    label: 'Rectangle',
    color: '#3f7fc4',
    outline: [
      { x: -RECT_W / 2, y: -RECT_H / 2 },
      { x: RECT_W / 2, y: -RECT_H / 2 },
      { x: RECT_W / 2, y: RECT_H / 2 },
      { x: -RECT_W / 2, y: RECT_H / 2 },
    ],
    hole: onRing(162),
  },
  {
    kind: 'circle',
    label: 'Circle',
    color: '#e0a63a',
    outline: regular(48, CIRCLE_D / 2),
    hole: onRing(234),
  },
  {
    kind: 'triangle',
    label: 'Triangle',
    color: '#5aa66a',
    outline: triangleOutline(TRIANGLE_SIDE).map(p => ({ x: -p.x, y: -p.y })),
    hole: onRing(306),
  },
  {
    kind: 'house',
    label: 'House',
    color: '#9b6bc4',
    outline: houseOutline(HOUSE_W, HOUSE_BODY, HOUSE_ROOF).map(p => ({ x: -p.x, y: -p.y })),
    hole: onRing(18),
  },
];

/** Where pieces rest on the counter, in lid millimetres, clear of the pail. */
export const SPAWNS: Vec2[] = SHAPES.map((_, i) => {
  const a = ((126 + i * 72) * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
});

export const bbox = (points: Vec2[]) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { width: maxX - minX, height: maxY - minY };
};

/** The piece's widest dimension, which is what its hole is sized from. */
export const extent = (points: Vec2[]): number => {
  const box = bbox(points);
  return Math.max(box.width, box.height);
};

/**
 * Holes are the piece's silhouette scaled about its own centre. A uniform scale
 * is an exact offset for the regular outlines and a close-enough one for the
 * house, and it guarantees the hole always contains the piece.
 */
export const holeScale = (spec: ShapeSpec): number => 1 + CLEARANCE / extent(spec.outline);

export const holeOutline = (spec: ShapeSpec): Vec2[] => {
  const s = holeScale(spec);
  return spec.outline.map((p) => ({ x: p.x * s, y: p.y * s }));
};

export const shapeOf = (kind: ShapeKind): ShapeSpec => {
  const found = SHAPES.find((spec) => spec.kind === kind);
  if (!found) throw new Error(`unknown shape ${kind}`);
  return found;
};

/** The square hole, as a polygon, for the fit checks. */
export const SQUARE_HOLE_POINTS = squareOutline(SQUARE_HOLE);
