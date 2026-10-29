import type { AnimalId, EnclosureId, SpeciesId } from '../shared/brand';
import { createRng, type RngState } from './rng';

/** Bumped whenever the shape of GameState changes; the save layer migrates older versions. */
export const STATE_VERSION = 1;

export interface GameClock {
  /** Game time elapsed since the park opened, in whole milliseconds. */
  timeMs: number;
  /** Time received but not simulated yet: always below one fixed step. */
  accumulatorMs: number;
}

/** Every amount is a whole number (AGENTS.md 4.5). */
export interface Currencies {
  coins: number;
  arrivalTickets: number;
  careMedals: number;
  decorTickets: number;
  shavings: number;
}

export type CurrencyKind = keyof Currencies;

/** Placeholder: enclosures get their real fields with the first zoo rules. */
export interface EnclosureState {
  readonly id: EnclosureId;
}

/** Placeholder: animals get their real fields with the first zoo rules. */
export interface AnimalState {
  readonly id: AnimalId;
  readonly speciesId: SpeciesId;
}

/**
 * The whole game, as plain JSON-ready data: no functions, classes or shared references.
 * Simulation functions mutate it in place to avoid allocating every frame.
 */
export interface GameState {
  version: typeof STATE_VERSION;
  clock: GameClock;
  rng: RngState;
  currencies: Currencies;
  enclosures: EnclosureState[];
  animals: AnimalState[];
}

export function createGameState(seed: number): GameState {
  return {
    version: STATE_VERSION,
    clock: { timeMs: 0, accumulatorMs: 0 },
    rng: createRng(seed),
    currencies: { coins: 0, arrivalTickets: 0, careMedals: 0, decorTickets: 0, shavings: 0 },
    enclosures: [],
    animals: [],
  };
}
