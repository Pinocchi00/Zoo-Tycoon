import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import type { GameState } from '../state';
import { hasUnlockedViewpoint } from './view-score';
import {
  BENCH,
  build,
  CAPYBARA,
  FIRST_ENCLOSURE,
  GIANT_OTTER,
  GRAVEL,
  parkState,
  rectangle,
  rowCells,
  slice,
} from './test-support';

function viewScore(state: GameState): number | undefined {
  return state.enclosures[0]?.viewScore;
}

/** A 4 × 4 enclosure on cells (100..103, 100..103). */
function withSmallEnclosure(): GameState {
  const state = parkState();
  build(state, { type: 'placeEnclosure', outline: rectangle(100, 100, 4, 4) });
  return state;
}

/** Paths on the ring of cells around a `side` × `side` enclosure at (100, 100). */
function ringCells(side: number): { column: number; row: number }[] {
  const rows = Array.from({ length: side }, (_unused, index) => 100 + index);
  return [
    ...rowCells(99, 99, side + 2),
    ...rowCells(100 + side, 99, side + 2),
    ...rows.flatMap((row) => [
      { column: 99, row },
      { column: 100 + side, row },
    ]),
  ];
}

/** A 6 × 6 enclosure, big enough for the capybara, surrounded by paths. */
function withSeenMediumEnclosure(): GameState {
  const state = parkState();
  build(state, { type: 'placeEnclosure', outline: rectangle(100, 100, 6, 6) });
  build(state, { type: 'placePath', cells: ringCells(6), surface: GRAVEL });
  return state;
}

describe('view score', () => {
  it('is zero when no path sees the enclosure', () => {
    const state = withSmallEnclosure();
    build(state, { type: 'placePath', cells: rowCells(110, 100, 4), surface: GRAVEL });
    expect(viewScore(state)).toBe(0);
  });

  it('follows the formula for a path along one side', () => {
    const state = withSmallEnclosure();
    const events = build(state, {
      type: 'placePath',
      cells: rowCells(104, 100, 4),
      surface: GRAVEL,
    });
    // 12 border cells. South row: d = 1 (4 × 10 000). West and east columns: d = 2, 3, 4
    // (2 × (7 500 + 5 000 + 2 500)). North middle cells: d = 4 (2 × 2 500).
    // (40 000 + 30 000 + 5 000) / 12 = 6 250 bp → ⌊6 250 × 4 / 10 000⌋ = 2.
    expect(viewScore(state)).toBe(2);
    expect(events).toContainEqual({
      type: 'viewScoreChanged',
      enclosureId: FIRST_ENCLOSURE,
      viewScore: 2,
    });
  });

  it('reaches the most a path can give when paths surround the enclosure', () => {
    const state = withSmallEnclosure();
    build(state, { type: 'placePath', cells: ringCells(4), surface: GRAVEL });
    expect(viewScore(state)).toBe(slice.buildRules.view.maxScore - 1);
  });

  it('adds the bonus once the group unlocked a viewpoint element', () => {
    const state = withSeenMediumEnclosure();
    expect(viewScore(state)).toBe(slice.buildRules.view.maxScore - 1);
    const capybara = state.gacha.collection.find((entry) => entry.speciesId === CAPYBARA);
    if (capybara === undefined) {
      throw new Error('The park state has met the capybara.');
    }
    // The capybara's panoramic window comes with its fourth star.
    capybara.stars = 4;
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
    expect(viewScore(state)).toBe(slice.buildRules.view.maxScore);
  });

  it('gives no bonus to an enclosure nobody sees', () => {
    const state = parkState();
    build(state, { type: 'placeEnclosure', outline: rectangle(100, 100, 6, 6) });
    const capybara = state.gacha.collection.find((entry) => entry.speciesId === CAPYBARA);
    if (capybara === undefined) {
      throw new Error('The park state has met the capybara.');
    }
    capybara.stars = 5;
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
    expect(viewScore(state)).toBe(0);
  });

  it('is lowered by a building standing between the path and the enclosure', () => {
    const state = withSmallEnclosure();
    build(state, { type: 'placePath', cells: rowCells(105, 98, 8), surface: GRAVEL });
    // South row at d = 2 (4 × 7 500), sides at d = 3 and 4 (2 × 7 500): 45 000 / 12 → 1.
    const open = viewScore(state);
    expect(open).toBe(1);
    // A row of benches on row 104, between the path (105) and the enclosure (up to 103).
    const benches = [98, 100, 102, 104];
    for (const column of benches) {
      build(state, { type: 'placeBuilding', itemId: BENCH, column, row: 104, quarterTurns: 0 });
    }
    expect(viewScore(state)).toBe(0);
    for (const _bench of benches) {
      build(state, { type: 'undoBuild' });
    }
    expect(viewScore(state)).toBe(open);
  });

  it('is not blocked by the enclosure itself, but by another enclosure', () => {
    const state = parkState();
    build(state, { type: 'placePath', cells: rowCells(109, 100, 8), surface: GRAVEL });
    build(state, { type: 'placeEnclosure', outline: rectangle(100, 100, 8, 8) });
    // Lines to the far border cells cross the enclosure's own cells and still count:
    // south row at d = 2 (8 × 7 500), sides at d = 3 and 4 (2 × 7 500): 75 000 / 28 → 1.
    expect(viewScore(state)).toBe(1);
    // A second enclosure fills the row between the path and the first one.
    build(state, { type: 'placeEnclosure', outline: rectangle(96, 108, 16, 1) });
    expect(viewScore(state)).toBe(0);
  });

  it('is updated when an arrival gives the star that unlocks a viewpoint', () => {
    const state = parkState();
    state.currencies.careMedals = 1000;
    build(state, { type: 'placeEnclosure', outline: rectangle(100, 100, 6, 6) });
    build(state, {
      type: 'placePath',
      cells: [...rowCells(99, 99, 8), ...rowCells(106, 99, 8)],
      surface: GRAVEL,
    });
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: GIANT_OTTER });
    const otter = state.gacha.collection.find((entry) => entry.speciesId === GIANT_OTTER);
    if (otter === undefined) {
      throw new Error('The park state has met the giant otter.');
    }
    // The giant otter's pontoon comes with its fourth star.
    otter.stars = 3;
    const before = viewScore(state) ?? 0;
    const events: readonly GameEvent[] = build(state, {
      type: 'adoptFromCatalog',
      speciesId: GIANT_OTTER,
    });
    expect(viewScore(state)).toBe(before + slice.buildRules.view.viewpointBonus);
    expect(events).toContainEqual({
      type: 'viewScoreChanged',
      enclosureId: FIRST_ENCLOSURE,
      viewScore: before + 1,
    });
  });
});

describe('hasUnlockedViewpoint', () => {
  it('looks at the elements of the stars reached so far', () => {
    expect(hasUnlockedViewpoint(CAPYBARA, 3, slice)).toBe(false);
    expect(hasUnlockedViewpoint(CAPYBARA, 4, slice)).toBe(true);
    expect(hasUnlockedViewpoint(CAPYBARA, 5, slice)).toBe(true);
  });

  it('knows nothing of a species missing from the data', () => {
    const withoutCapybara = { ...slice, species: new Map() };
    expect(hasUnlockedViewpoint(CAPYBARA, 5, withoutCapybara)).toBe(false);
  });
});
