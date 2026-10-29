import type { GameData } from '../../data/load';
import type { CellRect, Terrain } from '../../data/schemas/build';
import type { BuildingId, EnclosureId } from '../../shared/brand';
import type { GameState } from '../state';
import { outlineCells, turnedFootprint } from './outline';
import type { BuildingState } from './park-state';

export const CELL_FREE = 0;
export const CELL_ENTRANCE = 1;
export const CELL_PATH = 2;
/** Codes from this one up name an owner: `owners[code - FIRST_OWNER_CODE]`. */
export const FIRST_OWNER_CODE = 3;

export type OccupancyOwner =
  | { readonly kind: 'enclosure'; readonly id: EnclosureId }
  | { readonly kind: 'building'; readonly id: BuildingId };

/**
 * What covers each cell. Derived from the state, never saved: commands rebuild it, and app may
 * keep one to preview a placement while the player drags.
 */
export interface Occupancy {
  readonly columns: number;
  readonly rows: number;
  /** `row * columns + column` → CELL_FREE, CELL_ENTRANCE, CELL_PATH or an owner code. */
  readonly cells: Int32Array;
  readonly owners: OccupancyOwner[];
}

/** What to leave out, so that a changed object does not collide with its own old place. */
export interface OccupancyExclusions {
  readonly enclosures: ReadonlySet<EnclosureId>;
  readonly buildings: ReadonlySet<BuildingId>;
  readonly pathCells: ReadonlySet<number>;
}

const NO_EXCLUSIONS: OccupancyExclusions = {
  enclosures: new Set(),
  buildings: new Set(),
  pathCells: new Set(),
};

export function cellIndex(occupancy: Occupancy, column: number, row: number): number {
  return row * occupancy.columns + column;
}

export function addOwner(occupancy: Occupancy, owner: OccupancyOwner): number {
  occupancy.owners.push(owner);
  return FIRST_OWNER_CODE + occupancy.owners.length - 1;
}

export function rectCells(occupancy: Occupancy, rect: CellRect): number[] {
  const cells: number[] = [];
  for (let row = rect.row; row < rect.row + rect.depth; row += 1) {
    for (let column = rect.column; column < rect.column + rect.width; column += 1) {
      cells.push(cellIndex(occupancy, column, row));
    }
  }
  return cells;
}

/** The footprint rectangle of a building, after rotation. */
export function buildingRect(building: BuildingState, data: GameData): CellRect {
  const kind = data.buildings.get(building.itemId);
  if (kind === undefined) {
    throw new Error(`buildingRect: unknown building "${building.itemId}", checked before.`);
  }
  const { width, depth } = turnedFootprint(
    kind.footprint.width,
    kind.footprint.depth,
    building.quarterTurns,
  );
  return { column: building.column, row: building.row, width, depth };
}

function createOccupancy(terrain: Terrain): Occupancy {
  const occupancy: Occupancy = {
    columns: terrain.columns,
    rows: terrain.rows,
    cells: new Int32Array(terrain.columns * terrain.rows),
    owners: [],
  };
  for (const cell of rectCells(occupancy, terrain.entrance)) {
    occupancy.cells[cell] = CELL_ENTRANCE;
  }
  return occupancy;
}

/** Fills the occupancy from a valid state, leaving out the excluded objects. */
export function buildOccupancy(
  state: GameState,
  data: GameData,
  exclusions: OccupancyExclusions = NO_EXCLUSIONS,
): Occupancy {
  const occupancy = createOccupancy(data.terrain);
  for (const tile of state.paths) {
    const cell = cellIndex(occupancy, tile.column, tile.row);
    if (!exclusions.pathCells.has(cell)) {
      occupancy.cells[cell] = CELL_PATH;
    }
  }
  for (const enclosure of state.enclosures) {
    if (!exclusions.enclosures.has(enclosure.id)) {
      const code = addOwner(occupancy, { kind: 'enclosure', id: enclosure.id });
      for (const cell of outlineCells(enclosure.outline, occupancy.columns)) {
        occupancy.cells[cell] = code;
      }
    }
  }
  for (const building of state.buildings) {
    if (!exclusions.buildings.has(building.id)) {
      const code = addOwner(occupancy, { kind: 'building', id: building.id });
      for (const cell of rectCells(occupancy, buildingRect(building, data))) {
        occupancy.cells[cell] = code;
      }
    }
  }
  return occupancy;
}

/** A path or the entrance plaza: where visitors walk and look from. */
export function isWalkable(code: number): boolean {
  return code === CELL_PATH || code === CELL_ENTRANCE;
}

/** True when a cell sharing a side with the rectangle is walkable. */
export function touchesWalkway(occupancy: Occupancy, rect: CellRect): boolean {
  const lastColumn = rect.column + rect.width - 1;
  const lastRow = rect.row + rect.depth - 1;
  const isWalkableAt = (column: number, row: number): boolean =>
    column >= 0 &&
    column < occupancy.columns &&
    row >= 0 &&
    row < occupancy.rows &&
    isWalkable(occupancy.cells[cellIndex(occupancy, column, row)] ?? CELL_FREE);
  for (let column = rect.column; column <= lastColumn; column += 1) {
    if (isWalkableAt(column, rect.row - 1) || isWalkableAt(column, lastRow + 1)) {
      return true;
    }
  }
  for (let row = rect.row; row <= lastRow; row += 1) {
    if (isWalkableAt(rect.column - 1, row) || isWalkableAt(lastColumn + 1, row)) {
      return true;
    }
  }
  return false;
}
