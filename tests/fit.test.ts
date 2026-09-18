import { describe, expect, it } from 'vitest';
import { CLEARANCE, SQUARE_HOLE, SQUARE_SIDE } from '../src/config';
import { bestFit, fitWindow, slack } from '../src/geometry/fit';
import {
  SHAPES,
  SQUARE_HOLE_POINTS,
  extent,
  holeOutline,
  holeScale,
  shapeOf,
} from '../src/geometry/profiles';

/**
 * These tests are the joke's fine print. The bit only works if the geometry is
 * genuinely, measurably true: every piece must fit the square hole, the square
 * must fit nothing else, and getting a piece through must require lining it up.
 *
 * Slack is reported in toy millimetres, so 1.0 means half a millimetre of room on
 * every side — snug, the way the real toy is.
 */

describe('the square hole', () => {
  it('is derived from the square piece and the shared clearance', () => {
    const square = shapeOf('square');
    expect(extent(square.outline)).toBeCloseTo(SQUARE_SIDE, 6);
    expect(extent(square.outline) * holeScale(square)).toBeCloseTo(SQUARE_HOLE, 6);
    expect(SQUARE_HOLE - SQUARE_SIDE).toBeCloseTo(CLEARANCE, 6);
  });

  it('takes every shape in the box at rest', () => {
    for (const spec of SHAPES) {
      const fit = bestFit(spec.outline, SQUARE_HOLE_POINTS);
      expect(fit.slack, `${spec.label} should pass through the square hole`).toBeGreaterThan(0.7);
    }
  });

  it('takes the round piece at any angle and the square only face on', () => {
    const circle = shapeOf('circle');
    expect(fitWindow(circle.outline, SQUARE_HOLE_POINTS).length).toBe(720);

    const square = shapeOf('square');
    // A square turned corner-first needs half as much room again as it has.
    expect(slack(shapeOf('square').outline, SQUARE_HOLE_POINTS)).toBeGreaterThan(0);
    expect(fitWindow(square.outline, SQUARE_HOLE_POINTS).length).toBeLessThan(200);
  });

  it('can be broken by rotating the piece carelessly', () => {
    // These three are the reason the game has a rotation control at all.
    for (const kind of ['square', 'rectangle', 'house'] as const) {
      const turned = slack(
        shapeOf(kind).outline.map((p) => {
          const a = Math.PI / 4;
          return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
        }),
        SQUARE_HOLE_POINTS,
      );
      expect(turned, `a ${kind} turned 45 degrees should jam`).toBeLessThan(0);
    }
  });
});

describe('the other holes', () => {
  it('accept their own piece without any rotation', () => {
    for (const spec of SHAPES) {
      const room = slack(spec.outline, holeOutline(spec));
      expect(room, `${spec.label} should drop into its own hole`).toBeGreaterThan(0.5);
    }
  });

  it('refuse the square piece at every angle', () => {
    for (const spec of SHAPES) {
      if (spec.kind === 'square') continue;
      expect(
        bestFit(shapeOf('square').outline, holeOutline(spec)).slack,
        `a square must not fit the ${spec.kind} hole`,
      ).toBeLessThan(0);
    }
  });

  it('refuse the pieces that are obviously too big for them', () => {
    const check = (piece: Parameters<typeof shapeOf>[0], hole: Parameters<typeof shapeOf>[0]) =>
      bestFit(shapeOf(piece).outline, holeOutline(shapeOf(hole))).slack;

    expect(check('rectangle', 'circle')).toBeLessThan(0);
    expect(check('rectangle', 'triangle')).toBeLessThan(0);
    expect(check('triangle', 'rectangle')).toBeLessThan(0);
    expect(check('house', 'circle')).toBeLessThan(0);
    expect(check('house', 'triangle')).toBeLessThan(0);
  });
});
