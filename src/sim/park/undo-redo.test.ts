import { describe, expect, it } from 'vitest';
import type { Command } from '../commands';
import { createRng, randomInt, type RngState } from '../rng';
import { toSavedState, type GameState, type SavedGameState } from '../state';
import type { ParkCommand } from './build-commands';
import { build, parkState, rectangle, run, slice } from './test-support';

/** Attempts of random construction commands; refused ones are skipped. */
const ATTEMPTS = 1500;
const TEST_SEED = 1404;
/** The random constructions stay in a small area, so that they often meet. */
const AREA_MIN = 80;
const AREA_MAX = 130;

const SURFACES = [...slice.pathSurfaces.keys()];
const BUILDINGS = [...slice.buildings.keys()];

function pick<T>(rng: RngState, items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[randomInt(rng, 0, items.length - 1)];
}

function coordinate(rng: RngState): number {
  return randomInt(rng, AREA_MIN, AREA_MAX);
}

function randomPathCells(rng: RngState): { column: number; row: number }[] {
  const column = coordinate(rng);
  const row = coordinate(rng);
  const length = randomInt(rng, 1, 6);
  const vertical = randomInt(rng, 0, 1) === 1;
  return Array.from({ length }, (_unused, index) =>
    vertical ? { column, row: row + index } : { column: column + index, row },
  );
}

function randomOutline(rng: RngState): { x: number; y: number }[] {
  const x = coordinate(rng);
  const y = coordinate(rng);
  if (randomInt(rng, 0, 2) === 0) {
    const side = randomInt(rng, 6, 12);
    return [
      { x, y },
      { x: x + side, y },
      { x, y: y + side },
    ];
  }
  return rectangle(x, y, randomInt(rng, 4, 10), randomInt(rng, 4, 10));
}

/** A random construction command, often invalid on purpose. */
function randomCommand(rng: RngState, state: GameState): ParkCommand | null {
  const enclosure = pick(rng, state.enclosures);
  const building = pick(rng, state.buildings);
  const tile = pick(rng, state.paths);
  const surface = pick(rng, SURFACES);
  const itemId = pick(rng, BUILDINGS);
  const species = pick(rng, state.gacha.collection);
  switch (randomInt(rng, 0, 8)) {
    case 0:
      return surface === undefined
        ? null
        : { type: 'placePath', cells: randomPathCells(rng), surface };
    case 1:
      return { type: 'removePath', cells: randomPathCells(rng) };
    case 2:
      return { type: 'placeEnclosure', outline: randomOutline(rng) };
    case 3:
      return enclosure === undefined
        ? null
        : {
            type: 'moveEnclosure',
            enclosureId: enclosure.id,
            offsetColumns: randomInt(rng, -3, 3),
            offsetRows: randomInt(rng, -3, 3),
            quarterTurns: randomInt(rng, 0, 3),
          };
    case 4:
      return enclosure === undefined
        ? null
        : { type: 'removeEnclosure', enclosureId: enclosure.id };
    case 5:
      return enclosure === undefined || species === undefined
        ? null
        : { type: 'installGroup', enclosureId: enclosure.id, speciesId: species.speciesId };
    case 6:
      // Next to a path more often than not, so that many placements are accepted.
      return itemId === undefined
        ? null
        : {
            type: 'placeBuilding',
            itemId,
            column: (tile?.column ?? coordinate(rng)) + randomInt(rng, -3, 3),
            row: (tile?.row ?? coordinate(rng)) + randomInt(rng, -3, 3),
            quarterTurns: randomInt(rng, 0, 3),
          };
    case 7:
      return building === undefined
        ? null
        : {
            type: 'moveBuilding',
            buildingId: building.id,
            column: building.column + randomInt(rng, -2, 2),
            row: building.row + randomInt(rng, -2, 2),
            quarterTurns: randomInt(rng, 0, 3),
          };
    default:
      return building === undefined ? null : { type: 'removeBuilding', buildingId: building.id };
  }
}

/** The saved part without the id counters: undo never turns them back, so no id is reused. */
function withoutCounters(state: SavedGameState): Omit<SavedGameState, 'nextIds'> {
  const { nextIds: _nextIds, ...rest } = state;
  return rest;
}

interface Played {
  readonly state: GameState;
  /** The saved state before any construction, then after each accepted command. */
  readonly snapshots: SavedGameState[];
  readonly accepted: Map<Command['type'], number>;
}

/** Plays random commands; after each accepted one, undo then redo must give the same state. */
function playRandomConstruction(): Played {
  const rng = createRng(TEST_SEED);
  const state = parkState(1_000_000);
  const snapshots = [structuredClone(toSavedState(state))];
  const accepted = new Map<Command['type'], number>();
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const command = randomCommand(rng, state);
    const recorded = state.session.buildHistory.undo.length;
    if (command === null || !run(state, command).result.ok) {
      continue;
    }
    // A command that changes nothing (same place, same surface) leaves no history entry.
    if (state.session.buildHistory.undo.length === recorded) {
      continue;
    }
    accepted.set(command.type, (accepted.get(command.type) ?? 0) + 1);
    const done = structuredClone(state);
    build(state, { type: 'undoBuild' });
    build(state, { type: 'redoBuild' });
    expect(state).toStrictEqual(done);
    snapshots.push(structuredClone(toSavedState(state)));
  }
  return { state, snapshots, accepted };
}

describe('undo and redo', () => {
  const played = playRandomConstruction();

  it('tried every construction command many times', () => {
    const commandTypes: readonly ParkCommand['type'][] = [
      'placePath',
      'removePath',
      'placeEnclosure',
      'moveEnclosure',
      'removeEnclosure',
      'installGroup',
      'placeBuilding',
      'moveBuilding',
      'removeBuilding',
    ];
    for (const type of commandTypes) {
      expect(played.accepted.get(type) ?? 0, type).toBeGreaterThanOrEqual(5);
    }
    expect(played.snapshots.length).toBeGreaterThan(100);
  });

  it('undoing everything walks back through every earlier state, then redoing walks forward', () => {
    const { state, snapshots } = played;
    const final = structuredClone(state);
    for (let index = snapshots.length - 2; index >= 0; index -= 1) {
      build(state, { type: 'undoBuild' });
      const expected = snapshots[index];
      if (expected === undefined) {
        throw new Error('Snapshots cover every step.');
      }
      expect(withoutCounters(toSavedState(state))).toStrictEqual(withoutCounters(expected));
    }
    expect(run(state, { type: 'undoBuild' }).result).toEqual({ ok: false, error: 'nothingToUndo' });
    for (let index = 1; index < snapshots.length; index += 1) {
      build(state, { type: 'redoBuild' });
      const expected = snapshots[index];
      if (expected === undefined) {
        throw new Error('Snapshots cover every step.');
      }
      expect(withoutCounters(toSavedState(state))).toStrictEqual(withoutCounters(expected));
    }
    // Back at the end: exactly the same state, id counters and history included.
    expect(state).toStrictEqual(final);
  });
});
