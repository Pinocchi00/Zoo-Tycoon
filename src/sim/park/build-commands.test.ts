import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import {
  BENCH,
  build,
  CAPYBARA,
  expectRefused,
  FIRST_ENCLOSURE,
  GRAVEL,
  parkState,
  PAVERS,
  rectangle,
  rowCells,
  run,
  SECOND_ENCLOSURE,
  testEnclosureId,
  testItemId,
} from './test-support';

const START_COINS = 100_000;
/** Prices of the slice data. */
const GRAVEL_PER_CELL = 2;
const PAVERS_PER_CELL = 3;

function ofType<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

describe('placePath', () => {
  it('paves the cells, charges them and keeps the paths sorted', () => {
    const state = parkState();
    const events = build(state, {
      type: 'placePath',
      cells: [...rowCells(11, 10, 2), ...rowCells(10, 12, 1), { column: 10, row: 11 }],
      surface: GRAVEL,
    });
    expect(state.paths).toEqual([
      { column: 12, row: 10, surface: GRAVEL },
      { column: 10, row: 11, surface: GRAVEL },
      { column: 11, row: 11, surface: GRAVEL },
    ]);
    expect(state.currencies.coins).toBe(START_COINS - 3 * GRAVEL_PER_CELL);
    expect(events).toEqual([
      {
        type: 'pathTilesChanged',
        cause: 'command',
        tiles: [
          { column: 12, row: 10, surface: GRAVEL },
          { column: 10, row: 11, surface: GRAVEL },
          { column: 11, row: 11, surface: GRAVEL },
        ],
      },
      { type: 'buildCoinsChanged', delta: -6, total: START_COINS - 6 },
      { type: 'buildHistoryChanged', undoCount: 1, redoCount: 0 },
    ]);
  });

  it('resurfaces existing path, refunding the old surface', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 4), surface: GRAVEL });
    const events = build(state, { type: 'placePath', cells: rowCells(10, 12, 3), surface: PAVERS });
    // Two cells change from gravel to pavers, one is new.
    const expectedDelta = 2 * GRAVEL_PER_CELL - 3 * PAVERS_PER_CELL;
    expect(ofType(events, 'buildCoinsChanged')).toEqual([
      {
        type: 'buildCoinsChanged',
        delta: expectedDelta,
        total: START_COINS - 4 * GRAVEL_PER_CELL + expectedDelta,
      },
    ]);
    expect(state.paths.map((tile) => tile.surface)).toEqual([
      GRAVEL,
      GRAVEL,
      PAVERS,
      PAVERS,
      PAVERS,
    ]);
  });

  it('does nothing, and records nothing, when the path is already there', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 2), surface: GRAVEL });
    const before = structuredClone(state);
    const { result, events } = run(state, {
      type: 'placePath',
      cells: rowCells(10, 10, 2),
      surface: GRAVEL,
    });
    expect(result.ok).toBe(true);
    expect(events).toEqual([]);
    expect(state).toStrictEqual(before);
  });

  it('paves next to the entrance but never on it', () => {
    const state = parkState();
    // The entrance covers columns 124 to 131 of the last three rows.
    build(state, { type: 'placePath', cells: [{ column: 124, row: 252 }], surface: GRAVEL });
    expectRefused(
      state,
      { type: 'placePath', cells: [{ column: 131, row: 255 }], surface: GRAVEL },
      'cellOccupied',
    );
  });

  it('refuses an unknown surface, no cell, a bad cell or a cell outside the land', () => {
    const state = parkState();
    const cells = rowCells(10, 10, 1);
    expectRefused(
      state,
      { type: 'placePath', cells, surface: testItemId('bench') },
      'unknownPathSurface',
    );
    expectRefused(state, { type: 'placePath', cells: [], surface: GRAVEL }, 'noCells');
    expectRefused(
      state,
      { type: 'placePath', cells: [{ column: 1.5, row: 2 }], surface: GRAVEL },
      'invalidPosition',
    );
    expectRefused(
      state,
      { type: 'placePath', cells: [{ column: 256, row: 2 }], surface: GRAVEL },
      'outOfBounds',
    );
    expectRefused(
      state,
      { type: 'placePath', cells: [{ column: 2, row: -1 }], surface: GRAVEL },
      'outOfBounds',
    );
  });

  it('refuses cells taken by an enclosure or a building', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 4, 4) });
    expectRefused(
      state,
      { type: 'placePath', cells: rowCells(12, 8, 4), surface: GRAVEL },
      'cellOccupied',
    );
    build(state, { type: 'placePath', cells: rowCells(20, 10, 2), surface: GRAVEL });
    build(state, { type: 'placeBuilding', itemId: BENCH, column: 10, row: 21, quarterTurns: 0 });
    expectRefused(
      state,
      { type: 'placePath', cells: [{ column: 11, row: 21 }], surface: GRAVEL },
      'cellOccupied',
    );
  });

  it('refuses a path the player cannot pay for', () => {
    const state = parkState(5);
    expectRefused(
      state,
      { type: 'placePath', cells: rowCells(10, 10, 3), surface: GRAVEL },
      'notEnoughCoins',
    );
  });
});

describe('removePath', () => {
  it('takes up the paved cells only and refunds them in full', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 3), surface: GRAVEL });
    const events = build(state, { type: 'removePath', cells: rowCells(10, 11, 4) });
    expect(state.paths).toEqual([{ column: 10, row: 10, surface: GRAVEL }]);
    expect(state.currencies.coins).toBe(START_COINS - GRAVEL_PER_CELL);
    expect(ofType(events, 'pathTilesChanged')).toEqual([
      {
        type: 'pathTilesChanged',
        cause: 'command',
        tiles: [
          { column: 11, row: 10, surface: null },
          { column: 12, row: 10, surface: null },
        ],
      },
    ]);
  });

  it('refuses when no listed cell is paved, or a cell is invalid', () => {
    const state = parkState();
    expectRefused(state, { type: 'removePath', cells: rowCells(10, 10, 3) }, 'noPathThere');
    expectRefused(state, { type: 'removePath', cells: [] }, 'noCells');
    expectRefused(state, { type: 'removePath', cells: [{ column: 300, row: 0 }] }, 'outOfBounds');
  });

  it('refuses a refund that would overflow the coin count', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 1), surface: GRAVEL });
    state.currencies.coins = Number.MAX_SAFE_INTEGER;
    expectRefused(state, { type: 'removePath', cells: rowCells(10, 10, 1) }, 'currencyOverflow');
  });

  it('may leave a building without path: reaching it is the visitors’ business', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(10, 10, 2), surface: GRAVEL });
    build(state, { type: 'placeBuilding', itemId: BENCH, column: 10, row: 11, quarterTurns: 0 });
    build(state, { type: 'removePath', cells: rowCells(10, 10, 2) });
    expect(state.buildings).toHaveLength(1);
    expect(state.paths).toEqual([]);
  });
});

describe('placeEnclosure', () => {
  it('builds an empty enclosure for free and numbers it', () => {
    const state = parkState();
    const events = build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 4, 4) });
    build(state, { type: 'placeEnclosure', outline: rectangle(20, 10, 6, 6) });
    expect(state.enclosures).toEqual([
      { id: FIRST_ENCLOSURE, outline: rectangle(10, 10, 4, 4), speciesId: null, viewScore: 0 },
      { id: SECOND_ENCLOSURE, outline: rectangle(20, 10, 6, 6), speciesId: null, viewScore: 0 },
    ]);
    expect(state.nextIds.enclosure).toBe(3);
    expect(state.currencies.coins).toBe(START_COINS);
    expect(events).toEqual([
      { type: 'enclosurePlaced', enclosureId: FIRST_ENCLOSURE, speciesId: null, cause: 'command' },
      { type: 'buildHistoryChanged', undoCount: 1, redoCount: 0 },
    ]);
  });

  it('keeps enclosures in id order past ten', () => {
    const state = parkState();
    for (let index = 0; index < 11; index += 1) {
      build(state, { type: 'placeEnclosure', outline: rectangle(index * 5, 0, 4, 4) });
    }
    build(state, { type: 'removeEnclosure', enclosureId: testEnclosureId('enclosure-2') });
    build(state, { type: 'undoBuild' });
    expect(state.enclosures.map((enclosure) => enclosure.id)).toEqual(
      Array.from({ length: 11 }, (_unused, index) => `enclosure-${String(index + 1)}`),
    );
  });

  it('refuses a bad outline, a shape outside the land or in pieces', () => {
    const state = parkState();
    const bowTie = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    expectRefused(state, { type: 'placeEnclosure', outline: bowTie }, 'outlineInvalid');
    expectRefused(
      state,
      { type: 'placeEnclosure', outline: rectangle(254, 10, 4, 4) },
      'outOfBounds',
    );
    const necked = [
      [50, 50],
      [54, 50],
      [54, 54],
      [56, 55],
      [60, 55],
      [60, 59],
      [56, 59],
      [56, 56],
      [54, 55],
      [50, 55],
    ].map(([x, y]) => ({ x: x ?? 0, y: y ?? 0 }));
    expectRefused(state, { type: 'placeEnclosure', outline: necked }, 'enclosureSplit');
  });

  it('refuses an enclosure smaller than the smallest size, or above the maximum', () => {
    const state = parkState();
    expectRefused(
      state,
      { type: 'placeEnclosure', outline: rectangle(10, 10, 5, 3) },
      'enclosureTooSmall',
    );
    expectRefused(
      state,
      { type: 'placeEnclosure', outline: rectangle(10, 10, 33, 32) },
      'enclosureTooLarge',
    );
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 32, 32) });
  });

  it('refuses to overlap an enclosure, a path or the entrance', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 4, 4) });
    expectRefused(
      state,
      { type: 'placeEnclosure', outline: rectangle(13, 13, 4, 4) },
      'cellOccupied',
    );
    build(state, { type: 'placeEnclosure', outline: rectangle(14, 10, 4, 4) });
    build(state, { type: 'placePath', cells: rowCells(30, 10, 1), surface: GRAVEL });
    expectRefused(
      state,
      { type: 'placeEnclosure', outline: rectangle(8, 28, 4, 4) },
      'cellOccupied',
    );
    expectRefused(
      state,
      { type: 'placeEnclosure', outline: rectangle(122, 250, 4, 4) },
      'cellOccupied',
    );
  });
});

describe('moveEnclosure', () => {
  it('moves and turns the enclosure for free, with its group', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 8, 6) });
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
    const events = build(state, {
      type: 'moveEnclosure',
      enclosureId: FIRST_ENCLOSURE,
      offsetColumns: 5,
      offsetRows: -2,
      quarterTurns: 1,
    });
    expect(state.enclosures).toEqual([
      {
        id: FIRST_ENCLOSURE,
        outline: [
          { x: 21, y: 8 },
          { x: 21, y: 16 },
          { x: 15, y: 16 },
          { x: 15, y: 8 },
        ],
        speciesId: CAPYBARA,
        viewScore: 0,
      },
    ]);
    expect(state.currencies.coins).toBe(START_COINS);
    expect(ofType(events, 'enclosureMoved')).toEqual([
      { type: 'enclosureMoved', enclosureId: FIRST_ENCLOSURE, cause: 'command' },
    ]);
  });

  it('may overlap its own old place', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 4, 4) });
    const move = {
      type: 'moveEnclosure',
      enclosureId: FIRST_ENCLOSURE,
      offsetColumns: 1,
      offsetRows: 0,
      quarterTurns: 0,
    } as const;
    build(state, move);
    expect(state.enclosures[0]?.outline).toEqual(rectangle(11, 10, 4, 4));
  });

  it('does nothing when asked to stay in place', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 4, 4) });
    const before = structuredClone(state);
    const { result, events } = run(state, {
      type: 'moveEnclosure',
      enclosureId: FIRST_ENCLOSURE,
      offsetColumns: 0,
      offsetRows: 0,
      quarterTurns: 0,
    });
    expect(result.ok).toBe(true);
    expect(events).toEqual([]);
    expect(state).toStrictEqual(before);
  });

  it('refuses an unknown enclosure, a bad move, the land edge and an overlap', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(10, 10, 4, 4) });
    build(state, { type: 'placeEnclosure', outline: rectangle(20, 10, 4, 4) });
    const move = {
      type: 'moveEnclosure',
      enclosureId: FIRST_ENCLOSURE,
      offsetColumns: 0,
      offsetRows: 0,
      quarterTurns: 0,
    } as const;
    expectRefused(
      state,
      { ...move, enclosureId: testEnclosureId('enclosure-9'), offsetColumns: 1 },
      'unknownEnclosure',
    );
    expectRefused(state, { ...move, offsetColumns: 0.5 }, 'invalidPosition');
    expectRefused(state, { ...move, quarterTurns: 4 }, 'invalidPosition');
    expectRefused(state, { ...move, quarterTurns: 1.5 }, 'invalidPosition');
    expectRefused(state, { ...move, offsetColumns: -11 }, 'outOfBounds');
    expectRefused(state, { ...move, offsetColumns: 8 }, 'cellOccupied');
  });
});
