import { describe, expect, it } from 'vitest';
import {
  BENCH,
  build,
  expectRefused,
  FIRST_BUILDING,
  FIRST_ENCLOSURE,
  GIANT_OTTER,
  GRAVEL,
  parkState,
  rectangle,
  rowCells,
  slice,
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

  it('tells that a placement comes from redo, so that app does not vibrate', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 2), surface: GRAVEL });
    build(state, { type: 'placeBuilding', itemId: BENCH, column: 10, row: 11, quarterTurns: 0 });
    build(state, { type: 'undoBuild' });
    expect(build(state, { type: 'redoBuild' })).toContainEqual({
      type: 'buildingPlaced',
      buildingId: FIRST_BUILDING,
      itemId: BENCH,
      cause: 'redo',
    });
    build(state, { type: 'removeBuilding', buildingId: FIRST_BUILDING });
    expect(build(state, { type: 'undoBuild' })).toContainEqual({
      type: 'buildingPlaced',
      buildingId: FIRST_BUILDING,
      itemId: BENCH,
      cause: 'undo',
    });
  });

  it('survives an arrival between a construction and its undo', () => {
    const state = parkState();
    state.currencies.careMedals = 1000;
    build(state, { type: 'placeEnclosure', outline: rectangle(100, 100, 6, 6) });
    build(state, { type: 'placePath', cells: rowCells(106, 100, 6), surface: GRAVEL });
    const otter = state.gacha.collection.find((entry) => entry.speciesId === GIANT_OTTER);
    if (otter === undefined) {
      throw new Error('The park state has met the giant otter.');
    }
    otter.stars = 3;
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: GIANT_OTTER });
    const seen = state.enclosures[0]?.viewScore ?? 0;
    // The fourth star brings the otter's pontoon, a viewpoint element.
    build(state, { type: 'adoptFromCatalog', speciesId: GIANT_OTTER });
    const bonus = slice.buildRules.view.viewpointBonus;
    expect(state.enclosures[0]?.viewScore).toBe(seen + bonus);
    const afterArrival = structuredClone(state);
    build(state, { type: 'undoBuild' });
    expect(state.enclosures[0]?.speciesId).toBeNull();
    expect(state.enclosures[0]?.viewScore).toBe(seen);
    build(state, { type: 'redoBuild' });
    expect(state).toStrictEqual(afterArrival);
  });

  it('may refuse a free turn that leaves a group too few cells', () => {
    const state = parkState();
    // Right triangle of side 6: 21 cells; turned a half, the long edge faces south-east and the
    // cells whose centre lies on it drop out, leaving 15, under the 16 of the smallest size.
    const triangle = [
      { x: 100, y: 100 },
      { x: 106, y: 100 },
      { x: 100, y: 106 },
    ];
    build(state, { type: 'placeEnclosure', outline: triangle });
    expectRefused(
      state,
      {
        type: 'moveEnclosure',
        enclosureId: FIRST_ENCLOSURE,
        offsetColumns: 0,
        offsetRows: 0,
        quarterTurns: 2,
      },
      'enclosureTooSmall',
    );
  });
});
