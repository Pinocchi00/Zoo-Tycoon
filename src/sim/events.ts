import type { Rarity } from '../data/schemas/common';
import type { BannerId, BuildingId, EnclosureId, ItemId, SpeciesId } from '../shared/brand';
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

/**
 * Tickets were spent on a banner. Each of the `count` arrivals then emits `arrivalOpened`, except
 * the welcome banner's guaranteed one, which emits `welcomeChoiceOffered` and opens on the pick.
 */
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

/**
 * Why a construction event happened: a new command, or the undo history. app vibrates only on
 * `command`, so undoing never buzzes.
 */
export type BuildCause = 'command' | 'undo' | 'redo';

/** Path cells were paved, resurfaced or taken up (`surface` null). */
export interface PathTilesChangedEvent {
  readonly type: 'pathTilesChanged';
  readonly cause: BuildCause;
  readonly tiles: readonly {
    readonly column: number;
    readonly row: number;
    readonly surface: ItemId | null;
  }[];
}

/** An enclosure appeared: built, or brought back by undo or redo with its group. */
export interface EnclosurePlacedEvent {
  readonly type: 'enclosurePlaced';
  readonly cause: BuildCause;
  readonly enclosureId: EnclosureId;
  readonly speciesId: SpeciesId | null;
}

/** Its outline moved or turned; the group inside followed. */
export interface EnclosureMovedEvent {
  readonly type: 'enclosureMoved';
  readonly cause: BuildCause;
  readonly enclosureId: EnclosureId;
}

/** The group living in an existing enclosure changed (`speciesId` null: it is empty now). */
export interface EnclosureGroupChangedEvent {
  readonly type: 'enclosureGroupChanged';
  readonly enclosureId: EnclosureId;
  readonly speciesId: SpeciesId | null;
}

export interface EnclosureRemovedEvent {
  readonly type: 'enclosureRemoved';
  readonly enclosureId: EnclosureId;
  /** The group that went back to the refuge, if any. */
  readonly returnedSpeciesId: SpeciesId | null;
}

export interface BuildingPlacedEvent {
  readonly type: 'buildingPlaced';
  readonly cause: BuildCause;
  readonly buildingId: BuildingId;
  readonly itemId: ItemId;
}

export interface BuildingMovedEvent {
  readonly type: 'buildingMoved';
  readonly cause: BuildCause;
  readonly buildingId: BuildingId;
}

export interface BuildingRemovedEvent {
  readonly type: 'buildingRemoved';
  readonly buildingId: BuildingId;
}

/** Coins paid (negative delta) or given back (positive) by construction, undo or redo. */
export interface BuildCoinsChangedEvent {
  readonly type: 'buildCoinsChanged';
  readonly delta: number;
  readonly total: number;
}

export interface ViewScoreChangedEvent {
  readonly type: 'viewScoreChanged';
  readonly enclosureId: EnclosureId;
  readonly viewScore: number;
}

/** Sizes of the undo and redo stacks, for the buttons of the build screen. */
export interface BuildHistoryChangedEvent {
  readonly type: 'buildHistoryChanged';
  readonly undoCount: number;
  readonly redoCount: number;
}

/** What happened in the simulation; render, audio and ui react to these instead of diffing the state. */
export type GameEvent =
  | CoinsAddedEvent
  | SaveRecoveredEvent
  | ArrivalsStartedEvent
  | ArrivalOpenedEvent
  | WelcomeChoiceOfferedEvent
  | PathTilesChangedEvent
  | EnclosurePlacedEvent
  | EnclosureMovedEvent
  | EnclosureGroupChangedEvent
  | EnclosureRemovedEvent
  | BuildingPlacedEvent
  | BuildingMovedEvent
  | BuildingRemovedEvent
  | BuildCoinsChangedEvent
  | ViewScoreChangedEvent
  | BuildHistoryChangedEvent;

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
