import { describe, expect, it } from 'vitest';
import {
  BENCH,
  build,
  expectRefused,
  FIRST_BUILDING,
  GIANT_OTTER,
  GRAVEL,
  parkState,
  rowCells,
} from './test-support';

const START_COINS = 100_000;
const GRAVEL_PER_CELL = 2;
const BENCH_PRICE = 30;

describe('undoBuild and redoBuild', () => {
  it('refuse when there is nothing to undo or redo', () => {
    const state = parkState();
    expectRefused(state, { type: 'undoBuild' }, 'nothingToUndo');
    expectRefused(state, { type: 'redoBuild' }, 'nothingToRedo');
  });

  it('undo gives back the coins, redo takes them again and keeps the ids', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 2), surface: GRAVEL });
    build(state, { type: 'placeBuilding', itemId: BENCH, column: 10, row: 11, quarterTurns: 0 });
    const undoEvents = build(state, { type: 'undoBuild' });
    expect(state.buildings).toEqual([]);
    const afterPath = START_COINS - 2 * GRAVEL_PER_CELL;
    expect(state.currencies.coins).toBe(afterPath);
    expect(undoEvents).toEqual([
      { type: 'buildingRemoved', buildingId: FIRST_BUILDING },
      { type: 'buildCoinsChanged', delta: BENCH_PRICE, total: afterPath },
      { type: 'buildHistoryChanged', undoCount: 1, redoCount: 1 },
    ]);
    build(state, { type: 'redoBuild' });
    expect(state.buildings.map((building) => building.id)).toEqual([FIRST_BUILDING]);
    expect(state.currencies.coins).toBe(afterPath - BENCH_PRICE);
    expect(state.nextIds.building).toBe(2);
  });

  it('a new construction forgets what could be redone', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 2), surface: GRAVEL });
    build(state, { type: 'undoBuild' });
    build(state, { type: 'placePath', cells: rowCells(12, 10, 2), surface: GRAVEL });
    expect(state.session.buildHistory.redo).toEqual([]);
    expectRefused(state, { type: 'redoBuild' }, 'nothingToRedo');
  });

  it('refuses an undo the player cannot pay for, and keeps it for later', () => {
    const state = parkState(BENCH_PRICE + 2 * GRAVEL_PER_CELL);
    build(state, { type: 'placePath', cells: rowCells(10, 10, 2), surface: GRAVEL });
    build(state, { type: 'placeBuilding', itemId: BENCH, column: 10, row: 11, quarterTurns: 0 });
    build(state, { type: 'removeBuilding', buildingId: FIRST_BUILDING });
    // Coins spent elsewhere, for example at the ticket counter of task 1.6.
    state.currencies.coins = 0;
    expectRefused(state, { type: 'undoBuild' }, 'notEnoughCoins');
    state.currencies.coins = BENCH_PRICE;
    build(state, { type: 'undoBuild' });
    expect(state.buildings).toHaveLength(1);
  });

  it('refuses a redo the player cannot pay for any more', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 2), surface: GRAVEL });
    build(state, { type: 'undoBuild' });
    state.currencies.coins = 1;
    expectRefused(state, { type: 'redoBuild' }, 'notEnoughCoins');
  });

  it('leaves arrivals alone: they are never undone and keep the history as it is', () => {
    const state = parkState();
    state.currencies.careMedals = 1000;
    build(state, { type: 'placePath', cells: rowCells(10, 10, 2), surface: GRAVEL });
    build(state, { type: 'undoBuild' });
    const history = structuredClone(state.session.buildHistory);
    build(state, { type: 'adoptFromCatalog', speciesId: GIANT_OTTER });
    expect(state.session.buildHistory).toStrictEqual(history);
    build(state, { type: 'redoBuild' });
    expect(state.paths).toHaveLength(2);
    build(state, { type: 'undoBuild' });
    expectRefused(state, { type: 'undoBuild' }, 'nothingToUndo');
    expect(state.gacha.collection.find((entry) => entry.speciesId === GIANT_OTTER)?.stars).toBe(2);
  });
});
