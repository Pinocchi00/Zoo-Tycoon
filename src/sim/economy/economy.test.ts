import { describe, expect, it } from 'vitest';
import type { GameData } from '../../data/load';
import { BASIS_POINTS_TOTAL } from '../../data/schemas/common';
import { createSimContext } from '../context';
import { createEventQueue, drain, type GameEvent } from '../events';
import {
  build,
  CAPYBARA,
  expectRefused,
  FIRST_ENCLOSURE,
  GRAVEL,
  parkState,
  rectangle,
  run,
  slice,
  testItemId,
} from '../park/test-support';
import type { GameState } from '../state';
import { advance, catchUp, MAX_OFFLINE_MS } from '../time';
import { arrivalRateMilliPerMinute } from '../visitors/attractiveness';
import { syncPathCache } from '../visitors/path-cache';
import {
  columnCells,
  ENTRANCE_NORTH_ROW,
  ICE_CREAM_KIOSK,
  PATH_COLUMN,
  play,
  visitorContext,
  visitorPark,
} from '../visitors/test-support';
import { priceAttendanceBp, satisfactionAttendanceBp } from './attendance';
import { ECONOMY_ERRORS } from './economy-commands';
import { SETTLEMENT_PERIOD_MS, UPKEEP_UNITS_PER_COIN } from './economy-state';
import { upkeepPerHour } from './economy-system';
import { averageGroupSizeMilli, estimateEntryPrice } from './entry-price';
import { createNewGame } from './new-game';
import { isBuildingUnlocked } from './park-level';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const rules = slice.economyRules;
const BENCH = testItemId('bench');

function eventsOf(events: readonly GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((event) => event.type === type);
}

/** A new park as the player gets it, with a path and the capybaras' enclosure. */
function newParkWithCapybaras(): GameState {
  const state = createNewGame(5, slice);
  state.gacha.collection.push({ speciesId: CAPYBARA, stars: 1, groupSize: 4 });
  build(state, {
    type: 'placePath',
    cells: columnCells(PATH_COLUMN, 236, ENTRANCE_NORTH_ROW - 1),
    surface: GRAVEL,
  });
  build(state, { type: 'placeEnclosure', outline: rectangle(PATH_COLUMN + 1, 238, 6, 6) });
  build(state, { type: 'installGroup', enclosureId: FIRST_ENCLOSURE, speciesId: CAPYBARA });
  return state;
}

describe('a new park', () => {
  it('opens with the starting gift and the default entry price', () => {
    const state = createNewGame(1, slice);
    expect(state.currencies.coins).toBe(rules.startingGift.coins);
    expect(state.currencies.arrivalTickets).toBe(rules.startingGift.arrivalTickets);
    expect(state.economy.entryPriceCoins).toBe(rules.entryPrice.defaultCoins);
    expect(state.economy.parkLevel).toBe(1);
  });
});

describe('attendance', () => {
  it('stays at 100 % at the fair price and rises a little below it', () => {
    const { fairCoins, gainPerCoinBelowBp } = rules.entryPrice;
    expect(priceAttendanceBp(fairCoins, rules)).toBe(BASIS_POINTS_TOTAL);
    expect(priceAttendanceBp(0, rules)).toBe(BASIS_POINTS_TOTAL + gainPerCoinBelowBp * fairCoins);
  });

  it('drops above the fair price, never below the floor', () => {
    const { fairCoins, lossPerCoinAboveBp, maxCoins, minAttendanceBp } = rules.entryPrice;
    expect(priceAttendanceBp(fairCoins + 1, rules)).toBe(BASIS_POINTS_TOTAL - lossPerCoinAboveBp);
    expect(priceAttendanceBp(maxCoins, rules)).toBe(minAttendanceBp);
  });

  it('follows the park satisfaction gently, and is full before the first departure', () => {
    const floor = rules.satisfactionAttendanceFloorBp;
    expect(satisfactionAttendanceBp(null, rules)).toBe(BASIS_POINTS_TOTAL);
    expect(satisfactionAttendanceBp(0, rules)).toBe(floor);
    expect(satisfactionAttendanceBp(BASIS_POINTS_TOTAL, rules)).toBe(BASIS_POINTS_TOTAL);
  });

  it('lowers the arrival rate of an unhappy park', () => {
    const state = visitorPark();
    const context = visitorContext();
    syncPathCache(context.paths, state, slice);
    const happy = arrivalRateMilliPerMinute(state, slice, context.paths);
    state.visitors.parkSatisfactionBp = 0;
    const unhappy = arrivalRateMilliPerMinute(state, slice, context.paths);
    expect(unhappy).toBe(
      Math.floor((happy * rules.satisfactionAttendanceFloorBp) / BASIS_POINTS_TOTAL),
    );
  });
});

describe('entry price estimate', () => {
  it('shows fewer visitors but the matching entry revenue for a dearer entry', () => {
    const state = visitorPark();
    const context = visitorContext();
    const fair = estimateEntryPrice(state, context, rules.entryPrice.fairCoins);
    const dear = estimateEntryPrice(state, context, rules.entryPrice.fairCoins + 2);
    expect(dear.groupsPerHourMilli).toBeLessThan(fair.groupsPerHourMilli);
    expect(fair.entryCoinsPerHour).toBe(
      Math.floor(
        (fair.groupsPerHourMilli * averageGroupSizeMilli(slice) * fair.priceCoins) / 1_000_000,
      ),
    );
    expect(estimateEntryPrice(state, context, 0).entryCoinsPerHour).toBe(0);
  });

  it('estimates nothing for a park without animals or without visitor kinds', () => {
    const empty = parkState();
    expect(estimateEntryPrice(empty, visitorContext(), 5)).toEqual({
      priceCoins: 5,
      groupsPerHourMilli: 0,
      entryCoinsPerHour: 0,
    });
    expect(averageGroupSizeMilli({ ...slice, visitorArchetypes: new Map() })).toBe(0);
  });
});

describe('setEntryPrice', () => {
  it('changes the price that each person pays at the gate', () => {
    const state = visitorPark();
    const { result, events } = run(state, { type: 'setEntryPrice', priceCoins: 7 });
    expect(result.ok).toBe(true);
    expect(events).toEqual([{ type: 'entryPriceChanged', priceCoins: 7 }]);
    const arrived = play(state, visitorContext(), 3 * MINUTE_MS).flatMap((event) =>
      event.type === 'visitorArrived' ? [event] : [],
    );
    expect(arrived.length).toBeGreaterThan(0);
    for (const event of arrived) {
      expect(event.entryCoins).toBe(7 * event.groupSize);
    }
    expect(state.economy.totals.visitorCoins).toBeGreaterThan(0);
  });

  it('refuses a negative, fractional or too high price', () => {
    const state = visitorPark();
    for (const priceCoins of [-1, 1.5, rules.entryPrice.maxCoins + 1, Number.NaN]) {
      expectRefused(state, { type: 'setEntryPrice', priceCoins }, 'invalidEntryPrice');
    }
  });
});

describe('daily mail', () => {
  it('gives one day of tickets, once a day', () => {
    const state = parkState();
    const { result, events } = run(state, { type: 'claimMail', day: 100 });
    expect(result.ok).toBe(true);
    const tickets = rules.dailyMail.ticketsPerDay;
    expect(events).toEqual([{ type: 'mailClaimed', day: 100, tickets, ticketsTotal: tickets }]);
    expectRefused(state, { type: 'claimMail', day: 100 }, 'mailAlreadyClaimed');
    build(state, { type: 'claimMail', day: 101 });
    expect(state.currencies.arrivalTickets).toBe(2 * tickets);
  });

  it('keeps the letters of a few days away, up to the cap', () => {
    const state = parkState();
    build(state, { type: 'claimMail', day: 10 });
    build(state, { type: 'claimMail', day: 12 });
    const { ticketsPerDay, maxDays } = rules.dailyMail;
    expect(state.currencies.arrivalTickets).toBe(ticketsPerDay * 3);
    build(state, { type: 'claimMail', day: 40 });
    expect(state.currencies.arrivalTickets).toBe(ticketsPerDay * (3 + maxDays));
  });

  it('refuses a day before the last claim, a negative or a fractional day', () => {
    const state = parkState();
    build(state, { type: 'claimMail', day: 10 });
    for (const day of [9, -1, 10.5]) {
      expectRefused(state, { type: 'claimMail', day }, 'invalidDay');
    }
  });

  it('refuses tickets that would overflow', () => {
    const state = parkState();
    state.currencies.arrivalTickets = Number.MAX_SAFE_INTEGER;
    expectRefused(state, { type: 'claimMail', day: 1 }, 'currencyOverflow');
  });
});

describe('ticket counter', () => {
  it('sells a few tickets a day for coins', () => {
    const state = parkState(1000);
    const { coinsPerTicket, ticketsPerDay } = rules.ticketCounter;
    const { events } = run(state, { type: 'buyCounterTicket', day: 3 });
    expect(events).toEqual([
      {
        type: 'counterTicketBought',
        coinsSpent: coinsPerTicket,
        coinsTotal: 1000 - coinsPerTicket,
        ticketsTotal: 1,
        leftToday: ticketsPerDay - 1,
      },
    ]);
    for (let bought = 1; bought < ticketsPerDay; bought += 1) {
      build(state, { type: 'buyCounterTicket', day: 3 });
    }
    expectRefused(state, { type: 'buyCounterTicket', day: 3 }, 'counterSoldOut');
    build(state, { type: 'buyCounterTicket', day: 4 });
    expect(state.currencies.arrivalTickets).toBe(ticketsPerDay + 1);
    expect(state.currencies.coins).toBe(1000 - (ticketsPerDay + 1) * coinsPerTicket);
  });

  it('refuses without enough coins, for an earlier day or when tickets would overflow', () => {
    const poor = parkState(rules.ticketCounter.coinsPerTicket - 1);
    expectRefused(poor, { type: 'buyCounterTicket', day: 1 }, 'notEnoughCoins');
    const state = parkState();
    build(state, { type: 'buyCounterTicket', day: 5 });
    expectRefused(state, { type: 'buyCounterTicket', day: 4 }, 'invalidDay');
    expectRefused(state, { type: 'buyCounterTicket', day: -2 }, 'invalidDay');
    state.currencies.arrivalTickets = Number.MAX_SAFE_INTEGER;
    expectRefused(state, { type: 'buyCounterTicket', day: 6 }, 'currencyOverflow');
  });

  it('lists every refusal reason once', () => {
    expect(new Set(ECONOMY_ERRORS).size).toBe(ECONOMY_ERRORS.length);
  });
});

describe('park levels', () => {
  it('unlocks the first buildings at level 1 only', () => {
    const state = createNewGame(1, slice);
    expect(isBuildingUnlocked(state, slice, BENCH)).toBe(true);
    expect(isBuildingUnlocked(state, slice, ICE_CREAM_KIOSK)).toBe(false);
  });

  it('refuses a building that a later level unlocks', () => {
    const state = newParkWithCapybaras();
    const kiosk = {
      type: 'placeBuilding',
      itemId: ICE_CREAM_KIOSK,
      column: PATH_COLUMN - 3,
      row: 244,
      quarterTurns: 0,
    } as const;
    expectRefused(state, kiosk, 'buildingLocked');
  });

  it('rises with the park stars, grants its tickets once and is never taken back', () => {
    const state = newParkWithCapybaras();
    // Low thresholds, so that one enclosure of capybaras reaches levels 2 and 3 but not 4.
    const levels = rules.parkLevels.map((level, index) => ({
      ...level,
      stars: index < 3 ? index * 5 : 1000 * index,
    }));
    const data: GameData = { ...slice, economyRules: { ...rules, parkLevels: levels } };
    const context = createSimContext(data);
    const queue = createEventQueue();
    const ticketsBefore = state.currencies.arrivalTickets;
    advance(state, 100, context, queue);
    const events = drain(queue);
    const stars = state.economy.parkStars;
    expect(stars).toBeGreaterThanOrEqual(10);
    expect(eventsOf(events, 'parkStarsChanged')).toEqual([{ type: 'parkStarsChanged', stars }]);
    const reached = data.economyRules.parkLevels.slice(0, 3);
    expect(state.economy.parkLevel).toBe(3);
    const reward = reached.reduce((sum, level) => sum + level.rewardTickets, 0);
    expect(state.currencies.arrivalTickets).toBe(ticketsBefore + reward);
    expect(eventsOf(events, 'parkLevelReached')).toContainEqual(
      expect.objectContaining({
        type: 'parkLevelReached',
        level: 2,
        unlockedBuildings: [ICE_CREAM_KIOSK],
      }),
    );

    build(state, { type: 'removeEnclosure', enclosureId: FIRST_ENCLOSURE });
    advance(state, 100, context, queue);
    expect(state.economy.parkStars).toBe(0);
    expect(state.economy.parkLevel).toBe(reached.length);
    expect(state.currencies.arrivalTickets).toBe(ticketsBefore + reward);
  });
});

/** A park where each step's visitor revenue is set by hand, with a bench to pay upkeep for. */
function upkeepPark(): { state: GameState; data: GameData } {
  const state = visitorPark({ bench: true });
  // No visitor comes, so that the revenue is only what the test adds.
  const data: GameData = { ...slice, visitorArchetypes: new Map() };
  return { state, data };
}

describe('upkeep', () => {
  it('adds up the upkeep of every building', () => {
    const { state } = upkeepPark();
    expect(upkeepPerHour(state, slice)).toBe(slice.buildings.get(BENCH)?.upkeepCoinsPerHour);
    expect(upkeepPerHour(state, { ...slice, buildings: new Map() })).toBe(0);
  });

  it('is never paid without revenue: the park cannot go bankrupt', () => {
    const { state, data } = upkeepPark();
    const coins = state.currencies.coins;
    const queue = createEventQueue();
    advance(state, 3 * HOUR_MS, createSimContext(data), queue);
    expect(state.currencies.coins).toBe(coins);
    expect(eventsOf(drain(queue), 'upkeepPaid')).toEqual([]);
    expect(state.economy.upkeepOwed).toBeLessThan(UPKEEP_UNITS_PER_COIN);
  });

  it('takes at most its share of the minute revenue', () => {
    const { state, data } = upkeepPark();
    state.economy.upkeepOwed = 1000 * UPKEEP_UNITS_PER_COIN;
    state.economy.periodRevenue = 100;
    const coins = state.currencies.coins;
    const queue = createEventQueue();
    advance(state, SETTLEMENT_PERIOD_MS, createSimContext(data), queue);
    const paid = Math.floor((100 * rules.upkeepMaxShareOfRevenueBp) / BASIS_POINTS_TOTAL);
    expect(state.currencies.coins).toBe(coins - paid);
    expect(drain(queue)).toContainEqual({ type: 'upkeepPaid', amount: paid, total: coins - paid });
    expect(state.economy.totals.upkeepCoins).toBe(paid);
    expect(state.economy.periodRevenue).toBe(0);
  });

  it('pays the whole upkeep when the revenue is large enough', () => {
    const { state, data } = upkeepPark();
    state.economy.periodRevenue = 1_000_000;
    const coins = state.currencies.coins;
    advance(state, HOUR_MS, createSimContext(data), createEventQueue());
    const perHour = upkeepPerHour(state, slice);
    // Only the first minute had revenue: it pays what was owed by then.
    expect(coins - state.currencies.coins).toBe(Math.floor(perHour / 60));
  });

  it('never takes more coins than the park holds', () => {
    const { state, data } = upkeepPark();
    state.currencies.coins = 2;
    state.economy.upkeepOwed = 1000 * UPKEEP_UNITS_PER_COIN;
    state.economy.periodRevenue = 1000;
    advance(state, SETTLEMENT_PERIOD_MS, createSimContext(data), createEventQueue());
    expect(state.currencies.coins).toBe(0);
  });

  it('settles in a few minutes on screen much like offline', () => {
    const online = visitorPark({ bench: true, kiosk: true, toilets: true });
    const offline = visitorPark({ bench: true, kiosk: true, toilets: true });
    play(online, visitorContext(), HOUR_MS);
    catchUp(offline, HOUR_MS, visitorContext(), createEventQueue());
    expect(online.economy.totals.upkeepCoins).toBeGreaterThan(0);
    expect(offline.economy.totals.upkeepCoins).toBeGreaterThan(
      online.economy.totals.upkeepCoins * 0.7,
    );
    expect(offline.economy.totals.upkeepCoins).toBeLessThan(
      online.economy.totals.upkeepCoins * 1.3,
    );
  });
});

describe('offline report', () => {
  it('tells the journal what the park earned while the player was away', () => {
    const state = visitorPark({ bench: true, kiosk: true, toilets: true });
    const queue = createEventQueue();
    const before = structuredClone(state.economy.totals);
    catchUp(state, 2 * HOUR_MS, visitorContext(), queue);
    const reports = eventsOf(drain(queue), 'offlineReport');
    expect(reports).toEqual([
      {
        type: 'offlineReport',
        awayMs: 2 * HOUR_MS,
        simulatedMs: 2 * HOUR_MS,
        visitorGroups: state.visitors.nextNumber - 1,
        visitorCoins: state.economy.totals.visitorCoins - before.visitorCoins,
        upkeepCoins: state.economy.totals.upkeepCoins - before.upkeepCoins,
        levelsGained: 0,
      },
    ]);
    expect(state.economy.totals.visitorCoins).toBeGreaterThan(0);
  });

  it('stops earning after 12 hours away', () => {
    const state = parkState();
    const queue = createEventQueue();
    catchUp(state, 2 * MAX_OFFLINE_MS, createSimContext(slice), queue);
    expect(eventsOf(drain(queue), 'offlineReport')).toEqual([
      expect.objectContaining({ awayMs: 2 * MAX_OFFLINE_MS, simulatedMs: MAX_OFFLINE_MS }),
    ]);
  });
});
