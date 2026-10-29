import { describe, expect, it } from 'vitest';
import { build, FIRST_BUILDING, FIRST_ENCLOSURE, parkState } from '../park/test-support';
import { fromSavedState, toSavedState } from '../state';
import {
  createPathCache,
  distanceAt,
  enclosureField,
  exitField,
  isEnclosureReachable,
  needField,
  serviceAt,
  stepTowards,
  syncPathCache,
  UNREACHABLE,
} from './path-cache';
import {
  ENTRANCE_NORTH_ROW,
  PATH_COLUMN,
  PATH_NORTH_ROW,
  slice,
  visitorPark,
} from './test-support';

const COLUMNS = slice.terrain.columns;

function cell(column: number, row: number): number {
  return row * COLUMNS + column;
}

describe('path cache', () => {
  it('measures walking distances to the exit along the path', () => {
    const state = visitorPark();
    const cache = createPathCache();
    syncPathCache(cache, state, slice);
    const field = exitField(cache);
    expect(distanceAt(field, cell(PATH_COLUMN, ENTRANCE_NORTH_ROW))).toBe(0);
    expect(distanceAt(field, cell(PATH_COLUMN, ENTRANCE_NORTH_ROW - 1))).toBe(1);
    expect(distanceAt(field, cell(PATH_COLUMN, PATH_NORTH_ROW))).toBe(
      ENTRANCE_NORTH_ROW - PATH_NORTH_ROW,
    );
    expect(distanceAt(field, cell(0, 0))).toBe(UNREACHABLE);
    expect(exitField(cache)).toBe(field);
  });

  it('steps north, east, south then west towards the goal, never from the goal itself', () => {
    const state = visitorPark();
    const cache = createPathCache();
    syncPathCache(cache, state, slice);
    const field = exitField(cache);
    const top = cell(PATH_COLUMN, PATH_NORTH_ROW);
    expect(stepTowards(field, top, COLUMNS)).toBe(cell(PATH_COLUMN, PATH_NORTH_ROW + 1));
    expect(stepTowards(field, cell(PATH_COLUMN, ENTRANCE_NORTH_ROW), COLUMNS)).toBe(UNREACHABLE);
    expect(stepTowards(field, cell(0, 0), COLUMNS)).toBe(UNREACHABLE);
    const broken = new Int32Array(field.length).fill(UNREACHABLE);
    broken[top] = 5;
    expect(() => stepTowards(broken, top, COLUMNS)).toThrow();
  });

  it('finds the cells that see an enclosure, and nothing for an enclosure that is gone', () => {
    const state = visitorPark();
    const cache = createPathCache();
    syncPathCache(cache, state, slice);
    expect(isEnclosureReachable(cache, state, slice, FIRST_ENCLOSURE)).toBe(true);
    expect(
      distanceAt(enclosureField(cache, state, slice, FIRST_ENCLOSURE), cell(PATH_COLUMN, 238)),
    ).toBe(0);
    build(state, { type: 'removeEnclosure', enclosureId: FIRST_ENCLOSURE });
    syncPathCache(cache, state, slice);
    expect(isEnclosureReachable(cache, state, slice, FIRST_ENCLOSURE)).toBe(false);
  });

  it('knows which building serves each cell next to it', () => {
    const state = visitorPark({ bench: true });
    const cache = createPathCache();
    syncPathCache(cache, state, slice);
    expect(serviceAt(cache, state, slice, 'rest', cell(PATH_COLUMN, 240))).toBe(FIRST_BUILDING);
    expect(serviceAt(cache, state, slice, 'rest', cell(PATH_COLUMN, 230))).toBeNull();
    expect(distanceAt(needField(cache, state, slice, 'foodDrink'), cell(PATH_COLUMN, 240))).toBe(
      UNREACHABLE,
    );
  });

  it('is rebuilt after a layout change or a load, and reused otherwise', () => {
    const state = visitorPark();
    const cache = createPathCache();
    const first = syncPathCache(cache, state, slice);
    expect(syncPathCache(cache, state, slice)).toBe(first);
    build(state, { type: 'removeEnclosure', enclosureId: FIRST_ENCLOSURE });
    const second = syncPathCache(cache, state, slice);
    expect(second).not.toBe(first);
    // Like a real load: the save is read back into new lists.
    const loaded = fromSavedState(structuredClone(toSavedState(state)));
    expect(syncPathCache(cache, loaded, slice)).not.toBe(second);
  });

  it('refuses to answer before the first sync', () => {
    expect(() => exitField(createPathCache())).toThrow();
  });

  it('has no entrance to reach from on an empty cache', () => {
    const state = parkState();
    expect(isEnclosureReachable(createPathCache(), state, slice, FIRST_ENCLOSURE)).toBe(false);
  });
});
