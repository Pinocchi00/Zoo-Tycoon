import { describe, expect, it } from 'vitest';
import type { GameData } from '../../src/data/load';
import { advance, createEventQueue, drain, STEP_MS, type GameState } from '../../src/sim';
import type { CellPosition } from '../../src/sim/park/park-state';
import {
  BENCH,
  build,
  CAPYBARA,
  FIRST_ENCLOSURE,
  GIANT_OTTER,
  GRAVEL,
  JAGUAR,
  parkState,
  rectangle,
  SECOND_ENCLOSURE,
  slice,
  testEnclosureId,
  TOILETS,
} from '../../src/sim/park/test-support';
import {
  columnCells,
  ICE_CREAM_KIOSK,
  play,
  visitorContext,
} from '../../src/sim/visitors/test-support';

/** Brief of task 1.5: 250 visitors in under 2 ms per step on a development PC. */
const VISITORS = 250;
const MAX_MS_PER_STEP = 2;
const MEASURED_STEPS = 2000;
const WARM_UP_MS = 3 * 60_000;

/** A busy slice: plenty of arrivals and room for the whole crowd. */
const CROWD_DATA: GameData = {
  ...slice,
  visitorRules: {
    ...slice.visitorRules,
    arrivals: {
      maxPresent: VISITORS,
      maxPerMinute: VISITORS,
      walkableCellsPerVisitor: 1,
      milliVisitorsPerSqrtAttractiveness: 200_000,
    },
  },
};

function rowCells(row: number, firstColumn: number, lastColumn: number): CellPosition[] {
  return Array.from({ length: lastColumn - firstColumn + 1 }, (_unused, index) => ({
    column: firstColumn + index,
    row,
  }));
}

/** A loop of paths with a main avenue, three enclosures and every service. */
function bigPark(): GameState {
  const state = parkState();
  const place = (cells: CellPosition[]): void => {
    build(state, { type: 'placePath', cells, surface: GRAVEL });
  };
  place(columnCells(127, 120, 252));
  place(rowCells(120, 60, 196));
  place(rowCells(186, 60, 196));
  place(columnCells(60, 121, 185));
  place(columnCells(196, 121, 185));
  build(state, { type: 'placeEnclosure', outline: rectangle(128, 130, 6, 6) });
  build(state, { type: 'placeEnclosure', outline: rectangle(121, 150, 6, 6) });
  build(state, { type: 'placeEnclosure', outline: rectangle(61, 125, 8, 8) });
  build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
  build(state, { type: 'installGroup', enclosureId: SECOND_ENCLOSURE, speciesId: GIANT_OTTER });
  const third = testEnclosureId('enclosure-3');
  build(state, { type: 'installGroup', enclosureId: third, speciesId: JAGUAR });
  const building = { type: 'placeBuilding', quarterTurns: 0 } as const;
  build(state, { ...building, itemId: BENCH, column: 125, row: 200 });
  build(state, { ...building, itemId: ICE_CREAM_KIOSK, column: 128, row: 170 });
  build(state, { ...building, itemId: TOILETS, column: 124, row: 160 });
  return state;
}

describe('visitor performance', () => {
  it(`simulates ${String(VISITORS)} visitors in under ${String(MAX_MS_PER_STEP)} ms per step`, () => {
    const state = bigPark();
    const context = visitorContext(CROWD_DATA);
    play(state, context, WARM_UP_MS);
    expect(state.visitors.list.length).toBe(VISITORS);

    const events = createEventQueue();
    const startedAt = performance.now();
    for (let step = 0; step < MEASURED_STEPS; step += 1) {
      advance(state, STEP_MS, context, events);
      drain(events);
    }
    const msPerStep = (performance.now() - startedAt) / MEASURED_STEPS;
    process.stdout.write(
      `visitor performance: ${msPerStep.toFixed(3)} ms per step with ${String(state.visitors.list.length)} visitors\n`,
    );
    expect(state.visitors.list.length).toBeGreaterThanOrEqual(VISITORS - 10);
    expect(msPerStep).toBeLessThan(MAX_MS_PER_STEP);
  });
});
