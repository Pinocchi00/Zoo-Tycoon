import type { GameData } from '../../data/load';
import { BASIS_POINTS_TOTAL } from '../../data/schemas/common';
import type { BuildingId, EnclosureId, ItemId, SpeciesId } from '../../shared/brand';
import { err, ok, type Result } from '../../shared/result';
import { emit, type EventQueue } from '../events';
import type { GameState } from '../state';
import type { BuildError } from './build-errors';
import { isCellInside, transformOutline } from './outline';
import {
  applyParkChange,
  invertChange,
  isEmptyChange,
  type ObjectChange,
  type ParkChange,
  type PathTileChange,
} from './park-change';
import {
  comparePathTiles,
  isQuarterTurns,
  makeBuildingId,
  makeEnclosureId,
  type BuildingState,
  type CellPosition,
  type EnclosureState,
  type GridPoint,
} from './park-state';

/** Paves cells, or changes their surface; all or nothing. */
export interface PlacePathCommand {
  readonly type: 'placePath';
  readonly cells: readonly CellPosition[];
  readonly surface: ItemId;
}

/** Takes up the path on the given cells; cells without a path are skipped. */
export interface RemovePathCommand {
  readonly type: 'removePath';
  readonly cells: readonly CellPosition[];
}

/** A new, empty enclosure along the traced outline. Free: the habitat comes with the arrival. */
export interface PlaceEnclosureCommand {
  readonly type: 'placeEnclosure';
  readonly outline: readonly GridPoint[];
}

/** Free move; the group inside follows. Turns happen around the outline's north-west corner. */
export interface MoveEnclosureCommand {
  readonly type: 'moveEnclosure';
  readonly enclosureId: EnclosureId;
  readonly offsetColumns: number;
  readonly offsetRows: number;
  /** 0 to 3 clockwise; checked, since commands come from outside. */
  readonly quarterTurns: number;
}

/** Free; the group inside goes back to the refuge, never lost. */
export interface RemoveEnclosureCommand {
  readonly type: 'removeEnclosure';
  readonly enclosureId: EnclosureId;
}

/** Puts a species' whole group in an enclosure; from another enclosure, the group moves. */
export interface InstallGroupCommand {
  readonly type: 'installGroup';
  readonly enclosureId: EnclosureId;
  readonly speciesId: SpeciesId;
}

export interface PlaceBuildingCommand {
  readonly type: 'placeBuilding';
  readonly itemId: ItemId;
  /** North-west cell of the footprint, after rotation. */
  readonly column: number;
  readonly row: number;
  /** 0 to 3 clockwise; checked, since commands come from outside. */
  readonly quarterTurns: number;
}

/** Free move to a new place and rotation. */
export interface MoveBuildingCommand {
  readonly type: 'moveBuilding';
  readonly buildingId: BuildingId;
  readonly column: number;
  readonly row: number;
  readonly quarterTurns: number;
}

export interface RemoveBuildingCommand {
  readonly type: 'removeBuilding';
  readonly buildingId: BuildingId;
}

export interface UndoBuildCommand {
  readonly type: 'undoBuild';
}

export interface RedoBuildCommand {
  readonly type: 'redoBuild';
}

/** A construction command: it lands in the session's undo history. */
export type ParkCommand =
  | PlacePathCommand
  | RemovePathCommand
  | PlaceEnclosureCommand
  | MoveEnclosureCommand
  | RemoveEnclosureCommand
  | InstallGroupCommand
  | PlaceBuildingCommand
  | MoveBuildingCommand
  | RemoveBuildingCommand;

export type BuildCommand = ParkCommand | UndoBuildCommand | RedoBuildCommand;

const NO_CHANGE: ParkChange = { enclosures: [], buildings: [], paths: [], coinsDelta: 0 };

function refund(price: number, data: GameData): number {
  return Math.floor((price * data.buildRules.refundRateBp) / BASIS_POINTS_TOTAL);
}

function surfaceCost(surface: ItemId | null, data: GameData): number {
  return surface === null ? 0 : (data.pathSurfaces.get(surface)?.coinCostPerCell ?? 0);
}

/** The listed cells, once each, in path order; refused if one is not a whole cell of the land. */
function distinctCells(
  cells: readonly CellPosition[],
  data: GameData,
): Result<CellPosition[], BuildError> {
  if (cells.length === 0) {
    return err('noCells');
  }
  const byIndex = new Map<number, CellPosition>();
  for (const cell of cells) {
    if (!Number.isSafeInteger(cell.column) || !Number.isSafeInteger(cell.row)) {
      return err('invalidPosition');
    }
    if (!isCellInside(data.terrain, cell)) {
      return err('outOfBounds');
    }
    byIndex.set(cell.row * data.terrain.columns + cell.column, {
      column: cell.column,
      row: cell.row,
    });
  }
  return ok([...byIndex.values()].sort(comparePathTiles));
}

/** Surface of each paved cell, by `row * columns + column`. */
function pathSurfaces(state: GameState, columns: number): Map<number, ItemId> {
  return new Map(state.paths.map((tile) => [tile.row * columns + tile.column, tile.surface]));
}

function proposePlacePath(
  state: GameState,
  command: PlacePathCommand,
  data: GameData,
): Result<ParkChange, BuildError> {
  if (!data.pathSurfaces.has(command.surface)) {
    return err('unknownPathSurface');
  }
  const cells = distinctCells(command.cells, data);
  if (!cells.ok) {
    return cells;
  }
  const surfaces = pathSurfaces(state, data.terrain.columns);
  const paths: PathTileChange[] = [];
  let price = 0;
  let given = 0;
  for (const cell of cells.value) {
    const before = surfaces.get(cell.row * data.terrain.columns + cell.column) ?? null;
    if (before !== command.surface) {
      paths.push({ ...cell, before, after: command.surface });
      price += surfaceCost(command.surface, data);
      given += surfaceCost(before, data);
    }
  }
  const coinsDelta = refund(given, data) - price;
  return ok({ ...NO_CHANGE, paths, coinsDelta });
}

function proposeRemovePath(
  state: GameState,
  command: RemovePathCommand,
  data: GameData,
): Result<ParkChange, BuildError> {
  const cells = distinctCells(command.cells, data);
  if (!cells.ok) {
    return cells;
  }
  const surfaces = pathSurfaces(state, data.terrain.columns);
  const paths: PathTileChange[] = [];
  let given = 0;
  for (const cell of cells.value) {
    const before = surfaces.get(cell.row * data.terrain.columns + cell.column) ?? null;
    if (before !== null) {
      paths.push({ ...cell, before, after: null });
      given += surfaceCost(before, data);
    }
  }
  if (paths.length === 0) {
    return err('noPathThere');
  }
  return ok({ ...NO_CHANGE, paths, coinsDelta: refund(given, data) });
}

function proposePlaceEnclosure(state: GameState, command: PlaceEnclosureCommand): ParkChange {
  const after: EnclosureState = {
    id: makeEnclosureId(state.nextIds.enclosure),
    outline: command.outline.map((point) => ({ x: point.x, y: point.y })),
    speciesId: null,
    viewScore: 0,
  };
  return { ...NO_CHANGE, enclosures: [{ before: null, after }] };
}

function findEnclosure(state: GameState, id: EnclosureId): Result<EnclosureState, BuildError> {
  const enclosure = state.enclosures.find((candidate) => candidate.id === id);
  return enclosure === undefined ? err('unknownEnclosure') : ok(enclosure);
}

function proposeMoveEnclosure(
  state: GameState,
  command: MoveEnclosureCommand,
): Result<ParkChange, BuildError> {
  const before = findEnclosure(state, command.enclosureId);
  if (!before.ok) {
    return before;
  }
  if (
    !Number.isSafeInteger(command.offsetColumns) ||
    !Number.isSafeInteger(command.offsetRows) ||
    !isQuarterTurns(command.quarterTurns)
  ) {
    return err('invalidPosition');
  }
  if (command.offsetColumns === 0 && command.offsetRows === 0 && command.quarterTurns === 0) {
    return ok(NO_CHANGE);
  }
  const outline = transformOutline(
    before.value.outline,
    command.offsetColumns,
    command.offsetRows,
    command.quarterTurns,
  );
  return ok({
    ...NO_CHANGE,
    enclosures: [{ before: before.value, after: { ...before.value, outline } }],
  });
}

function proposeRemoveEnclosure(
  state: GameState,
  command: RemoveEnclosureCommand,
): Result<ParkChange, BuildError> {
  const before = findEnclosure(state, command.enclosureId);
  if (!before.ok) {
    return before;
  }
  return ok({ ...NO_CHANGE, enclosures: [{ before: before.value, after: null }] });
}

function proposeInstallGroup(
  state: GameState,
  command: InstallGroupCommand,
): Result<ParkChange, BuildError> {
  if (!state.gacha.collection.some((progress) => progress.speciesId === command.speciesId)) {
    return err('speciesNotMet');
  }
  const target = findEnclosure(state, command.enclosureId);
  if (!target.ok) {
    return target;
  }
  if (target.value.speciesId === command.speciesId) {
    return err('groupAlreadyThere');
  }
  if (target.value.speciesId !== null) {
    return err('enclosureOccupied');
  }
  const enclosures: ObjectChange<EnclosureState>[] = [
    { before: target.value, after: { ...target.value, speciesId: command.speciesId } },
  ];
  const home = state.enclosures.find((enclosure) => enclosure.speciesId === command.speciesId);
  if (home !== undefined) {
    enclosures.push({ before: home, after: { ...home, speciesId: null } });
  }
  return ok({ ...NO_CHANGE, enclosures });
}

function proposePlaceBuilding(
  state: GameState,
  command: PlaceBuildingCommand,
  data: GameData,
): Result<ParkChange, BuildError> {
  const kind = data.buildings.get(command.itemId);
  if (kind === undefined) {
    return err('unknownBuilding');
  }
  if (!isQuarterTurns(command.quarterTurns)) {
    return err('invalidPosition');
  }
  const after: BuildingState = {
    id: makeBuildingId(state.nextIds.building),
    itemId: command.itemId,
    column: command.column,
    row: command.row,
    quarterTurns: command.quarterTurns,
  };
  return ok({ ...NO_CHANGE, buildings: [{ before: null, after }], coinsDelta: -kind.coinCost });
}

function findBuilding(state: GameState, id: BuildingId): Result<BuildingState, BuildError> {
  const building = state.buildings.find((candidate) => candidate.id === id);
  return building === undefined ? err('unknownPlacedBuilding') : ok(building);
}

function proposeMoveBuilding(
  state: GameState,
  command: MoveBuildingCommand,
): Result<ParkChange, BuildError> {
  const before = findBuilding(state, command.buildingId);
  if (!before.ok) {
    return before;
  }
  if (!isQuarterTurns(command.quarterTurns)) {
    return err('invalidPosition');
  }
  const after: BuildingState = {
    ...before.value,
    column: command.column,
    row: command.row,
    quarterTurns: command.quarterTurns,
  };
  const unchanged =
    after.column === before.value.column &&
    after.row === before.value.row &&
    after.quarterTurns === before.value.quarterTurns;
  return ok(unchanged ? NO_CHANGE : { ...NO_CHANGE, buildings: [{ before: before.value, after }] });
}

function proposeRemoveBuilding(
  state: GameState,
  command: RemoveBuildingCommand,
  data: GameData,
): Result<ParkChange, BuildError> {
  const before = findBuilding(state, command.buildingId);
  if (!before.ok) {
    return before;
  }
  const price = data.buildings.get(before.value.itemId)?.coinCost ?? 0;
  return ok({
    ...NO_CHANGE,
    buildings: [{ before: before.value, after: null }],
    coinsDelta: refund(price, data),
  });
}

function propose(
  state: GameState,
  command: ParkCommand,
  data: GameData,
): Result<ParkChange, BuildError> {
  switch (command.type) {
    case 'placePath':
      return proposePlacePath(state, command, data);
    case 'removePath':
      return proposeRemovePath(state, command, data);
    case 'placeEnclosure':
      return ok(proposePlaceEnclosure(state, command));
    case 'moveEnclosure':
      return proposeMoveEnclosure(state, command);
    case 'removeEnclosure':
      return proposeRemoveEnclosure(state, command);
    case 'installGroup':
      return proposeInstallGroup(state, command);
    case 'placeBuilding':
      return proposePlaceBuilding(state, command, data);
    case 'moveBuilding':
      return proposeMoveBuilding(state, command);
    case 'removeBuilding':
      return proposeRemoveBuilding(state, command, data);
  }
}

function emitHistory(state: GameState, events: EventQueue): void {
  const { undo, redo } = state.session.buildHistory;
  emit(events, { type: 'buildHistoryChanged', undoCount: undo.length, redoCount: redo.length });
}

function countNewIds(state: GameState, change: ParkChange): void {
  for (const { before, after } of change.enclosures) {
    if (before === null && after !== null) {
      state.nextIds.enclosure += 1;
    }
  }
  for (const { before, after } of change.buildings) {
    if (before === null && after !== null) {
      state.nextIds.building += 1;
    }
  }
}

function performParkCommand(
  state: GameState,
  command: ParkCommand,
  data: GameData,
  events: EventQueue,
): Result<void, BuildError> {
  const change = propose(state, command, data);
  if (!change.ok) {
    return change;
  }
  if (isEmptyChange(change.value)) {
    return ok(undefined);
  }
  const applied = applyParkChange(state, change.value, data, events);
  if (!applied.ok) {
    return applied;
  }
  countNewIds(state, change.value);
  const history = state.session.buildHistory;
  history.undo.push(change.value);
  history.redo = [];
  emitHistory(state, events);
  return ok(undefined);
}

/** Undo gives back exactly what was paid; ids are kept, so a redo restores the very same objects. */
function undoBuild(state: GameState, data: GameData, events: EventQueue): Result<void, BuildError> {
  const history = state.session.buildHistory;
  const change = history.undo.at(-1);
  if (change === undefined) {
    return err('nothingToUndo');
  }
  const applied = applyParkChange(state, invertChange(change), data, events);
  if (!applied.ok) {
    return applied;
  }
  history.undo.pop();
  history.redo.push(change);
  emitHistory(state, events);
  return ok(undefined);
}

function redoBuild(state: GameState, data: GameData, events: EventQueue): Result<void, BuildError> {
  const history = state.session.buildHistory;
  const change = history.redo.at(-1);
  if (change === undefined) {
    return err('nothingToRedo');
  }
  const applied = applyParkChange(state, change, data, events);
  if (!applied.ok) {
    return applied;
  }
  history.redo.pop();
  history.undo.push(change);
  emitHistory(state, events);
  return ok(undefined);
}

/** Applies a construction command; a refused one leaves the state and the history untouched. */
export function applyBuildCommand(
  state: GameState,
  command: BuildCommand,
  data: GameData,
  events: EventQueue,
): Result<void, BuildError> {
  switch (command.type) {
    case 'undoBuild':
      return undoBuild(state, data, events);
    case 'redoBuild':
      return redoBuild(state, data, events);
    case 'placePath':
    case 'removePath':
    case 'placeEnclosure':
    case 'moveEnclosure':
    case 'removeEnclosure':
    case 'installGroup':
    case 'placeBuilding':
    case 'moveBuilding':
    case 'removeBuilding':
      return performParkCommand(state, command, data, events);
  }
}
