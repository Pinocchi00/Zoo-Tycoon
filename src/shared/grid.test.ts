import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE_M,
  cellCenterX,
  cellCenterZ,
  createGridSize,
  gridDepth,
  gridWidth,
  worldToCell,
  type CellCoord,
} from './grid';

describe('createGridSize', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %s columns or rows',
    (bad) => {
      expect(() => createGridSize(bad, 4)).toThrow(RangeError);
      expect(() => createGridSize(4, bad)).toThrow(RangeError);
    },
  );

  it('measures the grid in metres', () => {
    const grid = createGridSize(8, 6);
    expect(gridWidth(grid)).toBe(8 * CELL_SIZE_M);
    expect(gridDepth(grid)).toBe(6 * CELL_SIZE_M);
  });
});

describe('cell coordinates', () => {
  const grid = createGridSize(4, 2);

  it('centres the grid on the origin', () => {
    expect(cellCenterX(grid, 0)).toBe(-1.5);
    expect(cellCenterX(grid, 3)).toBe(1.5);
    expect(cellCenterZ(grid, 0)).toBe(-0.5);
    expect(cellCenterZ(grid, 1)).toBe(0.5);
  });

  it('finds the cell back from its centre, for every cell', () => {
    const out: CellCoord = { column: -1, row: -1 };
    for (let column = 0; column < grid.columns; column += 1) {
      for (let row = 0; row < grid.rows; row += 1) {
        expect(worldToCell(grid, cellCenterX(grid, column), cellCenterZ(grid, row), out)).toBe(
          true,
        );
        expect(out).toEqual({ column, row });
      }
    }
  });

  it('puts a point on a cell border in the cell after it', () => {
    const out: CellCoord = { column: -1, row: -1 };
    expect(worldToCell(grid, 0, 0, out)).toBe(true);
    expect(out).toEqual({ column: 2, row: 1 });
  });

  it.each([
    [-2.01, 0],
    [2, 0],
    [0, -1.01],
    [0, 1],
  ])('leaves the output untouched outside the grid at (%s, %s)', (x, z) => {
    const out: CellCoord = { column: 7, row: 7 };
    expect(worldToCell(grid, x, z, out)).toBe(false);
    expect(out).toEqual({ column: 7, row: 7 });
  });
});
