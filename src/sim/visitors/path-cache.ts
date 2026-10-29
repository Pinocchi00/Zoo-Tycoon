import type { GameData } from '../../data/load';
import type { ServiceNeed } from '../../data/schemas/visitors';
import type { BuildingId, EnclosureId } from '../../shared/brand';
import {
  buildingRect,
  buildOccupancy,
  cellIndex,
  CELL_FREE,
  FIRST_OWNER_CODE,
  isWalkable,
  rectCells,
  type Occupancy,
} from '../park/occupancy';
import { outlineCells } from '../park/outline';
import { viewingCells } from '../park/view-score';
import type { BuildingState, EnclosureState, PathTile } from '../park/park-state';
import type { GameState } from '../state';

/** Distance of a cell from which the goal cannot be reached. */
export const UNREACHABLE = -1;

/**
 * Routes on the walkways, derived from the layout and rebuilt when it changes. Each goal has a
 * distance field: for every walkable cell, the number of cells to walk to the closest cell of the
 * goal. A visitor steps to any neighbour one cell closer, so a route costs nothing to follow and
 * all the visitors heading to one goal share it.
 */
export interface PathCache {
  /**
   * The lists the cache was built from. Every change of the layout replaces them (see `commit` in
   * park-change), and so does loading a game: a different list means a stale cache.
   */
  paths: readonly PathTile[] | null;
  enclosures: readonly EnclosureState[] | null;
  buildings: readonly BuildingState[] | null;
  occupancy: Occupancy | null;
  walkableCount: number;
  /** Cells of the entrance plaza, where visitors come in and leave. */
  entranceCells: readonly number[];
  exitField: Int32Array | null;
  needFields: Map<ServiceNeed, Int32Array>;
  /** For each need, the building served from each cell next to one. */
  servicesAt: Map<ServiceNeed, Map<number, BuildingId>>;
  enclosureFields: Map<EnclosureId, Int32Array>;
  /** Reused by every search. */
  queue: Int32Array;
}

export function createPathCache(): PathCache {
  return {
    paths: null,
    enclosures: null,
    buildings: null,
    occupancy: null,
    walkableCount: 0,
    entranceCells: [],
    exitField: null,
    needFields: new Map(),
    servicesAt: new Map(),
    enclosureFields: new Map(),
    queue: new Int32Array(0),
  };
}

/** Rebuilds the layout when the park changed or another game was loaded; cheap otherwise. */
export function syncPathCache(cache: PathCache, state: GameState, data: GameData): Occupancy {
  if (
    cache.occupancy !== null &&
    cache.paths === state.paths &&
    cache.enclosures === state.enclosures &&
    cache.buildings === state.buildings
  ) {
    return cache.occupancy;
  }
  const occupancy = buildOccupancy(state, data);
  cache.paths = state.paths;
  cache.enclosures = state.enclosures;
  cache.buildings = state.buildings;
  cache.occupancy = occupancy;
  cache.walkableCount = occupancy.cells.reduce(
    (count, code) => (isWalkable(code) ? count + 1 : count),
    0,
  );
  cache.entranceCells = rectCells(occupancy, data.terrain.entrance);
  cache.exitField = null;
  cache.needFields.clear();
  cache.servicesAt.clear();
  cache.enclosureFields.clear();
  if (cache.queue.length !== occupancy.cells.length) {
    cache.queue = new Int32Array(occupancy.cells.length);
  }
  return occupancy;
}

function currentOccupancy(cache: PathCache): Occupancy {
  if (cache.occupancy === null) {
    throw new Error('Path cache used before syncPathCache.');
  }
  return cache.occupancy;
}

/** Breadth-first search over the walkable cells, from every source at once. */
function distanceField(cache: PathCache, sources: Iterable<number>): Int32Array {
  const occupancy = currentOccupancy(cache);
  const { columns, rows, cells } = occupancy;
  const field = new Int32Array(cells.length).fill(UNREACHABLE);
  const queue = cache.queue;
  let head = 0;
  let tail = 0;
  for (const source of sources) {
    if (field[source] === UNREACHABLE && isWalkable(cells[source] ?? CELL_FREE)) {
      field[source] = 0;
      queue[tail] = source;
      tail += 1;
    }
  }
  const visit = (cell: number, distance: number): void => {
    if (field[cell] === UNREACHABLE && isWalkable(cells[cell] ?? CELL_FREE)) {
      field[cell] = distance;
      queue[tail] = cell;
      tail += 1;
    }
  };
  while (head < tail) {
    const cell = queue[head] ?? 0;
    head += 1;
    const distance = (field[cell] ?? 0) + 1;
    const column = cell % columns;
    if (cell >= columns) {
      visit(cell - columns, distance);
    }
    if (column < columns - 1) {
      visit(cell + 1, distance);
    }
    if (cell < (rows - 1) * columns) {
      visit(cell + columns, distance);
    }
    if (column > 0) {
      visit(cell - 1, distance);
    }
  }
  return field;
}

export function exitField(cache: PathCache): Int32Array {
  cache.exitField ??= distanceField(cache, cache.entranceCells);
  return cache.exitField;
}

/** Walkable cells sharing a side with each building that serves the need. */
function serviceCells(
  cache: PathCache,
  state: GameState,
  data: GameData,
  need: ServiceNeed,
): Map<number, BuildingId> {
  const occupancy = currentOccupancy(cache);
  const servedFrom = new Map<number, BuildingId>();
  for (const building of state.buildings) {
    if (data.buildings.get(building.itemId)?.serves.includes(need) !== true) {
      continue;
    }
    const rect = buildingRect(building, data);
    const around = {
      column: rect.column - 1,
      row: rect.row - 1,
      width: rect.width + 2,
      depth: rect.depth + 2,
    };
    for (let row = around.row; row < around.row + around.depth; row += 1) {
      for (let column = around.column; column < around.column + around.width; column += 1) {
        const isCorner =
          (row === around.row || row === around.row + around.depth - 1) &&
          (column === around.column || column === around.column + around.width - 1);
        const outside =
          column < 0 || row < 0 || column >= occupancy.columns || row >= occupancy.rows;
        if (isCorner || outside) {
          continue;
        }
        const cell = cellIndex(occupancy, column, row);
        if (isWalkable(occupancy.cells[cell] ?? CELL_FREE) && !servedFrom.has(cell)) {
          servedFrom.set(cell, building.id);
        }
      }
    }
  }
  return servedFrom;
}

export function needField(
  cache: PathCache,
  state: GameState,
  data: GameData,
  need: ServiceNeed,
): Int32Array {
  let field = cache.needFields.get(need);
  if (field === undefined) {
    const servedFrom = serviceCells(cache, state, data, need);
    cache.servicesAt.set(need, servedFrom);
    field = distanceField(cache, servedFrom.keys());
    cache.needFields.set(need, field);
  }
  return field;
}

/** The building a visitor standing on `cell` uses for the need, if any. */
export function serviceAt(
  cache: PathCache,
  state: GameState,
  data: GameData,
  need: ServiceNeed,
  cell: number,
): BuildingId | null {
  needField(cache, state, data, need);
  return cache.servicesAt.get(need)?.get(cell) ?? null;
}

/** Distances to the cells from which the enclosure can be seen; all unreachable if it is gone. */
export function enclosureField(
  cache: PathCache,
  state: GameState,
  data: GameData,
  enclosureId: EnclosureId,
): Int32Array {
  let field = cache.enclosureFields.get(enclosureId);
  if (field === undefined) {
    const occupancy = currentOccupancy(cache);
    const ownerIndex = occupancy.owners.findIndex(
      (owner) => owner.kind === 'enclosure' && owner.id === enclosureId,
    );
    const enclosure = state.enclosures.find((candidate) => candidate.id === enclosureId);
    const spots =
      enclosure === undefined || ownerIndex < 0
        ? []
        : viewingCells(
            occupancy,
            outlineCells(enclosure.outline, occupancy.columns),
            FIRST_OWNER_CODE + ownerIndex,
            data.buildRules.view.rangeCells,
          );
    field = distanceField(cache, spots);
    cache.enclosureFields.set(enclosureId, field);
  }
  return field;
}

/** True when a visitor at the entrance can walk to a spot that sees the enclosure. */
export function isEnclosureReachable(
  cache: PathCache,
  state: GameState,
  data: GameData,
  enclosureId: EnclosureId,
): boolean {
  const [entrance] = cache.entranceCells;
  if (entrance === undefined) {
    return false;
  }
  return (enclosureField(cache, state, data, enclosureId)[entrance] ?? UNREACHABLE) >= 0;
}

/** Distance from `cell` in a field, `UNREACHABLE` outside it. */
export function distanceAt(field: Int32Array, cell: number): number {
  return field[cell] ?? UNREACHABLE;
}

/**
 * The neighbour one cell closer to the goal, checked north, east, south then west so that the
 * choice never depends on anything but the layout. `UNREACHABLE` when `cell` is the goal or
 * cannot reach it.
 */
export function stepTowards(field: Int32Array, cell: number, columns: number): number {
  const distance = distanceAt(field, cell);
  if (distance <= 0) {
    return UNREACHABLE;
  }
  const column = cell % columns;
  const closer = distance - 1;
  if (cell >= columns && field[cell - columns] === closer) {
    return cell - columns;
  }
  if (column < columns - 1 && field[cell + 1] === closer) {
    return cell + 1;
  }
  if (field[cell + columns] === closer) {
    return cell + columns;
  }
  if (column > 0 && field[cell - 1] === closer) {
    return cell - 1;
  }
  throw new Error(`stepTowards: no closer neighbour from cell ${String(cell)}.`);
}
