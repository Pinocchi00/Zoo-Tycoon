import type { Rarity } from '../data/schemas/common';
import type { ServiceNeed } from '../data/schemas/visitors';
import type {
  ArchetypeId,
  BannerId,
  BuildingId,
  EnclosureId,
  ItemId,
  SpeciesId,
  VisitorId,
} from '../shared/brand';
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

/** A visitor group came in through the entrance. */
export interface VisitorArrivedEvent {
  readonly type: 'visitorArrived';
  readonly visitorId: VisitorId;
  readonly archetypeId: ArchetypeId;
  readonly groupSize: number;
  /** Paid at the gate by the whole group. */
  readonly entryCoins: number;
  /** Coin balance right after the entry. */
  readonly coinsTotal: number;
}

/**
 * A visitor group left the park. `lost` means its walkway disappeared or no longer reaches the
 * entrance: render lets it fade out instead of walking.
 */
export interface VisitorLeftEvent {
  readonly type: 'visitorLeft';
  readonly visitorId: VisitorId;
  readonly satisfactionBp: number;
  readonly lost: boolean;
}

/** A visitor group started using a service and paid for it (possibly nothing). */
export interface VisitorUsedServiceEvent {
  readonly type: 'visitorUsedService';
  readonly visitorId: VisitorId;
  readonly buildingId: BuildingId;
  readonly coinsSpent: number;
  /** Coin balance right after the purchase. */
  readonly total: number;
}

/** A visitor group needed a service it could not reach: one more voice in the suggestion feed. */
export interface ServiceMissedEvent {
  readonly type: 'serviceMissed';
  readonly visitorId: VisitorId;
  readonly need: ServiceNeed;
}

/** The park's current attractiveness, rounded down, changed. */
export interface ParkStarsChangedEvent {
  readonly type: 'parkStarsChanged';
  readonly stars: number;
}

/** The park reached a new level: its tickets are already added. */
export interface ParkLevelReachedEvent {
  readonly type: 'parkLevelReached';
  readonly level: number;
  readonly rewardTickets: number;
  readonly unlockedBuildings: readonly ItemId[];
  readonly ticketsTotal: number;
}

/** Upkeep taken from the last minute's revenue; never sent when nothing was taken. */
export interface UpkeepPaidEvent {
  readonly type: 'upkeepPaid';
  readonly amount: number;
  /** Coin balance right after. */
  readonly total: number;
}

export interface EntryPriceChangedEvent {
  readonly type: 'entryPriceChanged';
  readonly priceCoins: number;
}

export interface MailClaimedEvent {
  readonly type: 'mailClaimed';
  readonly day: number;
  readonly tickets: number;
  readonly ticketsTotal: number;
}

export interface CounterTicketBoughtEvent {
  readonly type: 'counterTicketBought';
  readonly coinsSpent: number;
  readonly coinsTotal: number;
  readonly ticketsTotal: number;
  /** Tickets the counter still sells today. */
  readonly leftToday: number;
}

/** What happened while the player was away, for the park's journal (GDD "Progression hors ligne"). */
export interface OfflineReportEvent {
  readonly type: 'offlineReport';
  readonly awayMs: number;
  /** At most 12 hours: beyond that, the park rested. */
  readonly simulatedMs: number;
  readonly visitorGroups: number;
  readonly visitorCoins: number;
  readonly upkeepCoins: number;
  readonly levelsGained: number;
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
  | BuildHistoryChangedEvent
  | VisitorArrivedEvent
  | VisitorLeftEvent
  | VisitorUsedServiceEvent
  | ServiceMissedEvent
  | ParkStarsChangedEvent
  | ParkLevelReachedEvent
  | UpkeepPaidEvent
  | EntryPriceChangedEvent
  | MailClaimedEvent
  | CounterTicketBoughtEvent
  | OfflineReportEvent;

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
