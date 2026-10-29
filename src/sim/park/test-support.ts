import { expect } from 'vitest';
import type { GameData } from '../../data/load';
import {
  buildingId,
  enclosureId,
  itemId,
  type BuildingId,
  type EnclosureId,
  type ItemId,
} from '../../shared/brand';
import type { Result } from '../../shared/result';
import { applyCommand, type Command, type CommandError } from '../commands';
import { createEventQueue, drain, type GameEvent } from '../events';
import { sliceGameData, testSpeciesId } from '../gacha/test-support';
import { createGameState, type GameState } from '../state';
import type { CellPosition, GridPoint } from './park-state';

/** Shared by the park tests only. */
export const slice: GameData = sliceGameData();

function unwrapId<T>(result: Result<T, string>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

export function testItemId(raw: string): ItemId {
  return unwrapId(itemId(raw));
}

export function testEnclosureId(raw: string): EnclosureId {
  return unwrapId(enclosureId(raw));
}

export function testBuildingId(raw: string): BuildingId {
  return unwrapId(buildingId(raw));
}

export const GRAVEL = testItemId('gravel');
export const PAVERS = testItemId('pavers');
export const BENCH = testItemId('bench');
export const TOILETS = testItemId('toilets');
export const CAPYBARA = testSpeciesId('capybara');
export const JAGUAR = testSpeciesId('jaguar');
export const GIANT_OTTER = testSpeciesId('giant-otter');
export const FIRST_ENCLOSURE = testEnclosureId('enclosure-1');
export const SECOND_ENCLOSURE = testEnclosureId('enclosure-2');
export const FIRST_BUILDING = testBuildingId('building-1');

/** A park with plenty of coins and a few species already met at one star. */
export function parkState(coins = 100_000): GameState {
  const state = createGameState(11);
  state.currencies.coins = coins;
  for (const speciesId of [CAPYBARA, JAGUAR, GIANT_OTTER]) {
    state.gacha.collection.push({ speciesId, stars: 1, groupSize: 2 });
  }
  return state;
}

/** Corners of a `width` × `depth` rectangle whose north-west corner is (x, y). */
export function rectangle(x: number, y: number, width: number, depth: number): GridPoint[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

/** Cells of a horizontal run of path, west to east. */
export function rowCells(row: number, firstColumn: number, count: number): CellPosition[] {
  return Array.from({ length: count }, (_unused, index) => ({ column: firstColumn + index, row }));
}

export function run(
  state: GameState,
  command: Command,
  data: GameData = slice,
): { result: Result<void, CommandError>; events: readonly GameEvent[] } {
  const events = createEventQueue();
  const result = applyCommand(state, command, data, events);
  return { result, events: drain(events) };
}

/** Applies a command that must succeed. */
export function build(state: GameState, command: Command): readonly GameEvent[] {
  const { result, events } = run(state, command);
  if (!result.ok) {
    throw new Error(`${command.type} refused: ${result.error}`);
  }
  return events;
}

/** The command is refused with `error`, and neither the state nor the events changed. */
export function expectRefused(state: GameState, command: Command, error: CommandError): void {
  const before = structuredClone(state);
  const { result, events } = run(state, command);
  expect(result).toEqual({ ok: false, error });
  expect(events).toEqual([]);
  expect(state).toStrictEqual(before);
}
