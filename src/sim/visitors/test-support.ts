import type { GameData } from '../../data/load';
import { createSimContext, type SimContext } from '../context';
import { createEventQueue, drain, type GameEvent } from '../events';
import {
  BENCH,
  build,
  CAPYBARA,
  FIRST_ENCLOSURE,
  GRAVEL,
  parkState,
  rectangle,
  slice,
  testItemId,
  TOILETS,
} from '../park/test-support';
import type { CellPosition } from '../park/park-state';
import type { GameState } from '../state';
import { advance } from '../time';

/** Shared by the visitor tests only. */
export const ICE_CREAM_KIOSK = testItemId('ice-cream-kiosk');
export const WATER_FOUNTAIN = testItemId('water-fountain');

/** The column of the main path, inside the entrance (columns 124 to 131, rows 253 to 255). */
export const PATH_COLUMN = 127;
export const PATH_NORTH_ROW = 230;
export const ENTRANCE_NORTH_ROW = 253;

export function columnCells(column: number, firstRow: number, lastRow: number): CellPosition[] {
  return Array.from({ length: lastRow - firstRow + 1 }, (_unused, index) => ({
    column,
    row: firstRow + index,
  }));
}

export interface VisitorParkOptions {
  readonly bench?: boolean;
  readonly kiosk?: boolean;
  readonly toilets?: boolean;
}

/**
 * A one-cell-wide path going north from the entrance, with the capybaras' enclosure on its east
 * side and, on request, services on its west side.
 */
export function visitorPark(options: VisitorParkOptions = {}): GameState {
  const state = parkState();
  build(state, {
    type: 'placePath',
    cells: columnCells(PATH_COLUMN, PATH_NORTH_ROW, ENTRANCE_NORTH_ROW - 1),
    surface: GRAVEL,
  });
  build(state, { type: 'placeEnclosure', outline: rectangle(PATH_COLUMN + 1, 236, 6, 6) });
  build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
  if (options.bench === true) {
    const bench = { type: 'placeBuilding', itemId: BENCH, quarterTurns: 0 } as const;
    build(state, { ...bench, column: PATH_COLUMN - 2, row: 240 });
  }
  if (options.kiosk === true) {
    const kiosk = { type: 'placeBuilding', itemId: ICE_CREAM_KIOSK, quarterTurns: 0 } as const;
    build(state, { ...kiosk, column: PATH_COLUMN - 3, row: 244 });
  }
  if (options.toilets === true) {
    const toilets = { type: 'placeBuilding', itemId: TOILETS, quarterTurns: 0 } as const;
    build(state, { ...toilets, column: PATH_COLUMN - 3, row: 247 });
  }
  return state;
}

export function visitorContext(data: GameData = slice): SimContext {
  return createSimContext(data);
}

/** Plays `durationMs` in one-second frames and returns every event. */
export function play(state: GameState, context: SimContext, durationMs: number): GameEvent[] {
  const queue = createEventQueue();
  const events: GameEvent[] = [];
  const frameMs = 1000;
  for (let elapsed = 0; elapsed < durationMs; elapsed += frameMs) {
    advance(state, Math.min(frameMs, durationMs - elapsed), context, queue);
    events.push(...drain(queue));
  }
  return events;
}

export function countEvents(events: readonly GameEvent[], type: GameEvent['type']): number {
  return events.filter((event) => event.type === type).length;
}

export { slice };
