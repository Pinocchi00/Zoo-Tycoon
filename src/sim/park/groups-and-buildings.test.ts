import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import { testSpeciesId } from '../gacha/test-support';
import type { GameState } from '../state';
import {
  BENCH,
  build,
  CAPYBARA,
  expectRefused,
  FIRST_BUILDING,
  FIRST_ENCLOSURE,
  GRAVEL,
  JAGUAR,
  parkState,
  rectangle,
  rowCells,
  run,
  SECOND_ENCLOSURE,
  testBuildingId,
  testItemId,
  TOILETS,
} from './test-support';

const START_COINS = 100_000;
/** Prices of the slice data. */
const GRAVEL_PER_CELL = 2;
const BENCH_PRICE = 30;
const TOILETS_PRICE = 250;

function ofType<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

describe('removeEnclosure', () => {
  it('removes the enclosure for free and sends its group back to the refuge', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 6, 6) });
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
    const events = build(state, { type: 'removeEnclosure', enclosureId: FIRST_ENCLOSURE });
    expect(state.enclosures).toEqual([]);
    expect(state.currencies.coins).toBe(START_COINS);
    expect(state.gacha.collection.map((progress) => progress.speciesId)).toContain(CAPYBARA);
    expect(ofType(events, 'enclosureRemoved')).toEqual([
      { type: 'enclosureRemoved', enclosureId: FIRST_ENCLOSURE, returnedSpeciesId: CAPYBARA },
    ]);
  });

  it('refuses an unknown enclosure', () => {
    expectRefused(
      parkState(),
      { type: 'removeEnclosure', enclosureId: FIRST_ENCLOSURE },
      'unknownEnclosure',
    );
  });
});

describe('installGroup', () => {
  it('installs a met species in an empty enclosure', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 6, 6) });
    const events = build(state, {
      type: 'installGroup',
      enclosureId: FIRST_ENCLOSURE,
      speciesId: CAPYBARA,
    });
    expect(state.enclosures[0]?.speciesId).toBe(CAPYBARA);
    expect(ofType(events, 'enclosureGroupChanged')).toEqual([
      { type: 'enclosureGroupChanged', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA },
    ]);
  });

  it('moves the group from its former enclosure', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 6, 6) });
    build(state, { type: 'placeEnclosure', outline: rectangle(20, 10, 6, 6) });
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
    const events = build(state, {
      type: 'installGroup',
      enclosureId: SECOND_ENCLOSURE,
      speciesId: CAPYBARA,
    });
    expect(state.enclosures.map((enclosure) => enclosure.speciesId)).toEqual([null, CAPYBARA]);
    expect(ofType(events, 'enclosureGroupChanged')).toEqual([
      { type: 'enclosureGroupChanged', enclosureId: SECOND_ENCLOSURE, speciesId: CAPYBARA },
      { type: 'enclosureGroupChanged', enclosureId: FIRST_ENCLOSURE, speciesId: null },
    ]);
    expect(ofType(events, 'enclosureRemoved')).toEqual([]);
  });

  it('refuses a species not met, an unknown or occupied enclosure, the same enclosure', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 8, 8) });
    const install = { type: 'installGroup', enclosureId: FIRST_ENCLOSURE } as const;
    expectRefused(
      state,
      { ...install, speciesId: testSpeciesId('lowland-tapir') },
      'speciesNotMet',
    );
    expectRefused(
      state,
      { ...install, enclosureId: SECOND_ENCLOSURE, speciesId: CAPYBARA },
      'unknownEnclosure',
    );
    build(state, { ...install, speciesId: CAPYBARA });
    expectRefused(state, { ...install, speciesId: CAPYBARA }, 'groupAlreadyThere');
    expectRefused(state, { ...install, speciesId: JAGUAR }, 'enclosureOccupied');
  });

  it('refuses an enclosure smaller than the species needs', () => {
    const state = parkState();
    // The jaguar needs an L enclosure (64 cells): 6 × 6 is too small.
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 6, 6) });
    expectRefused(
      state,
      { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: JAGUAR },
      'enclosureTooSmall',
    );
  });

  it('keeps the group when its enclosure moves and turns', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 8, 8) });
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: JAGUAR });
    build(state, {
      type: 'moveEnclosure',
      enclosureId: FIRST_ENCLOSURE,
      offsetColumns: 3,
      offsetRows: 3,
      quarterTurns: 1,
    });
    expect(state.enclosures[0]?.speciesId).toBe(JAGUAR);
  });
});

describe('placeBuilding', () => {
  it('places a building along a path and charges it', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 4), surface: GRAVEL });
    const events = build(state, {
      type: 'placeBuilding',
      itemId: TOILETS,
      column: 10,
      row: 11,
      quarterTurns: 0,
    });
    expect(state.buildings).toEqual([
      { id: FIRST_BUILDING, itemId: TOILETS, column: 10, row: 11, quarterTurns: 0 },
    ]);
    expect(state.nextIds.building).toBe(2);
    expect(state.currencies.coins).toBe(START_COINS - 4 * GRAVEL_PER_CELL - TOILETS_PRICE);
    expect(ofType(events, 'buildingPlaced')).toEqual([
      { type: 'buildingPlaced', buildingId: FIRST_BUILDING, itemId: TOILETS, cause: 'command' },
    ]);
  });

  it('counts the entrance as a path', () => {
    const state = parkState();
    // The entrance starts at column 124 of row 253: the bench ends right beside it.
    build(state, { type: 'placeBuilding', itemId: BENCH, column: 122, row: 253, quarterTurns: 0 });
    expect(state.buildings).toHaveLength(1);
  });

  it('turns the footprint', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 1), surface: GRAVEL });
    // A bench turned a quarter is 1 wide and 2 deep: rows 11 and 12.
    build(state, { type: 'placeBuilding', itemId: BENCH, column: 10, row: 11, quarterTurns: 1 });
    expectRefused(
      state,
      { type: 'placePath', cells: [{ column: 10, row: 12 }], surface: GRAVEL },
      'cellOccupied',
    );
    build(state, { type: 'placePath', cells: [{ column: 11, row: 11 }], surface: GRAVEL });
  });

  it('refuses an unknown building, a bad position, the land edge, an overlap', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 4), surface: GRAVEL });
    const place = {
      type: 'placeBuilding',
      itemId: BENCH,
      column: 10,
      row: 11,
      quarterTurns: 0,
    } as const;
    expectRefused(state, { ...place, itemId: testItemId('gravel') }, 'unknownBuilding');
    expectRefused(state, { ...place, column: 0.5 }, 'invalidPosition');
    expectRefused(state, { ...place, quarterTurns: 7 }, 'invalidPosition');
    expectRefused(state, { ...place, column: 255 }, 'outOfBounds');
    expectRefused(state, { ...place, row: -1 }, 'outOfBounds');
    expectRefused(state, { ...place, row: 10 }, 'cellOccupied');
    build(state, place);
    expectRefused(state, { ...place, column: 11 }, 'cellOccupied');
  });

  it('refuses a building that touches no path, even diagonally', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 1), surface: GRAVEL });
    expectRefused(
      state,
      { type: 'placeBuilding', itemId: BENCH, column: 11, row: 11, quarterTurns: 0 },
      'buildingNotOnPath',
    );
    expectRefused(
      state,
      { type: 'placeBuilding', itemId: BENCH, column: 40, row: 40, quarterTurns: 0 },
      'buildingNotOnPath',
    );
  });

  it('refuses a building the player cannot pay for', () => {
    const state = parkState(BENCH_PRICE - 1 + GRAVEL_PER_CELL);
    build(state, { type: 'placePath', cells: rowCells(10, 10, 1), surface: GRAVEL });
    expectRefused(
      state,
      { type: 'placeBuilding', itemId: BENCH, column: 10, row: 11, quarterTurns: 0 },
      'notEnoughCoins',
    );
  });
});

describe('moveBuilding and removeBuilding', () => {
  function withBench(): GameState {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 6), surface: GRAVEL });
    build(state, { type: 'placeBuilding', itemId: BENCH, column: 10, row: 11, quarterTurns: 0 });
    return state;
  }

  it('moves a building for free', () => {
    const state = withBench();
    const coins = state.currencies.coins;
    const events = build(state, {
      type: 'moveBuilding',
      buildingId: FIRST_BUILDING,
      column: 11,
      row: 11,
      quarterTurns: 1,
    });
    expect(state.buildings[0]).toEqual({
      id: FIRST_BUILDING,
      itemId: BENCH,
      column: 11,
      row: 11,
      quarterTurns: 1,
    });
    expect(state.currencies.coins).toBe(coins);
    expect(ofType(events, 'buildingMoved')).toEqual([
      { type: 'buildingMoved', buildingId: FIRST_BUILDING, cause: 'command' },
    ]);
  });

  it('does nothing when asked to stay in place', () => {
    const state = withBench();
    const before = structuredClone(state);
    const { result } = run(state, {
      type: 'moveBuilding',
      buildingId: FIRST_BUILDING,
      column: 10,
      row: 11,
      quarterTurns: 0,
    });
    expect(result.ok).toBe(true);
    expect(state).toStrictEqual(before);
  });

  it('refuses an unknown building, a bad turn or a place away from paths', () => {
    const state = withBench();
    const move = {
      type: 'moveBuilding',
      buildingId: FIRST_BUILDING,
      column: 10,
      row: 13,
      quarterTurns: 0,
    } as const;
    expectRefused(
      state,
      { ...move, buildingId: testBuildingId('building-7') },
      'unknownPlacedBuilding',
    );
    expectRefused(state, { ...move, quarterTurns: -1 }, 'invalidPosition');
    expectRefused(state, move, 'buildingNotOnPath');
  });

  it('removes a building with a full refund', () => {
    const state = withBench();
    const coins = state.currencies.coins;
    const events = build(state, { type: 'removeBuilding', buildingId: FIRST_BUILDING });
    expect(state.buildings).toEqual([]);
    expect(state.currencies.coins).toBe(coins + BENCH_PRICE);
    expect(ofType(events, 'buildingRemoved')).toEqual([
      { type: 'buildingRemoved', buildingId: FIRST_BUILDING },
    ]);
    expectRefused(
      state,
      { type: 'removeBuilding', buildingId: FIRST_BUILDING },
      'unknownPlacedBuilding',
    );
  });
});
