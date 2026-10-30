import { describe, expect, it } from 'vitest';
import type { GameData } from '../../data/load';
import { createEventQueue, type GameEvent } from '../events';
import { build, CAPYBARA, FIRST_ENCLOSURE, GRAVEL, parkState, slice } from '../park/test-support';
import { advance, catchUp, STEP_MS } from '../time';
import {
  arrivalRateMilliPerMinute,
  enclosureAttractivenessMilli,
  MILLI,
  visitorCapacity,
} from './attractiveness';
import { suggestionFeed, visitorThoughtKey } from './feedback';
import { syncPathCache } from './path-cache';
import {
  columnCells,
  countEvents,
  ENTRANCE_NORTH_ROW,
  PATH_COLUMN,
  PATH_NORTH_ROW,
  play,
  visitorContext,
  visitorPark,
} from './test-support';
import { FINE_PER_BASIS_POINT } from './visitor-state';
import { spendingRateBp } from './walk';

const MINUTE_MS = 60_000;

/** The slice's data with other visitor rules, for crowd tests. */
function withArrivals(arrivals: Partial<GameData['visitorRules']['arrivals']>): GameData {
  const rules = slice.visitorRules;
  return { ...slice, visitorRules: { ...rules, arrivals: { ...rules.arrivals, ...arrivals } } };
}

describe('arrivals', () => {
  it('lets nobody in while no animal can be seen', () => {
    const state = parkState();
    build(state, {
      type: 'placePath',
      cells: columnCells(PATH_COLUMN, PATH_NORTH_ROW, ENTRANCE_NORTH_ROW - 1),
      surface: GRAVEL,
    });
    const events = play(state, visitorContext(), 10 * MINUTE_MS);
    expect(countEvents(events, 'visitorArrived')).toBe(0);
    expect(state.visitors.arrivalProgress).toBe(0);
  });

  it('follows V = k × √A of the GDD', () => {
    const state = visitorPark();
    const context = visitorContext();
    const enclosure = state.enclosures[0];
    if (enclosure === undefined) {
      throw new Error('the park has an enclosure');
    }
    // Capybara: 10 × (1 + 0.2 × 1 star) × (1 + 0.1 × view).
    const expected = Math.floor(10 * MILLI * 1.2 * (1 + 0.1 * enclosure.viewScore));
    expect(enclosure.viewScore).toBeGreaterThan(0);
    expect(enclosureAttractivenessMilli(enclosure, state, slice)).toBe(expected);
    syncPathCache(context.paths, state, slice);
    expect(arrivalRateMilliPerMinute(state, slice, context.paths)).toBe(
      Math.floor(
        slice.visitorRules.arrivals.milliVisitorsPerSqrtAttractiveness *
          Math.sqrt(expected / MILLI),
      ),
    );
  });

  it('gives nothing for an empty enclosure or a species unknown to the data', () => {
    const state = visitorPark();
    const [enclosure] = state.enclosures;
    if (enclosure === undefined) {
      throw new Error('the park has an enclosure');
    }
    expect(enclosureAttractivenessMilli({ ...enclosure, speciesId: null }, state, slice)).toBe(0);
    expect(enclosureAttractivenessMilli(enclosure, state, { ...slice, species: new Map() })).toBe(
      0,
    );
  });

  it('caps the rate per minute and the crowd by the walkways', () => {
    const context = visitorContext(withArrivals({ maxPerMinute: 1 }));
    const state = visitorPark();
    syncPathCache(context.paths, state, context.data);
    expect(arrivalRateMilliPerMinute(state, context.data, context.paths)).toBe(MILLI);
    // 23 path cells and the 24 cells of the entrance, two cells per group.
    expect(visitorCapacity(context.data, context.paths)).toBe(23);

    const crowded = visitorPark();
    play(crowded, visitorContext(), 20 * MINUTE_MS);
    expect(crowded.visitors.list.length).toBeLessThanOrEqual(23);
    expect(crowded.visitors.arrivalProgress).toBeLessThanOrEqual(MILLI * MINUTE_MS);
  });

  it('lets nobody in without archetypes, and lets go those whose kind left the data', () => {
    const state = visitorPark();
    play(state, visitorContext(), MINUTE_MS);
    expect(state.visitors.list.length).toBeGreaterThan(0);
    const events = play(state, visitorContext({ ...slice, visitorArchetypes: new Map() }), 1000);
    expect(state.visitors.list).toEqual([]);
    expect(countEvents(events, 'visitorArrived')).toBe(0);
    expect(events.every((event) => event.type !== 'visitorLeft' || event.lost)).toBe(true);
  });

  it('gives each group its own id, from the entrance', () => {
    const state = visitorPark();
    play(state, visitorContext(), 2 * MINUTE_MS);
    const ids = state.visitors.list.map((visitor) => visitor.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('visitor-1');
    expect(state.visitors.nextNumber).toBeGreaterThan(ids.length);
  });
});

describe('needs and services', () => {
  it('makes the bench suggestion appear in a park without a bench', () => {
    const state = visitorPark();
    const events = play(state, visitorContext(), 20 * MINUTE_MS);
    expect(state.visitors.suggestions.rest).toBeGreaterThan(0);
    expect(suggestionFeed(state, slice).map((suggestion) => suggestion.textKey)).toContain(
      'visitor.thought.missingRest',
    );
    expect(events).toContainEqual(expect.objectContaining({ type: 'serviceMissed', need: 'rest' }));
    const thoughts = state.visitors.list.map((visitor) => visitorThoughtKey(visitor, slice));
    expect(thoughts).toContain('visitor.thought.missingRest');
  });

  it('sends tired visitors to the bench instead', () => {
    const state = visitorPark({ bench: true });
    const events = play(state, visitorContext(), 20 * MINUTE_MS);
    expect(state.visitors.suggestions.rest).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'visitorUsedService', coinsSpent: 0 }),
    );
  });

  it('earns coins at the kiosk, and keeps everyone happier with every service', () => {
    const bare = visitorPark();
    const served = visitorPark({ bench: true, kiosk: true, toilets: true });
    const coinsBefore = served.currencies.coins;
    play(bare, visitorContext(), 30 * MINUTE_MS);
    const events = play(served, visitorContext(), 30 * MINUTE_MS);
    const coinsMoved = (event: GameEvent): number => {
      if (event.type === 'visitorUsedService') {
        return event.coinsSpent;
      }
      if (event.type === 'visitorArrived') {
        return event.entryCoins;
      }
      return event.type === 'upkeepPaid' ? -event.amount : 0;
    };
    const kioskCoins = events.reduce(
      (sum, event) => sum + (event.type === 'visitorUsedService' ? event.coinsSpent : 0),
      0,
    );
    expect(kioskCoins).toBeGreaterThan(0);
    expect(served.currencies.coins - coinsBefore).toBe(
      events.reduce((sum, event) => sum + coinsMoved(event), 0),
    );
    expect(suggestionFeed(served, slice)).toEqual([]);
    expect(served.visitors.parkSatisfactionBp ?? 0).toBeGreaterThan(
      bare.visitors.parkSatisfactionBp ?? 0,
    );
  });

  it('trims spending a little when satisfaction drops, never more', () => {
    const rules = slice.visitorRules;
    expect(spendingRateBp(0, rules)).toBe(rules.satisfaction.spendFloorBp);
    expect(spendingRateBp(5000, rules)).toBe(9000);
    expect(spendingRateBp(10_000, rules)).toBe(10_000);
  });

  it('halves old suggestions every half-life', () => {
    const state = visitorPark();
    state.visitors.suggestions.rest = 9;
    state.visitors.suggestions.comfort = 1;
    const context = visitorContext({ ...slice, visitorArchetypes: new Map() });
    play(state, context, slice.visitorRules.suggestionHalfLifeMinutes * MINUTE_MS);
    expect(state.visitors.suggestions).toEqual({ foodDrink: 0, rest: 4, comfort: 0 });
    expect(suggestionFeed(state, slice)).toEqual([
      { need: 'rest', count: 4, textKey: 'visitor.thought.missingRest' },
    ]);
  });
});

describe('suggestions over a long absence', () => {
  it('applies every half-life at once instead of looping', () => {
    const state = visitorPark();
    state.visitors.suggestions.rest = Number.MAX_SAFE_INTEGER;
    state.visitors.suggestions.foodDrink = 8;
    const halfLifeMs = slice.visitorRules.suggestionHalfLifeMinutes * MINUTE_MS;
    // The clock jumps far ahead of the last halving, as after a very old save.
    state.clock.timeMs = 1_000_000 * halfLifeMs;
    const context = visitorContext({ ...slice, visitorArchetypes: new Map() });
    advance(state, STEP_MS, context, createEventQueue());
    expect(state.visitors.suggestions).toEqual({ foodDrink: 0, rest: 0, comfort: 0 });
    expect(state.visitors.suggestionsHalvedAtMs).toBe(1_000_000 * halfLifeMs);
  });
});

describe('finding the way', () => {
  it('lets a visitor saved beyond the edge of the land slip away', () => {
    const state = visitorPark();
    const context = visitorContext();
    play(state, context, MINUTE_MS);
    const [visitor] = state.visitors.list;
    if (visitor === undefined) {
      throw new Error('a visitor came in');
    }
    visitor.column = slice.terrain.columns;
    visitor.nextColumn = slice.terrain.columns;
    const events = play(state, context, 1000);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'visitorLeft', visitorId: visitor.id, lost: true }),
    );
  });

  it('always gets every visitor out once the visits end', () => {
    const state = visitorPark({ bench: true });
    const context = visitorContext();
    const arrived = play(state, context, 20 * MINUTE_MS);
    // No more animals: no more arrivals, and the groups inside head home.
    build(state, { type: 'removeEnclosure', enclosureId: FIRST_ENCLOSURE });
    const after = play(state, context, 20 * MINUTE_MS);
    const events = [...arrived, ...after];
    expect(state.visitors.list).toEqual([]);
    expect(countEvents(events, 'visitorLeft')).toBe(countEvents(events, 'visitorArrived'));
    expect(events.some((event) => event.type === 'visitorLeft' && event.lost)).toBe(false);
  });

  it('lets a visitor slip away when its walkway disappears or no longer reaches the exit', () => {
    const state = visitorPark();
    const context = visitorContext();
    play(state, context, 3 * MINUTE_MS);
    const present = state.visitors.list.length;
    expect(present).toBeGreaterThan(0);
    // Cut the path near the entrance: everyone north of it is stranded.
    build(state, { type: 'removePath', cells: columnCells(PATH_COLUMN, 250, 250) });
    const events = play(state, context, 15 * MINUTE_MS);
    expect(events.some((event) => event.type === 'visitorLeft' && event.lost)).toBe(true);
    expect(state.visitors.list).toEqual([]);
  });

  it('never jams a one-cell-wide path, even with 250 groups on it', () => {
    const data = withArrivals({
      maxPresent: 250,
      maxPerMinute: 250,
      walkableCellsPerVisitor: 1,
      milliVisitorsPerSqrtAttractiveness: 200_000,
    });
    const state = parkState();
    build(state, {
      type: 'placePath',
      cells: columnCells(PATH_COLUMN, 0, ENTRANCE_NORTH_ROW - 1),
      surface: GRAVEL,
    });
    build(state, {
      type: 'placeEnclosure',
      outline: [
        { x: PATH_COLUMN + 1, y: 0 },
        { x: PATH_COLUMN + 7, y: 0 },
        { x: PATH_COLUMN + 7, y: 6 },
        { x: PATH_COLUMN + 1, y: 6 },
      ],
    });
    build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
    const context = visitorContext(data);
    play(state, context, 2 * MINUTE_MS);
    expect(state.visitors.list.length).toBe(250);
    for (const visitor of state.visitors.list) {
      visitor.visitLeftMs = 0;
    }
    build(state, { type: 'removeEnclosure', enclosureId: FIRST_ENCLOSURE });
    // 253 cells at 0.8 m/s for the slowest: under six minutes, whatever the crowd.
    const events = play(state, context, 6 * MINUTE_MS);
    expect(state.visitors.list).toEqual([]);
    expect(events.some((event) => event.type === 'visitorLeft' && event.lost)).toBe(false);
  });
});

describe('time steps', () => {
  // Long enough for a group to come in at the arrival rate of task 1.6.
  it('gives the same crowd for 1000 × 48 ms as for 1 × 48 000 ms', () => {
    const small = visitorPark();
    const large = visitorPark();
    const context = visitorContext();
    const events = createEventQueue();
    for (let frame = 0; frame < 1000; frame += 1) {
      advance(small, 48, context, events);
    }
    advance(large, 48_000, context, events);
    expect(JSON.stringify(large)).toBe(JSON.stringify(small));
    expect(large.visitors.list.length).toBeGreaterThan(0);
  });

  it('plays an hour offline in one-minute steps much like an hour on screen', () => {
    const online = visitorPark({ bench: true, kiosk: true, toilets: true });
    const offline = visitorPark({ bench: true, kiosk: true, toilets: true });
    const coins = online.currencies.coins;
    const onlineEvents = play(online, visitorContext(), 60 * MINUTE_MS);
    const queue = createEventQueue();
    catchUp(offline, 60 * MINUTE_MS, visitorContext(), queue);
    const offlineEvents = queue.pending;
    const leftOnline = countEvents(onlineEvents, 'visitorLeft');
    const leftOffline = countEvents(offlineEvents, 'visitorLeft');
    expect(leftOffline).toBeGreaterThan(leftOnline * 0.8);
    expect(leftOffline).toBeLessThan(leftOnline * 1.2);
    const earnedOnline = online.currencies.coins - coins;
    const earnedOffline = offline.currencies.coins - coins;
    expect(earnedOffline).toBeGreaterThan(earnedOnline * 0.7);
    expect(earnedOffline).toBeLessThan(earnedOnline * 1.3);
  });

  it('updates far visitors every fifth step with all their time, near ones every step', () => {
    const state = visitorPark();
    const context = visitorContext();
    play(state, context, 2 * MINUTE_MS);
    const count = state.visitors.list.length;
    expect(count).toBeGreaterThan(5);
    // The camera looks at the far north-west corner: nobody is near it.
    context.focus = { minColumn: 0, minRow: 0, maxColumn: 3, maxRow: 3 };
    const events = createEventQueue();
    advance(state, STEP_MS, context, events);
    const now = state.clock.timeMs;
    const updated = state.visitors.list.filter((visitor) => visitor.updatedAtMs === now);
    expect(updated.length).toBeGreaterThan(0);
    expect(updated.length).toBeLessThan(count);
    advance(state, 4 * STEP_MS, context, events);
    const lag = Math.max(
      ...state.visitors.list.map((visitor) => state.clock.timeMs - visitor.updatedAtMs),
    );
    expect(lag).toBeLessThan(5 * STEP_MS);

    context.focus = { minColumn: 0, minRow: 0, maxColumn: 255, maxRow: 255 };
    advance(state, STEP_MS, context, events);
    expect(state.visitors.list.every((visitor) => visitor.updatedAtMs === state.clock.timeMs)).toBe(
      true,
    );
  });

  it('keeps far visitors visiting and leaving normally', () => {
    const state = visitorPark({ bench: true });
    const context = visitorContext();
    context.focus = { minColumn: 0, minRow: 0, maxColumn: 3, maxRow: 3 };
    const events = play(state, context, 20 * MINUTE_MS);
    expect(countEvents(events, 'visitorLeft')).toBeGreaterThan(0);
    expect(events.some((event) => event.type === 'visitorLeft' && event.lost)).toBe(false);
  });
});

describe('satisfaction', () => {
  it('stays within bounds and fine units', () => {
    const state = visitorPark();
    play(state, visitorContext(), 15 * MINUTE_MS);
    for (const visitor of state.visitors.list) {
      expect(visitor.satisfaction).toBeGreaterThanOrEqual(0);
      expect(visitor.satisfaction).toBeLessThanOrEqual(10_000 * FINE_PER_BASIS_POINT);
    }
  });
});
