import {
  buildingId,
  enclosureId,
  type BuildingId,
  type EnclosureId,
  type ItemId,
  type SpeciesId,
} from '../../shared/brand';

/** A corner of the grid: (0, 0) is the north-west corner of the land, y grows southwards. */
export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

/** A cell of the grid: column 0 is the west edge, row 0 the north edge. */
export interface CellPosition {
  readonly column: number;
  readonly row: number;
}

/** Clockwise quarter turns, seen from above with north up. */
export const QUARTER_TURNS = [0, 1, 2, 3] as const;
export type QuarterTurns = (typeof QUARTER_TURNS)[number];

export function isQuarterTurns(value: number): value is QuarterTurns {
  return QUARTER_TURNS.some((turns) => turns === value);
}

export interface PathTile {
  readonly column: number;
  readonly row: number;
  readonly surface: ItemId;
}

/**
 * A free-form enclosure, stored as the outline the player traced. Its cells are those whose
 * centre lies inside the outline (see `outlineCells`), so the save stays small.
 * Never mutated: a change replaces the whole object, which keeps undo snapshots safe.
 */
export interface EnclosureState {
  readonly id: EnclosureId;
  readonly outline: readonly GridPoint[];
  /** The species whose whole group lives here; one species per enclosure in the slice. */
  readonly speciesId: SpeciesId | null;
  /** 0 to `buildRules.view.maxScore`, recomputed after every change that can move it. */
  readonly viewScore: number;
}

/** A building of the data placed in the park. Never mutated, like `EnclosureState`. */
export interface BuildingState {
  readonly id: BuildingId;
  readonly itemId: ItemId;
  /** North-west cell of the footprint, after rotation. */
  readonly column: number;
  readonly row: number;
  readonly quarterTurns: QuarterTurns;
}

/** Numbers of the next ids: ids are never reused, so an undone object keeps its own. */
export interface NextIds {
  enclosure: number;
  building: number;
}

export function createNextIds(): NextIds {
  return { enclosure: 1, building: 1 };
}

export function makeEnclosureId(number: number): EnclosureId {
  const id = enclosureId(`enclosure-${String(number)}`);
  if (!id.ok) {
    throw new Error(`makeEnclosureId: ${id.error} for ${String(number)}.`);
  }
  return id.value;
}

export function makeBuildingId(number: number): BuildingId {
  const id = buildingId(`building-${String(number)}`);
  if (!id.ok) {
    throw new Error(`makeBuildingId: ${id.error} for ${String(number)}.`);
  }
  return id.value;
}

/** Creation order of generated ids (`enclosure-9` before `enclosure-10`). */
export function compareIds(a: string, b: string): number {
  if (a.length !== b.length) {
    return a.length - b.length;
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Row by row, then west to east: the one order of `state.paths`. */
export function comparePathTiles(a: CellPosition, b: CellPosition): number {
  return a.row - b.row || a.column - b.column;
}

export function cloneEnclosure(enclosure: EnclosureState): EnclosureState {
  return { ...enclosure, outline: enclosure.outline.map((point) => ({ ...point })) };
}

export function cloneBuilding(building: BuildingState): BuildingState {
  return { ...building };
}
