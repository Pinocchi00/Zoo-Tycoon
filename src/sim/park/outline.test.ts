import { describe, expect, it } from 'vitest';
import { err, ok } from '../../shared/result';
import {
  areCellsConnected,
  checkOutline,
  isCellInside,
  outlineCells,
  transformOutline,
  turnedFootprint,
} from './outline';
import { rectangle, slice } from './test-support';

const { terrain } = slice;
const COLUMNS = terrain.columns;
const MAX_POINTS = slice.buildRules.enclosure.maxOutlinePoints;

function points(...pairs: readonly (readonly [number, number])[]): { x: number; y: number }[] {
  return pairs.map(([x, y]) => ({ x, y }));
}

/** Two 4 × 4-ish blocks joined by a neck too thin to hold a cell centre. */
const NECKED = points(
  [50, 50],
  [54, 50],
  [54, 54],
  [56, 55],
  [60, 55],
  [60, 59],
  [56, 59],
  [56, 56],
  [54, 55],
  [50, 55],
);

describe('checkOutline', () => {
  it('accepts a rectangle, a triangle and a concave shape', () => {
    expect(checkOutline(rectangle(10, 10, 6, 4), terrain, MAX_POINTS)).toEqual(ok(undefined));
    expect(checkOutline(points([0, 0], [4, 0], [0, 4]), terrain, MAX_POINTS)).toEqual(
      ok(undefined),
    );
    const ell = points([0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]);
    expect(checkOutline(ell, terrain, MAX_POINTS)).toEqual(ok(undefined));
    expect(checkOutline(NECKED, terrain, MAX_POINTS)).toEqual(ok(undefined));
  });

  it('accepts corners on the edges of the land', () => {
    expect(checkOutline(rectangle(0, 0, COLUMNS, terrain.rows), terrain, MAX_POINTS)).toEqual(
      ok(undefined),
    );
  });

  it('refuses too few or too many corners', () => {
    expect(checkOutline(points([0, 0], [4, 0]), terrain, MAX_POINTS)).toEqual(
      err('outlineInvalid'),
    );
    const many = Array.from({ length: MAX_POINTS + 1 }, (_unused, index) => ({
      x: index,
      y: index % 2,
    }));
    expect(checkOutline(many, terrain, MAX_POINTS)).toEqual(err('outlineInvalid'));
  });

  it('refuses corners that are not whole numbers', () => {
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const outline = points([0, 0], [4, 0], [4, bad], [0, 4]);
      expect(checkOutline(outline, terrain, MAX_POINTS)).toEqual(err('outlineInvalid'));
    }
  });

  it('refuses corners outside the land', () => {
    expect(checkOutline(rectangle(-1, 0, 4, 4), terrain, MAX_POINTS)).toEqual(err('outOfBounds'));
    expect(checkOutline(rectangle(COLUMNS - 3, 0, 4, 4), terrain, MAX_POINTS)).toEqual(
      err('outOfBounds'),
    );
    expect(checkOutline(rectangle(0, terrain.rows - 3, 4, 4), terrain, MAX_POINTS)).toEqual(
      err('outOfBounds'),
    );
  });

  it('refuses a repeated corner, an edge folding back, a crossing and a flat outline', () => {
    const cases = [
      points([0, 0], [4, 0], [4, 0], [4, 4], [0, 4]),
      points([0, 0], [4, 0], [2, 0], [2, 4]),
      // Bow tie: the second and fourth edges cross.
      points([0, 0], [4, 4], [4, 0], [0, 4]),
      // Two non-neighbouring edges touching at a corner.
      points([0, 0], [4, 0], [4, 4], [2, 0], [0, 4]),
      points([0, 0], [2, 0], [4, 0]),
    ];
    for (const outline of cases) {
      expect(checkOutline(outline, terrain, MAX_POINTS)).toEqual(err('outlineInvalid'));
    }
  });
});

describe('outlineCells', () => {
  it('covers exactly the cells of a rectangle, row by row', () => {
    expect(outlineCells(rectangle(10, 20, 3, 2), COLUMNS)).toEqual([
      20 * COLUMNS + 10,
      20 * COLUMNS + 11,
      20 * COLUMNS + 12,
      21 * COLUMNS + 10,
      21 * COLUMNS + 11,
      21 * COLUMNS + 12,
    ]);
  });

  it('counts the cells whose centre is inside, the diagonal ones included', () => {
    // Centres (c + 0.5, r + 0.5) with c + r ≤ 3: 4 + 3 + 2 + 1.
    const triangle = outlineCells(points([0, 0], [4, 0], [0, 4]), COLUMNS);
    expect(triangle).toHaveLength(10);
    expect(triangle).toContain(3);
    expect(triangle).not.toContain(4);
    expect(triangle).toContain(3 * COLUMNS);
  });

  it('leaves out the notch of a concave shape', () => {
    const ell = outlineCells(points([0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]), COLUMNS);
    expect(ell).toHaveLength(6 * 2 + 2 * 4);
    expect(ell).not.toContain(3 * COLUMNS + 3);
  });

  it('gives the same cells to the same outline started from another corner', () => {
    const outline = points([5, 5], [12, 6], [10, 13], [4, 11]);
    const rotated = [...outline.slice(2), ...outline.slice(0, 2)];
    expect(outlineCells(rotated, COLUMNS)).toEqual(outlineCells(outline, COLUMNS));
    expect(outlineCells([...outline].reverse(), COLUMNS)).toEqual(outlineCells(outline, COLUMNS));
  });
});

describe('areCellsConnected', () => {
  it('accepts a single block and refuses two blocks', () => {
    expect(areCellsConnected(outlineCells(rectangle(0, 0, 4, 4), COLUMNS), COLUMNS)).toBe(true);
    expect(areCellsConnected(outlineCells(NECKED, COLUMNS), COLUMNS)).toBe(false);
    expect(areCellsConnected([], COLUMNS)).toBe(false);
  });

  it('never links the last column of a row to the first column of the next', () => {
    expect(areCellsConnected([COLUMNS - 1, COLUMNS], COLUMNS)).toBe(false);
    expect(areCellsConnected([COLUMNS, COLUMNS - 1], COLUMNS)).toBe(false);
    expect(areCellsConnected([0, 1, COLUMNS + 1], COLUMNS)).toBe(true);
  });
});

describe('transformOutline', () => {
  const outline = rectangle(10, 10, 4, 2);

  it('shifts every corner', () => {
    expect(transformOutline(outline, 3, -2, 0)).toEqual(rectangle(13, 8, 4, 2));
  });

  it('turns a quarter clockwise around the north-west corner of the bounding box', () => {
    const turned = transformOutline(outline, 0, 0, 1);
    expect(turned).toEqual(points([12, 10], [12, 14], [10, 14], [10, 10]));
    expect(outlineCells(turned, COLUMNS)).toHaveLength(8);
  });

  it('comes back to the start after four quarter turns', () => {
    const shape = points([0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]);
    let turned = shape;
    for (let turn = 0; turn < 4; turn += 1) {
      turned = transformOutline(turned, 0, 0, 1);
    }
    expect(turned).toEqual(shape);
    expect(transformOutline(shape, 0, 0, 2)).toEqual(
      transformOutline(transformOutline(shape, 0, 0, 1), 0, 0, 1),
    );
  });
});

describe('footprints and cells', () => {
  it('swaps width and depth on odd quarter turns', () => {
    expect(turnedFootprint(3, 2, 0)).toEqual({ width: 3, depth: 2 });
    expect(turnedFootprint(3, 2, 1)).toEqual({ width: 2, depth: 3 });
    expect(turnedFootprint(3, 2, 2)).toEqual({ width: 3, depth: 2 });
    expect(turnedFootprint(3, 2, 3)).toEqual({ width: 2, depth: 3 });
  });

  it('knows which cells belong to the land', () => {
    expect(isCellInside(terrain, { column: 0, row: 0 })).toBe(true);
    expect(isCellInside(terrain, { column: COLUMNS - 1, row: terrain.rows - 1 })).toBe(true);
    expect(isCellInside(terrain, { column: COLUMNS, row: 0 })).toBe(false);
    expect(isCellInside(terrain, { column: 0, row: -1 })).toBe(false);
    expect(isCellInside(terrain, { column: 0.5, row: 0 })).toBe(false);
  });
});
