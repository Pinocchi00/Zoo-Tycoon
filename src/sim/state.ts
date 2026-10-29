import type { AnimalId, SpeciesId } from '../shared/brand';
import { createGachaState, type GachaState } from './gacha/gacha-state';
import { createBuildHistory, type BuildHistory } from './park/park-change';
import {
  createNextIds,
  type BuildingState,
  type EnclosureState,
  type NextIds,
  type PathTile,
} from './park/park-state';
import { createRng, type RngState } from './rng';

/** Bumped whenever the shape of GameState changes; the save layer migrates older versions. */
export const STATE_VERSION = 3;

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
  /** Sorted by id. */
  enclosures: EnclosureState[];
  animals: AnimalState[];
  /** Arrivals: guarantee counters, welcome banner, species met and the full history. */
  gacha: GachaState;
  /** Paved cells, row by row then west to east. */
  paths: PathTile[];
  /** Sorted by id. */
  buildings: BuildingState[];
  nextIds: NextIds;
  /** Lives only while the game runs: never saved, empty again after loading. */
  session: SessionState;
}

export interface SessionState {
  buildHistory: BuildHistory;
}

/** What a save holds: the whole game except the session. */
export type SavedGameState = Omit<GameState, 'session'>;

export function createSessionState(): SessionState {
  return { buildHistory: createBuildHistory() };
}

/** The part of the state written to a save; the session is left out. */
export function toSavedState(state: GameState): SavedGameState {
  return {
    version: state.version,
    clock: state.clock,
    rng: state.rng,
    currencies: state.currencies,
    enclosures: state.enclosures,
    animals: state.animals,
    gacha: state.gacha,
    paths: state.paths,
    buildings: state.buildings,
    nextIds: state.nextIds,
  };
}

/** A loaded game starts a fresh session. */
export function fromSavedState(saved: SavedGameState): GameState {
  return { ...saved, session: createSessionState() };
}

export function createGameState(seed: number): GameState {
  return {
    version: STATE_VERSION,
    clock: { timeMs: 0, accumulatorMs: 0 },
    rng: createRng(seed),
    currencies: { coins: 0, arrivalTickets: 0, careMedals: 0, decorTickets: 0, shavings: 0 },
    enclosures: [],
    animals: [],
    gacha: createGachaState(),
    paths: [],
    buildings: [],
    nextIds: createNextIds(),
    session: createSessionState(),
  };
}
