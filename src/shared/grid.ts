/** Side of one construction cell, in metres (one world unit is one metre). */
export const CELL_SIZE_M = 1;

/** A rectangle of cells lying on the ground (XZ plane), centred on the world origin. */
export interface GridSize {
  readonly columns: number;
  readonly rows: number;
}

/** A cell position, reused by callers to avoid allocating while converting. */
export interface CellCoord {
  column: number;
  row: number;
}

export function createGridSize(columns: number, rows: number): GridSize {
  if (!Number.isSafeInteger(columns) || columns <= 0) {
    throw new RangeError(`columns must be a positive integer, got ${String(columns)}.`);
  }
  if (!Number.isSafeInteger(rows) || rows <= 0) {
    throw new RangeError(`rows must be a positive integer, got ${String(rows)}.`);
  }
  return { columns, rows };
}

/** Extent of the grid along X, in metres. */
export function gridWidth(size: GridSize): number {
  return size.columns * CELL_SIZE_M;
}

/** Extent of the grid along Z, in metres. */
export function gridDepth(size: GridSize): number {
  return size.rows * CELL_SIZE_M;
}

/** World X of the centre of `column`. */
export function cellCenterX(size: GridSize, column: number): number {
  return (column + 0.5) * CELL_SIZE_M - gridWidth(size) / 2;
}

/** World Z of the centre of `row`. */
export function cellCenterZ(size: GridSize, row: number): number {
  return (row + 0.5) * CELL_SIZE_M - gridDepth(size) / 2;
}

/**
 * Writes into `out` the cell under the world point (x, z).
 * Returns false, leaving `out` untouched, when the point is outside the grid.
 */
export function worldToCell(size: GridSize, x: number, z: number, out: CellCoord): boolean {
  const column = Math.floor((x + gridWidth(size) / 2) / CELL_SIZE_M);
  const row = Math.floor((z + gridDepth(size) / 2) / CELL_SIZE_M);
  if (column < 0 || column >= size.columns || row < 0 || row >= size.rows) {
    return false;
  }
  out.column = column;
  out.row = row;
  return true;
}
