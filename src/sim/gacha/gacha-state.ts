import type { Rarity } from '../../data/schemas/common';
import type { BannerId, SpeciesId } from '../../shared/brand';
import type { ArrivalsSince } from './rates';

/** How an arrival reached the park. */
export const ARRIVAL_SOURCES = ['draw', 'welcomeChoice', 'catalog'] as const;
export type ArrivalSource = (typeof ARRIVAL_SOURCES)[number];

/** A species met at least once: its habitat stars (1 to 5) and the size of its group. */
export interface SpeciesProgress {
  readonly speciesId: SpeciesId;
  stars: number;
  groupSize: number;
}

/** One line of the arrival history, which the player can always read back. */
export interface ArrivalRecord {
  /** 1 for the first entry of the history. */
  readonly number: number;
  readonly timeMs: number;
  /** null for a species chosen from the refuge catalog. */
  readonly bannerId: BannerId | null;
  readonly speciesId: SpeciesId;
  readonly rarity: Rarity;
  readonly source: ArrivalSource;
}

/** The species offered by the welcome banner's guarantee, waiting for the player's pick. */
export interface WelcomeChoice {
  readonly bannerId: BannerId;
  readonly options: readonly SpeciesId[];
}

export interface WelcomeProgress {
  arrivalsDone: number;
  pendingChoice: WelcomeChoice | null;
}

export interface GachaState {
  arrivalsSince: ArrivalsSince;
  welcome: WelcomeProgress;
  /** In order of first encounter. */
  collection: SpeciesProgress[];
  history: ArrivalRecord[];
}

export function createGachaState(): GachaState {
  return {
    arrivalsSince: { rare: 0, veryRare: 0, iconic: 0 },
    welcome: { arrivalsDone: 0, pendingChoice: null },
    collection: [],
    history: [],
  };
}
