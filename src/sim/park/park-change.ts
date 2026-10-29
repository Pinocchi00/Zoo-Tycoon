import type { GameData } from '../../data/load';
import type { BuildingId, EnclosureId, ItemId, SpeciesId } from '../../shared/brand';
import { err, ok, type Result } from '../../shared/result';
import { emit, type EventQueue } from '../events';
import type { GameState } from '../state';
import type { BuildError } from './build-errors';
import {
  addOwner,
  buildingRect,
  buildOccupancy,
  CELL_FREE,
  CELL_PATH,
  rectCells,
  touchesWalkway,
  type Occupancy,
} from './occupancy';
import { areCellsConnected, checkOutline, isCellInside, outlineCells } from './outline';
import {
  cloneBuilding,
  cloneEnclosure,
  compareIds,
  comparePathTiles,
  type BuildingState,
  type EnclosureState,
  type PathTile,
} from './park-state';
import { refreshViewScores } from './view-score';

/** One object before and after a change; null means absent. Both sides share the same id. */
export interface ObjectChange<T> {
  readonly before: T | null;
  readonly after: T | null;
}

export interface PathTileChange {
  readonly column: number;
  readonly row: number;
  readonly before: ItemId | null;
  readonly after: ItemId | null;
}

/**
 * Everything one construction command changed. Applying `after` does it, applying `before`
 * (see `invertChange`) undoes it; the exact coin delta makes undo give back exactly what was paid.
 */
export interface ParkChange {
  readonly enclosures: readonly ObjectChange<EnclosureState>[];
  readonly buildings: readonly ObjectChange<BuildingState>[];
  readonly paths: readonly PathTileChange[];
  readonly coinsDelta: number;
}

/** Session-only history of construction, never saved (GDD: unlimited undo during the session). */
export interface BuildHistory {
  undo: ParkChange[];
  redo: ParkChange[];
}

export function createBuildHistory(): BuildHistory {
  return { undo: [], redo: [] };
}

export function isEmptyChange(change: ParkChange): boolean {
  return (
    change.enclosures.length === 0 &&
    change.buildings.length === 0 &&
    change.paths.length === 0 &&
    change.coinsDelta === 0
  );
}

export function invertChange(change: ParkChange): ParkChange {
  return {
    enclosures: change.enclosures.map(({ before, after }) => ({ before: after, after: before })),
    buildings: change.buildings.map(({ before, after }) => ({ before: after, after: before })),
    paths: change.paths.map((tile) => ({ ...tile, before: tile.after, after: tile.before })),
    coinsDelta: -change.coinsDelta,
  };
}

function idOf<T extends { readonly id: string }>(change: ObjectChange<T>): T['id'] {
  const object = change.after ?? change.before;
  if (object === null) {
    throw new Error('ObjectChange with neither side: never built.');
  }
  return object.id;
}

function exclusionsOf(
  change: ParkChange,
  columns: number,
): {
  enclosures: Set<EnclosureId>;
  buildings: Set<BuildingId>;
  pathCells: Set<number>;
} {
  return {
    enclosures: new Set(change.enclosures.map(idOf)),
    buildings: new Set(change.buildings.map(idOf)),
    pathCells: new Set(change.paths.map((tile) => tile.row * columns + tile.column)),
  };
}

function placePathTiles(
  change: ParkChange,
  occupancy: Occupancy,
  data: GameData,
): Result<void, BuildError> {
  for (const tile of change.paths) {
    if (tile.after === null) {
      continue;
    }
    if (!data.pathSurfaces.has(tile.after)) {
      return err('unknownPathSurface');
    }
    if (!isCellInside(data.terrain, tile)) {
      return err('outOfBounds');
    }
    const cell = tile.row * occupancy.columns + tile.column;
    if (occupancy.cells[cell] !== CELL_FREE) {
      return err('cellOccupied');
    }
    occupancy.cells[cell] = CELL_PATH;
  }
  return ok(undefined);
}

/** The smallest area allowed: the smallest enclosure size, or the size the species needs. */
function minimumArea(speciesId: SpeciesId | null, data: GameData): number {
  const smallest = data.enclosureSizes.S.minAreaCells;
  if (speciesId === null) {
    return smallest;
  }
  const species = data.species.get(speciesId);
  if (species === undefined) {
    return smallest;
  }
  return Math.max(smallest, data.enclosureSizes[species.minEnclosureSize].minAreaCells);
}

function placeEnclosure(
  state: GameState,
  enclosure: EnclosureState,
  occupancy: Occupancy,
  data: GameData,
): Result<void, BuildError> {
  const { terrain, buildRules } = data;
  const checked = checkOutline(enclosure.outline, terrain, buildRules.enclosure.maxOutlinePoints);
  if (!checked.ok) {
    return checked;
  }
  if (
    enclosure.speciesId !== null &&
    !state.gacha.collection.some((progress) => progress.speciesId === enclosure.speciesId)
  ) {
    return err('speciesNotMet');
  }
  const cells = outlineCells(enclosure.outline, occupancy.columns);
  if (cells.length > buildRules.enclosure.maxAreaCells) {
    return err('enclosureTooLarge');
  }
  if (cells.length < minimumArea(enclosure.speciesId, data)) {
    return err('enclosureTooSmall');
  }
  if (!areCellsConnected(cells, occupancy.columns)) {
    return err('enclosureSplit');
  }
  if (cells.some((cell) => occupancy.cells[cell] !== CELL_FREE)) {
    return err('cellOccupied');
  }
  const code = addOwner(occupancy, { kind: 'enclosure', id: enclosure.id });
  for (const cell of cells) {
    occupancy.cells[cell] = code;
  }
  return ok(undefined);
}

function placeBuilding(
  building: BuildingState,
  occupancy: Occupancy,
  data: GameData,
): Result<void, BuildError> {
  if (!data.buildings.has(building.itemId)) {
    return err('unknownBuilding');
  }
  if (!Number.isSafeInteger(building.column) || !Number.isSafeInteger(building.row)) {
    return err('invalidPosition');
  }
  const rect = buildingRect(building, data);
  const { terrain } = data;
  if (
    rect.column < 0 ||
    rect.row < 0 ||
    rect.column + rect.width > terrain.columns ||
    rect.row + rect.depth > terrain.rows
  ) {
    return err('outOfBounds');
  }
  const cells = rectCells(occupancy, rect);
  if (cells.some((cell) => occupancy.cells[cell] !== CELL_FREE)) {
    return err('cellOccupied');
  }
  const code = addOwner(occupancy, { kind: 'building', id: building.id });
  for (const cell of cells) {
    occupancy.cells[cell] = code;
  }
  return ok(undefined);
}

/** Each group lives in one enclosure at most: a change that breaks this is a bug of its maker. */
function assertOneEnclosurePerGroup(state: GameState, change: ParkChange): void {
  const changed = new Set(change.enclosures.map(idOf));
  const housed = new Set<SpeciesId>();
  const enclosures = [
    ...state.enclosures.filter((enclosure) => !changed.has(enclosure.id)),
    ...change.enclosures.flatMap(({ after }) => (after === null ? [] : [after])),
  ];
  for (const { speciesId } of enclosures) {
    if (speciesId !== null) {
      if (housed.has(speciesId)) {
        throw new Error(`ParkChange puts the group "${speciesId}" in two enclosures.`);
      }
      housed.add(speciesId);
    }
  }
}

function validate(state: GameState, change: ParkChange, data: GameData): Result<void, BuildError> {
  const occupancy = buildOccupancy(state, data, exclusionsOf(change, data.terrain.columns));
  const paths = placePathTiles(change, occupancy, data);
  if (!paths.ok) {
    return paths;
  }
  for (const { after } of change.enclosures) {
    if (after !== null) {
      const placed = placeEnclosure(state, after, occupancy, data);
      if (!placed.ok) {
        return placed;
      }
    }
  }
  for (const { after } of change.buildings) {
    if (after !== null) {
      const placed = placeBuilding(after, occupancy, data);
      if (!placed.ok) {
        return placed;
      }
    }
  }
  for (const { after } of change.buildings) {
    const kind = after === null ? undefined : data.buildings.get(after.itemId);
    if (after !== null && kind?.requiresPath === true) {
      if (!touchesWalkway(occupancy, buildingRect(after, data))) {
        return err('buildingNotOnPath');
      }
    }
  }
  assertOneEnclosurePerGroup(state, change);
  const total = state.currencies.coins + change.coinsDelta;
  if (total < 0) {
    return err('notEnoughCoins');
  }
  if (!Number.isSafeInteger(total)) {
    return err('currencyOverflow');
  }
  return ok(undefined);
}

function commit(state: GameState, change: ParkChange, columns: number): void {
  const exclusions = exclusionsOf(change, columns);
  state.enclosures = [
    ...state.enclosures.filter((enclosure) => !exclusions.enclosures.has(enclosure.id)),
    ...change.enclosures.flatMap(({ after }) => (after === null ? [] : [cloneEnclosure(after)])),
  ].sort((a, b) => compareIds(a.id, b.id));
  state.buildings = [
    ...state.buildings.filter((building) => !exclusions.buildings.has(building.id)),
    ...change.buildings.flatMap(({ after }) => (after === null ? [] : [cloneBuilding(after)])),
  ].sort((a, b) => compareIds(a.id, b.id));
  state.paths = [
    ...state.paths.filter((tile) => !exclusions.pathCells.has(tile.row * columns + tile.column)),
    ...change.paths.flatMap(({ column, row, after }): PathTile[] =>
      after === null ? [] : [{ column, row, surface: after }],
    ),
  ].sort(comparePathTiles);
  state.currencies.coins += change.coinsDelta;
}

function sameOutline(a: EnclosureState, b: EnclosureState): boolean {
  return (
    a.outline.length === b.outline.length &&
    a.outline.every((point, index) => {
      const other = b.outline[index];
      return other?.x === point.x && other.y === point.y;
    })
  );
}

function emitEnclosureEvents(change: ParkChange, events: EventQueue): void {
  const housedAfter = new Set(change.enclosures.map(({ after }) => after?.speciesId ?? null));
  for (const { before, after } of change.enclosures) {
    if (before === null && after !== null) {
      emit(events, { type: 'enclosurePlaced', enclosureId: after.id, speciesId: after.speciesId });
    } else if (before !== null && after === null) {
      const returned = before.speciesId;
      emit(events, {
        type: 'enclosureRemoved',
        enclosureId: before.id,
        returnedSpeciesId: returned !== null && !housedAfter.has(returned) ? returned : null,
      });
    } else if (before !== null && after !== null) {
      if (!sameOutline(before, after)) {
        emit(events, { type: 'enclosureMoved', enclosureId: after.id });
      }
      if (before.speciesId !== after.speciesId) {
        const event = { enclosureId: after.id, speciesId: after.speciesId };
        emit(events, { type: 'enclosureGroupChanged', ...event });
      }
    }
  }
}

function emitChangeEvents(change: ParkChange, state: GameState, events: EventQueue): void {
  if (change.paths.length > 0) {
    const tiles = change.paths.map(({ column, row, after }) => ({ column, row, surface: after }));
    emit(events, { type: 'pathTilesChanged', tiles });
  }
  emitEnclosureEvents(change, events);
  for (const { before, after } of change.buildings) {
    if (before === null && after !== null) {
      emit(events, { type: 'buildingPlaced', buildingId: after.id, itemId: after.itemId });
    } else if (before !== null && after === null) {
      emit(events, { type: 'buildingRemoved', buildingId: before.id });
    } else if (after !== null) {
      emit(events, { type: 'buildingMoved', buildingId: after.id });
    }
  }
  if (change.coinsDelta !== 0) {
    const total = state.currencies.coins;
    emit(events, { type: 'buildCoinsChanged', delta: change.coinsDelta, total });
  }
}

/**
 * Validates the whole change against the park without its changed objects, then applies it and
 * refreshes the view scores. A refused change leaves the state untouched.
 */
export function applyParkChange(
  state: GameState,
  change: ParkChange,
  data: GameData,
  events: EventQueue,
): Result<void, BuildError> {
  const valid = validate(state, change, data);
  if (!valid.ok) {
    return valid;
  }
  commit(state, change, data.terrain.columns);
  emitChangeEvents(change, state, events);
  refreshViewScores(state, data, events);
  return ok(undefined);
}
