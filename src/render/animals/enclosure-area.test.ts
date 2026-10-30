import { describe, expect, it } from 'vitest';
import { createGridSize, gridDepth, gridWidth } from '@/shared';
import { createRng, outlineCells, type GridPoint } from '@/sim';
import {
  INTERIOR_MARGIN_M,
  PATH_MARGIN_M,
  containsPoint,
  createEnclosureArea,
  distanceToEdge,
  hashText,
  pickDestination,
  placeInterestPoints,
  segmentStaysInside,
  type EnclosureArea,
  type Point2,
} from './enclosure-area';

const GRID = createGridSize(40, 30);
const SQUARE: readonly GridPoint[] = [
  { x: 10, y: 10 },
  { x: 18, y: 10 },
  { x: 18, y: 18 },
  { x: 10, y: 18 },
];
/** An L: the notch is the north-east quarter. */
const L_SHAPE: readonly GridPoint[] = [
  { x: 10, y: 10 },
  { x: 14, y: 10 },
  { x: 14, y: 14 },
  { x: 22, y: 14 },
  { x: 22, y: 22 },
  { x: 10, y: 22 },
];

function areaOf(outline: readonly GridPoint[]): EnclosureArea {
  const area = createEnclosureArea(outline, GRID);
  if (area === null) {
    throw new Error('expected an area');
  }
  return area;
}

function worldPoint(column: number, row: number): Point2 {
  return { x: column - gridWidth(GRID) / 2, z: row - gridDepth(GRID) / 2 };
}

describe('createEnclosureArea', () => {
  it('turns the outline into world metres, centred on the terrain', () => {
    const area = areaOf(SQUARE);
    expect(area.cornersX).toEqual([-10, -2, -2, -10]);
    expect(area.cornersZ).toEqual([-5, -5, 3, 3]);
  });

  it('keeps resting places inside the cells of the simulation and away from the fence', () => {
    const area = areaOf(L_SHAPE);
    const cells = new Set(outlineCells(L_SHAPE, GRID.columns));
    const nearest = { x: 0, z: 0 };
    expect(area.interior.length).toBeGreaterThan(50);
    for (const spot of area.interior) {
      const column = Math.floor(spot.x + gridWidth(GRID) / 2);
      const row = Math.floor(spot.z + gridDepth(GRID) / 2);
      expect(cells.has(row * GRID.columns + column)).toBe(true);
      expect(containsPoint(area, spot.x, spot.z)).toBe(true);
      expect(distanceToEdge(area, spot.x, spot.z, nearest)).toBeGreaterThanOrEqual(
        INTERIOR_MARGIN_M,
      );
    }
  });

  it('has no resting place in an enclosure too thin to hold an animal', () => {
    const thin: readonly GridPoint[] = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
    ];
    expect(createEnclosureArea(thin, GRID)).toBeNull();
  });
});

describe('containsPoint and distanceToEdge', () => {
  const area = areaOf(L_SHAPE);

  it('tells inside from outside, notch included', () => {
    const inArm = worldPoint(12, 12);
    const inNotch = worldPoint(18, 11);
    expect(containsPoint(area, inArm.x, inArm.z)).toBe(true);
    expect(containsPoint(area, inNotch.x, inNotch.z)).toBe(false);
    expect(containsPoint(area, 0, 100)).toBe(false);
  });

  it('measures the distance to the nearest fence and tells where it is', () => {
    const nearest = { x: 0, z: 0 };
    const spot = worldPoint(12, 12);
    // 2 m from the west fence (column 10) and 2 m from the north fence (row 10).
    expect(distanceToEdge(area, spot.x, spot.z, nearest)).toBeCloseTo(2);
    // Outside, in the notch: the fence it faces is the south side of the notch (row 14).
    const outside = worldPoint(18, 13);
    expect(distanceToEdge(area, outside.x, outside.z, nearest)).toBeCloseTo(1);
    expect(nearest.x).toBeCloseTo(outside.x);
    expect(nearest.z).toBeCloseTo(worldPoint(18, 14).z);
  });
});

describe('segmentStaysInside', () => {
  const area = areaOf(L_SHAPE);

  it('accepts a walk along an arm', () => {
    const from = worldPoint(11.5, 20.5);
    const to = worldPoint(20.5, 20.5);
    expect(segmentStaysInside(area, from.x, from.z, to.x, to.z, PATH_MARGIN_M)).toBe(true);
  });

  it('refuses a shortcut across the notch of the L even though both ends are inside', () => {
    const from = worldPoint(12, 11.5);
    const to = worldPoint(21, 15.5);
    expect(containsPoint(area, from.x, from.z)).toBe(true);
    expect(containsPoint(area, to.x, to.z)).toBe(true);
    expect(segmentStaysInside(area, from.x, from.z, to.x, to.z, PATH_MARGIN_M)).toBe(false);
  });

  it('refuses a walk that ends outside, or that grazes the fence', () => {
    const inside = worldPoint(12, 12);
    const outside = worldPoint(30, 12);
    expect(segmentStaysInside(area, inside.x, inside.z, outside.x, outside.z, 0)).toBe(false);
    const nearFenceA = worldPoint(10.1, 12);
    const nearFenceB = worldPoint(10.1, 20);
    expect(
      segmentStaysInside(area, nearFenceA.x, nearFenceA.z, nearFenceB.x, nearFenceB.z, 0.2),
    ).toBe(false);
    expect(
      segmentStaysInside(area, nearFenceA.x, nearFenceA.z, nearFenceB.x, nearFenceB.z, 0.05),
    ).toBe(true);
  });
});

describe('pickDestination', () => {
  const MIN_TRIP_M = 1.5;
  const MAX_TRIP_M = 6;

  it('always finds a straight, in-bounds walk in an L-shaped enclosure', () => {
    const area = areaOf(L_SHAPE);
    const rng = createRng(11);
    const out = { x: 0, z: 0 };
    for (let index = 0; index < 400; index += 1) {
      const start = area.interior[(index * 7) % area.interior.length];
      if (start === undefined) {
        throw new Error('expected a start');
      }
      const found = pickDestination(area, rng, start, MIN_TRIP_M, MAX_TRIP_M, out);
      expect(found).toBe(true);
      expect(containsPoint(area, out.x, out.z)).toBe(true);
      expect(segmentStaysInside(area, start.x, start.z, out.x, out.z, PATH_MARGIN_M)).toBe(true);
    }
  });

  it('respects the trip length when a walk of that length exists', () => {
    const area = areaOf(SQUARE);
    const rng = createRng(5);
    const out = { x: 0, z: 0 };
    const start = { x: -6, z: -1 };
    for (let index = 0; index < 100; index += 1) {
      pickDestination(area, rng, start, MIN_TRIP_M, MAX_TRIP_M, out);
      const length = Math.hypot(out.x - start.x, out.z - start.z);
      expect(length).toBeGreaterThanOrEqual(MIN_TRIP_M);
      expect(length).toBeLessThanOrEqual(MAX_TRIP_M);
    }
  });

  it('falls back to a shorter walk when none fits the range, and is repeatable', () => {
    const area = areaOf(SQUARE);
    const start = { x: -6, z: -1 };
    const first = { x: 0, z: 0 };
    const second = { x: 0, z: 0 };
    const tooLong = 100;
    expect(pickDestination(area, createRng(3), start, tooLong, tooLong, first)).toBe(true);
    expect(pickDestination(area, createRng(3), start, tooLong, tooLong, second)).toBe(true);
    expect(first).toEqual(second);
    expect(containsPoint(area, first.x, first.z)).toBe(true);
  });

  it('gives up when the only place around is where the animal already stands', () => {
    const lonely: EnclosureArea = {
      cornersX: [0, 2, 2, 0],
      cornersZ: [0, 0, 2, 2],
      interior: [{ x: 1, z: 1 }],
    };
    const out = { x: 0, z: 0 };
    expect(pickDestination(lonely, createRng(1), { x: 1, z: 1 }, 1, 2, out)).toBe(false);
  });
});

describe('placeInterestPoints', () => {
  const area = areaOf(L_SHAPE);

  it('puts one enrichment point per star above the first, and none at one star', () => {
    const counts = [0, 1, 2, 3, 4, 5, 6].map(
      (stars) => placeInterestPoints(area, 'enclosure-1', false, stars).enrichment.length,
    );
    expect(counts).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });

  it('adds a water point only for a species with water', () => {
    expect(placeInterestPoints(area, 'enclosure-1', false, 3).water).toBeNull();
    const water = placeInterestPoints(area, 'enclosure-1', true, 3).water;
    expect(water).not.toBeNull();
    expect(water && containsPoint(area, water.x, water.z)).toBe(true);
  });

  it('is repeatable and depends on the enclosure id', () => {
    const first = placeInterestPoints(area, 'enclosure-1', true, 5);
    expect(placeInterestPoints(area, 'enclosure-1', true, 5)).toEqual(first);
    expect(placeInterestPoints(area, 'enclosure-2', true, 5)).not.toEqual(first);
  });

  it('keeps the points it already had when a star is added', () => {
    const three = placeInterestPoints(area, 'enclosure-7', true, 3);
    const five = placeInterestPoints(area, 'enclosure-7', true, 5);
    expect(five.water).toEqual(three.water);
    expect(five.enrichment.slice(0, 2)).toEqual(three.enrichment);
  });

  it('spreads the points out when the enclosure is big enough', () => {
    const points = placeInterestPoints(areaOf(L_SHAPE), 'enclosure-3', true, 5);
    const all = [...(points.water ? [points.water] : []), ...points.enrichment];
    expect(all).toHaveLength(5);
    for (const [index, first] of all.entries()) {
      for (const second of all.slice(index + 1)) {
        expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThan(1);
      }
    }
  });
});

describe('hashText', () => {
  it('gives a stable 32-bit number per text', () => {
    expect(hashText('enclosure-1')).toBe(hashText('enclosure-1'));
    expect(hashText('enclosure-1')).not.toBe(hashText('enclosure-2'));
    expect(Number.isInteger(hashText('x'))).toBe(true);
    expect(hashText('x')).toBeGreaterThanOrEqual(0);
    expect(hashText('x')).toBeLessThan(2 ** 32);
  });
});
