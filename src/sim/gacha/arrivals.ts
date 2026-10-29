import type { GameData } from '../../data/load';
import type { Rarity } from '../../data/schemas/common';
import type { Banner } from '../../data/schemas/gacha';
import type { Species } from '../../data/schemas/species';
import type { BannerId, SpeciesId } from '../../shared/brand';
import { err, ok, type Result } from '../../shared/result';
import { emit, type EventQueue } from '../events';
import { shuffle } from '../rng';
import type { GameState } from '../state';
import { findProgress, isComplete, receiveSpecies } from './collection';
import { drawArrival, recordArrivalRarity } from './draw';
import type { ArrivalSource } from './gacha-state';
import { createGachaTables, hasAnySpecies, standInTier, type GachaTables } from './rates';

export type ArrivalMode = 'single' | 'multi';

/** One arrival, or the discounted batch (10 for the price of 9). */
export interface PerformArrivalCommand {
  readonly type: 'performArrival';
  readonly bannerId: BannerId;
  readonly mode: ArrivalMode;
}

/** Picks the welcome banner's guaranteed species among the offered ones. */
export interface ChooseWelcomeSpeciesCommand {
  readonly type: 'chooseWelcomeSpecies';
  readonly speciesId: SpeciesId;
}

/** Buys one more arrival of a species already met, with care medals. */
export interface AdoptFromCatalogCommand {
  readonly type: 'adoptFromCatalog';
  readonly speciesId: SpeciesId;
}

export type ArrivalError =
  | 'unknownBanner'
  | 'notEnoughTickets'
  | 'welcomeArrivalsExhausted'
  | 'noSpeciesAvailable'
  | 'noWelcomeChoicePending'
  | 'speciesNotOffered'
  | 'unknownSpecies'
  | 'speciesNotMet'
  | 'notInCatalog'
  | 'speciesAlreadyComplete'
  | 'notEnoughMedals'
  | 'currencyOverflow';

/** Context shared by the arrivals of one command. */
interface ArrivalContext {
  readonly state: GameState;
  readonly data: GameData;
  readonly tables: GachaTables;
  readonly events: EventQueue;
}

function requireSpecies(data: GameData, id: SpeciesId): Species {
  const species = data.species.get(id);
  if (species === undefined) {
    throw new Error(`Species ${id} comes from the data but is missing from it.`);
  }
  return species;
}

/** Most medals `arrivals` arrivals can bring, to refuse a command before it overflows. */
function fitsMedals(context: ArrivalContext, arrivals: number): boolean {
  const { medalsPerArrival, medalsPerExtraDuplicate } = context.data.gachaRules;
  const most =
    context.state.currencies.careMedals + arrivals * (medalsPerArrival + medalsPerExtraDuplicate);
  return Number.isSafeInteger(most);
}

/** Gives the species to the refuge: stars, group, medals, guarantee counters and history. */
function deliver(
  context: ArrivalContext,
  species: Species,
  bannerId: BannerId | null,
  source: ArrivalSource,
): void {
  const { state, data, tables } = context;
  const gacha = state.gacha;
  const outcome = receiveSpecies(gacha.collection, species);
  const rules = data.gachaRules;
  const medalsEarned =
    (source === 'catalog' ? 0 : rules.medalsPerArrival) +
    (outcome.wasComplete ? rules.medalsPerExtraDuplicate : 0);
  state.currencies.careMedals += medalsEarned;
  if (source !== 'catalog') {
    recordArrivalRarity(tables, gacha.arrivalsSince, species.rarity);
  }
  const number = gacha.history.length + 1;
  gacha.history.push({
    number,
    timeMs: state.clock.timeMs,
    bannerId,
    speciesId: species.id,
    rarity: species.rarity,
    source,
  });
  emit(context.events, {
    type: 'arrivalOpened',
    number,
    bannerId,
    speciesId: species.id,
    rarity: species.rarity,
    source,
    isNew: outcome.isNew,
    stars: outcome.stars,
    groupSize: outcome.groupSize,
    medalsEarned,
  });
}

/** The welcome guarantee: up to `choiceCount` species of the guaranteed tier (or its stand-in). */
function offerWelcomeChoice(
  context: ArrivalContext,
  banner: Extract<Banner, { kind: 'welcome' }>,
): void {
  const { state, tables } = context;
  const tier: Rarity | undefined = standInTier(banner.guaranteedRarity, tables.pools);
  if (tier === undefined) {
    throw new Error('offerWelcomeChoice: no species at all, checked before.');
  }
  const options = shuffle(state.rng, tables.pools[tier]).slice(0, banner.choiceCount);
  state.gacha.welcome.pendingChoice = { bannerId: banner.id, options };
  emit(context.events, { type: 'welcomeChoiceOffered', bannerId: banner.id, options });
}

function drawOne(context: ArrivalContext, banner: Banner): void {
  const { state, data, tables } = context;
  if (banner.kind === 'welcome') {
    state.gacha.welcome.arrivalsDone += 1;
    if (state.gacha.welcome.arrivalsDone === banner.arrivalLimit) {
      offerWelcomeChoice(context, banner);
      return;
    }
  }
  const drawn = drawArrival(tables, state.gacha.arrivalsSince, state.rng);
  deliver(context, requireSpecies(data, drawn.speciesId), banner.id, 'draw');
}

export function performArrival(
  state: GameState,
  command: PerformArrivalCommand,
  data: GameData,
  events: EventQueue,
): Result<void, ArrivalError> {
  const banner = data.banners.get(command.bannerId);
  if (banner === undefined) {
    return err('unknownBanner');
  }
  const rules = data.gachaRules;
  const count = command.mode === 'single' ? 1 : rules.multiArrival.count;
  const cost = command.mode === 'single' ? rules.arrivalTicketCost : rules.multiArrival.ticketCost;
  if (banner.kind === 'welcome' && banner.arrivalLimit - state.gacha.welcome.arrivalsDone < count) {
    return err('welcomeArrivalsExhausted');
  }
  const context = { state, data, tables: createGachaTables(rules, data.species), events };
  if (!hasAnySpecies(context.tables.pools)) {
    return err('noSpeciesAvailable');
  }
  if (state.currencies.arrivalTickets < cost) {
    return err('notEnoughTickets');
  }
  if (!fitsMedals(context, count)) {
    return err('currencyOverflow');
  }
  state.currencies.arrivalTickets -= cost;
  emit(events, { type: 'arrivalsStarted', bannerId: banner.id, count, ticketsSpent: cost });
  for (let arrival = 0; arrival < count; arrival += 1) {
    drawOne(context, banner);
  }
  return ok(undefined);
}

export function chooseWelcomeSpecies(
  state: GameState,
  command: ChooseWelcomeSpeciesCommand,
  data: GameData,
  events: EventQueue,
): Result<void, ArrivalError> {
  const pending = state.gacha.welcome.pendingChoice;
  if (pending === null) {
    return err('noWelcomeChoicePending');
  }
  if (!pending.options.includes(command.speciesId)) {
    return err('speciesNotOffered');
  }
  const species = data.species.get(command.speciesId);
  if (species === undefined) {
    return err('unknownSpecies');
  }
  const context = { state, data, tables: createGachaTables(data.gachaRules, data.species), events };
  if (!fitsMedals(context, 1)) {
    return err('currencyOverflow');
  }
  state.gacha.welcome.pendingChoice = null;
  deliver(context, species, pending.bannerId, 'welcomeChoice');
  return ok(undefined);
}

/** Medal price in the refuge catalog; commons and uncommons are not sold there. */
function catalogCost(data: GameData, rarity: Rarity): number | undefined {
  const costs = data.gachaRules.catalogMedalCost;
  switch (rarity) {
    case 'common':
    case 'uncommon':
      return undefined;
    case 'rare':
      return costs.rare;
    case 'veryRare':
      return costs.veryRare;
    case 'iconic':
      return costs.iconic;
  }
}

export function adoptFromCatalog(
  state: GameState,
  command: AdoptFromCatalogCommand,
  data: GameData,
  events: EventQueue,
): Result<void, ArrivalError> {
  const species = data.species.get(command.speciesId);
  if (species === undefined) {
    return err('unknownSpecies');
  }
  const progress = findProgress(state.gacha.collection, species);
  if (progress === undefined) {
    return err('speciesNotMet');
  }
  const cost = catalogCost(data, species.rarity);
  if (cost === undefined) {
    return err('notInCatalog');
  }
  if (isComplete(progress, species)) {
    // It could only turn into fewer medals than it costs.
    return err('speciesAlreadyComplete');
  }
  if (state.currencies.careMedals < cost) {
    return err('notEnoughMedals');
  }
  state.currencies.careMedals -= cost;
  const context = { state, data, tables: createGachaTables(data.gachaRules, data.species), events };
  deliver(context, species, null, 'catalog');
  return ok(undefined);
}
