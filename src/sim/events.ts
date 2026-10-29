import type { Rarity } from '../data/schemas/common';
import type { BannerId, SpeciesId } from '../shared/brand';
import type { ArrivalSource } from './gacha/gacha-state';

export interface CoinsAddedEvent {
  readonly type: 'coinsAdded';
  readonly amount: number;
  /** Coin balance right after the addition. */
  readonly total: number;
}

/**
 * The main save was damaged and an older copy was loaded instead.
 * Emitted by app after loading, so that ui can tell the player gently.
 */
export interface SaveRecoveredEvent {
  readonly type: 'saveRecovered';
  /** Newer copies that could not be read and were skipped. */
  readonly skippedCopies: number;
}

/** Tickets were spent on a banner; one `arrivalOpened` per arrival follows, for the crate scene. */
export interface ArrivalsStartedEvent {
  readonly type: 'arrivalsStarted';
  readonly bannerId: BannerId;
  readonly count: number;
  readonly ticketsSpent: number;
}

/** A species reached the refuge, from a draw, the welcome choice or the catalog. */
export interface ArrivalOpenedEvent {
  readonly type: 'arrivalOpened';
  /** Its number in the arrival history. */
  readonly number: number;
  readonly bannerId: BannerId | null;
  readonly speciesId: SpeciesId;
  readonly rarity: Rarity;
  readonly source: ArrivalSource;
  /** First encounter: the notebook page gets written. */
  readonly isNew: boolean;
  /** Habitat stars and group size after this arrival. */
  readonly stars: number;
  readonly groupSize: number;
  readonly medalsEarned: number;
}

/** The welcome banner's guaranteed arrival waits for the player to pick one of these species. */
export interface WelcomeChoiceOfferedEvent {
  readonly type: 'welcomeChoiceOffered';
  readonly bannerId: BannerId;
  readonly options: readonly SpeciesId[];
}

/** What happened in the simulation; render, audio and ui react to these instead of diffing the state. */
export type GameEvent =
  | CoinsAddedEvent
  | SaveRecoveredEvent
  | ArrivalsStartedEvent
  | ArrivalOpenedEvent
  | WelcomeChoiceOfferedEvent;

/** Events waiting for the reader. Kept outside GameState so that they never end up in a save. */
export interface EventQueue {
  pending: GameEvent[];
}

const NO_EVENTS: readonly GameEvent[] = [];

export function createEventQueue(): EventQueue {
  return { pending: [] };
}

export function emit(queue: EventQueue, event: GameEvent): void {
  queue.pending.push(event);
}

/** Hands every pending event to the reader and empties the queue; called once per frame. */
export function drain(queue: EventQueue): readonly GameEvent[] {
  if (queue.pending.length === 0) {
    // Most frames have no event: answer without allocating.
    return NO_EVENTS;
  }
  const events = queue.pending;
  queue.pending = [];
  return events;
}
