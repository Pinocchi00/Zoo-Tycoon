import { describe, expect, it } from 'vitest';
import type { GameData } from '../../data/load';
import { applyCommand, type Command } from '../commands';
import { createEventQueue, drain, type ArrivalOpenedEvent, type GameEvent } from '../events';
import { createGameState, type GameState } from '../state';
import { sliceGameData, syntheticGameData, testBannerId, testSpeciesId } from './test-support';

const slice = sliceGameData();
const synthetic = syntheticGameData();
const REFUGE = testBannerId('refuge');
const WELCOME = testBannerId('welcome');
const CAPYBARA = testSpeciesId('capybara');
const JAGUAR = testSpeciesId('jaguar');
const OTTER = testSpeciesId('giant-otter');

const single: Command = { type: 'performArrival', bannerId: REFUGE, mode: 'single' };
const multi: Command = { type: 'performArrival', bannerId: REFUGE, mode: 'multi' };

function stateWithTickets(tickets: number): GameState {
  const state = createGameState(5);
  state.currencies.arrivalTickets = tickets;
  return state;
}

function opened(events: readonly GameEvent[]): ArrivalOpenedEvent[] {
  return events.filter((event): event is ArrivalOpenedEvent => event.type === 'arrivalOpened');
}

/** Runs a command that must fail and checks that it left no trace. */
function expectRefused(state: GameState, command: Command, data: GameData, error: string): void {
  const before = JSON.stringify(state);
  const events = createEventQueue();
  expect(applyCommand(state, command, data, events)).toEqual({ ok: false, error });
  expect(JSON.stringify(state)).toBe(before);
  expect(drain(events)).toEqual([]);
}

function run(state: GameState, command: Command, data: GameData = slice): readonly GameEvent[] {
  const events = createEventQueue();
  expect(applyCommand(state, command, data, events)).toEqual({ ok: true, value: undefined });
  return drain(events);
}

describe('performArrival', () => {
  it('spends one ticket, delivers one species and earns 10 medals', () => {
    const state = stateWithTickets(3);
    const events = run(state, single);

    expect(state.currencies.arrivalTickets).toBe(2);
    expect(state.currencies.careMedals).toBe(10);
    expect(events[0]).toEqual({
      type: 'arrivalsStarted',
      bannerId: REFUGE,
      count: 1,
      ticketsSpent: 1,
    });
    const [arrival] = opened(events);
    expect(arrival).toMatchObject({
      number: 1,
      bannerId: REFUGE,
      source: 'draw',
      isNew: true,
      stars: 1,
      medalsEarned: 10,
    });
    expect(state.gacha.history).toEqual([
      {
        number: 1,
        timeMs: 0,
        bannerId: REFUGE,
        speciesId: arrival?.speciesId,
        rarity: arrival?.rarity,
        source: 'draw',
      },
    ]);
    expect(state.gacha.collection).toHaveLength(1);
  });

  it('gives 10 arrivals for 9 tickets', () => {
    const state = stateWithTickets(9);
    const events = run(state, multi);
    expect(state.currencies.arrivalTickets).toBe(0);
    expect(opened(events).map((event) => event.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(state.gacha.history).toHaveLength(10);
    // A batch of ten always holds a rare or better.
    expect(
      opened(events).some((event) => event.rarity !== 'common' && event.rarity !== 'uncommon'),
    ).toBe(true);
  });

  it('refuses without enough tickets', () => {
    expectRefused(stateWithTickets(0), single, slice, 'notEnoughTickets');
    expectRefused(stateWithTickets(8), multi, slice, 'notEnoughTickets');
  });

  it('refuses an unknown banner', () => {
    const command: Command = {
      type: 'performArrival',
      bannerId: testBannerId('summer'),
      mode: 'single',
    };
    expectRefused(stateWithTickets(5), command, slice, 'unknownBanner');
  });

  it('refuses when no species exists at all', () => {
    const empty: GameData = { ...slice, species: new Map() };
    expectRefused(stateWithTickets(5), single, empty, 'noSpeciesAvailable');
  });

  it('refuses arrivals whose medals could not be counted exactly', () => {
    const state = stateWithTickets(5);
    state.currencies.careMedals = Number.MAX_SAFE_INTEGER - 20;
    expectRefused(state, single, slice, 'currencyOverflow');
  });

  it('keeps the guarantee counters from one banner to the next', () => {
    const state = stateWithTickets(100);
    const welcomeSingle: Command = { type: 'performArrival', bannerId: WELCOME, mode: 'single' };
    // 19 welcome arrivals: the 20th would be the guaranteed choice, tested on its own.
    for (let arrival = 0; arrival < 38; arrival += 1) {
      const before = { ...state.gacha.arrivalsSince };
      const [opening] = opened(run(state, arrival % 2 === 0 ? single : welcomeSingle));
      const isRareOrBetter = opening?.rarity === 'rare' || opening?.rarity === 'veryRare';
      // The other banner picks up exactly where the previous arrival left the counter.
      expect(state.gacha.arrivalsSince.rare).toBe(isRareOrBetter ? 0 : before.rare + 1);
    }
  });

  it('lets a guarantee of an empty tier fall on the rarer tiers that have species', () => {
    // D-020 as validated: with no very rare at all, the 40th arrival brings an iconic.
    const withoutVeryRares: GameData = {
      ...synthetic,
      species: new Map(
        [...synthetic.species].filter(([, species]) => species.rarity !== 'veryRare'),
      ),
    };
    const state = stateWithTickets(1);
    state.gacha.arrivalsSince = { rare: 0, veryRare: 39, iconic: 0 };
    const [arrival] = opened(run(state, single, withoutVeryRares));
    expect(arrival?.rarity).toBe('iconic');
  });

  it('turns a duplicate of a complete species into 50 more medals', () => {
    const state = stateWithTickets(1);
    state.gacha.arrivalsSince = { rare: 0, veryRare: 39, iconic: 0 };
    state.gacha.collection.push({ speciesId: JAGUAR, stars: 5, groupSize: 5 });
    const [arrival] = opened(run(state, single));
    expect(arrival).toMatchObject({ speciesId: JAGUAR, isNew: false, medalsEarned: 60 });
    expect(state.currencies.careMedals).toBe(60);
  });
});

describe('welcome banner', () => {
  const welcomeMulti: Command = { type: 'performArrival', bannerId: WELCOME, mode: 'multi' };
  const welcomeSingle: Command = { type: 'performArrival', bannerId: WELCOME, mode: 'single' };

  it('offers the guaranteed very rare on its 20th arrival, then delivers the pick', () => {
    const state = stateWithTickets(18);
    run(state, welcomeMulti);
    const events = run(state, welcomeMulti);

    expect(opened(events)).toHaveLength(9);
    expect(events.at(-1)).toEqual({
      type: 'welcomeChoiceOffered',
      bannerId: WELCOME,
      options: [JAGUAR],
    });
    expect(state.gacha.welcome).toEqual({
      arrivalsDone: 20,
      pendingChoice: { bannerId: WELCOME, options: [JAGUAR] },
    });
    expect(state.gacha.history).toHaveLength(19);

    const iconicBefore = state.gacha.arrivalsSince.iconic;
    const [chosen] = opened(run(state, { type: 'chooseWelcomeSpecies', speciesId: JAGUAR }));
    expect(chosen).toMatchObject({
      number: 20,
      bannerId: WELCOME,
      speciesId: JAGUAR,
      rarity: 'veryRare',
      source: 'welcomeChoice',
      medalsEarned: 10,
    });
    expect(state.gacha.welcome.pendingChoice).toBeNull();
    expect(state.gacha.arrivalsSince).toEqual({ rare: 0, veryRare: 0, iconic: iconicBefore });
  });

  it('offers at most three different species of the tier', () => {
    const state = stateWithTickets(1);
    state.gacha.welcome.arrivalsDone = 19;
    const species = new Map(synthetic.species);
    for (const template of synthetic.species.values()) {
      if (template.rarity === 'veryRare') {
        const id = testSpeciesId(`${template.id}-twin`);
        species.set(id, { ...template, id });
      }
    }
    run(state, welcomeSingle, { ...synthetic, species });

    const options = state.gacha.welcome.pendingChoice?.options ?? [];
    expect(options).toHaveLength(3);
    expect(new Set(options).size).toBe(3);
    expect(options.every((id) => species.get(id)?.rarity === 'veryRare')).toBe(true);
  });

  it('refuses a batch that would go past its 20 arrivals, and any arrival after them', () => {
    const state = stateWithTickets(50);
    state.gacha.welcome.arrivalsDone = 11;
    expectRefused(state, welcomeMulti, slice, 'welcomeArrivalsExhausted');
    state.gacha.welcome.arrivalsDone = 20;
    expectRefused(state, welcomeSingle, slice, 'welcomeArrivalsExhausted');
  });

  it('refuses a pick without an offer, or outside the offer', () => {
    const state = stateWithTickets(0);
    expectRefused(
      state,
      { type: 'chooseWelcomeSpecies', speciesId: JAGUAR },
      slice,
      'noWelcomeChoicePending',
    );
    state.gacha.welcome.pendingChoice = { bannerId: WELCOME, options: [JAGUAR] };
    expectRefused(
      state,
      { type: 'chooseWelcomeSpecies', speciesId: CAPYBARA },
      slice,
      'speciesNotOffered',
    );
  });

  it('refuses a pick that the data no longer knows, or that would overflow medals', () => {
    const state = stateWithTickets(0);
    const gone = testSpeciesId('dodo');
    state.gacha.welcome.pendingChoice = { bannerId: WELCOME, options: [gone, JAGUAR] };
    expectRefused(
      state,
      { type: 'chooseWelcomeSpecies', speciesId: gone },
      slice,
      'unknownSpecies',
    );
    state.currencies.careMedals = Number.MAX_SAFE_INTEGER;
    expectRefused(
      state,
      { type: 'chooseWelcomeSpecies', speciesId: JAGUAR },
      slice,
      'currencyOverflow',
    );
  });
});

describe('refuge catalog', () => {
  const adoptOtter: Command = { type: 'adoptFromCatalog', speciesId: OTTER };

  function stateWithOtter(medals: number): GameState {
    const state = stateWithTickets(0);
    state.currencies.careMedals = medals;
    state.gacha.collection.push({ speciesId: OTTER, stars: 2, groupSize: 5 });
    return state;
  }

  it('sells a rare already met for 150 medals, like a duplicate', () => {
    const state = stateWithOtter(200);
    state.gacha.arrivalsSince = { rare: 4, veryRare: 4, iconic: 0 };
    const [arrival] = opened(run(state, adoptOtter));

    expect(state.currencies.careMedals).toBe(50);
    expect(arrival).toMatchObject({
      bannerId: null,
      source: 'catalog',
      stars: 3,
      groupSize: 6,
      medalsEarned: 0,
    });
    expect(state.gacha.arrivalsSince).toEqual({ rare: 4, veryRare: 4, iconic: 0 });
    expect(state.gacha.history.at(-1)).toMatchObject({ source: 'catalog', bannerId: null });
  });

  it('charges 400 for a very rare and 1 000 for an iconic', () => {
    const state = stateWithTickets(0);
    state.currencies.careMedals = 1400;
    state.gacha.collection.push({ speciesId: JAGUAR, stars: 1, groupSize: 2 });
    run(state, { type: 'adoptFromCatalog', speciesId: JAGUAR });
    expect(state.currencies.careMedals).toBe(1000);

    const iconic = testSpeciesId('synthetic-iconic-0');
    state.gacha.collection.push({ speciesId: iconic, stars: 1, groupSize: 4 });
    run(state, { type: 'adoptFromCatalog', speciesId: iconic }, synthetic);
    expect(state.currencies.careMedals).toBe(0);
  });

  it('refuses without enough medals', () => {
    expectRefused(stateWithOtter(149), adoptOtter, slice, 'notEnoughMedals');
  });

  it('refuses a species never met, unknown, or not sold', () => {
    expectRefused(stateWithTickets(0), adoptOtter, slice, 'speciesNotMet');
    expectRefused(
      stateWithOtter(500),
      { type: 'adoptFromCatalog', speciesId: testSpeciesId('dodo') },
      slice,
      'unknownSpecies',
    );
    const state = stateWithOtter(500);
    state.gacha.collection.push({ speciesId: CAPYBARA, stars: 1, groupSize: 4 });
    expectRefused(state, { type: 'adoptFromCatalog', speciesId: CAPYBARA }, slice, 'notInCatalog');
  });

  it('refuses a species whose habitat and group are already complete', () => {
    const state = stateWithTickets(0);
    state.currencies.careMedals = 500;
    state.gacha.collection.push({ speciesId: OTTER, stars: 5, groupSize: 7 });
    expectRefused(state, adoptOtter, slice, 'speciesAlreadyComplete');
  });
});
