// Plays a profile of the GDD on the pure simulation, with a simple scripted player, and measures
// the pace of the economy. Used by `npm run sim` and by the test that guards the slice's target.
import type { GameData } from '../../src/data/load';
import type { Banner } from '../../src/data/schemas/gacha';
import type { ItemId, SpeciesId } from '../../src/shared/brand';
import {
  advance,
  applyCommand,
  catchUp,
  createEventQueue,
  createNewGame,
  createSimContext,
  drain,
  isBuildingUnlocked,
  type Command,
  type EventQueue,
  type GameEvent,
  type GameState,
  type SimContext,
} from '../../src/sim';
import { makeEnclosureId, type CellPosition, type GridPoint } from '../../src/sim/park/park-state';
import { ACTION_SECONDS, PROFILES, type Profile, type ProfileId } from './profiles';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** The GDD's first session: 15 minutes, at the end of which the slice's 5 species are owned. */
export const FIRST_SESSION_MS = 15 * MINUTE_MS;
/** Rows left free between two objects along the main path. */
const GAP_ROWS = 1;
/** An enclosure is a square one cell wider than the species' minimum area needs. */
const ENCLOSURE_MARGIN_CELLS = 1;

/** One day of a profile. */
export interface DayReport {
  readonly day: number;
  readonly playMs: number;
  readonly ticketsEarned: number;
  readonly visitorCoins: number;
  readonly upkeepCoins: number;
  readonly coinsAtEnd: number;
  readonly ticketsAtEnd: number;
  readonly speciesOwned: number;
  readonly parkLevel: number;
  readonly parkStars: number;
  /** A new species, park level or habitat star. */
  readonly novelty: boolean;
}

export interface ProfileReport {
  readonly profile: ProfileId;
  readonly seed: number;
  /** Cumulated play time at which each species was first met, in order. */
  readonly speciesMet: readonly { readonly speciesId: SpeciesId; readonly playMs: number }[];
  /** Play time when every species of the data was met; null if never. */
  readonly allSpeciesPlayMs: number | null;
  /**
   * Play time when the welcome banner's last arrival (its guaranteed very rare) was opened: the
   * pace of the economy, whatever the luck of the draws. Null if never.
   */
  readonly welcomeDonePlayMs: number | null;
  /** Park level and species after `FIRST_SESSION_MS` of play; null if never played that long. */
  readonly atFirstSession: { readonly level: number; readonly species: number } | null;
  readonly days: readonly DayReport[];
  readonly longestDaysWithoutNovelty: number;
  /** Why the profile got stuck, or null. */
  readonly blocked: string | null;
}

interface Layout {
  readonly pathColumn: number;
  readonly firstRow: number;
  /** Northmost row of the main path built so far. */
  pathNorthRow: number;
  /** Next free row going north, west side (enclosures) and east side (services). */
  westRow: number;
  eastRow: number;
  readonly housed: Set<SpeciesId>;
  readonly built: Set<ItemId>;
}

interface Player {
  readonly state: GameState;
  readonly data: GameData;
  readonly context: SimContext;
  readonly events: EventQueue;
  readonly layout: Layout;
  readonly welcome: Banner | undefined;
  readonly refuge: Banner;
  readonly surface: ItemId;
  day: number;
  wallMs: number;
  playMs: number;
  ticketsEarnedToday: number;
  noveltyToday: boolean;
  lastMailDay: number | null;
  welcomeDonePlayMs: number | null;
  readonly speciesMet: { speciesId: SpeciesId; playMs: number }[];
}

function requireValue<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`The economy simulator needs ${what}.`);
  }
  return value;
}

function createPlayer(seed: number, data: GameData): Player {
  const { entrance } = data.terrain;
  const pathColumn = entrance.column + Math.floor(entrance.width / 2) - 1;
  const firstRow = entrance.row - 1;
  const banners = [...data.banners.values()];
  const cheapest = [...data.pathSurfaces.values()].reduce((best, surface) =>
    surface.coinCostPerCell < best.coinCostPerCell ? surface : best,
  );
  return {
    state: createNewGame(seed, data),
    data,
    context: createSimContext(data),
    events: createEventQueue(),
    layout: {
      pathColumn,
      firstRow,
      pathNorthRow: entrance.row,
      westRow: firstRow,
      eastRow: firstRow,
      housed: new Set(),
      built: new Set(),
    },
    welcome: banners.find((banner) => banner.kind === 'welcome'),
    refuge: requireValue(
      banners.find((banner) => banner.kind === 'permanent'),
      'a permanent banner',
    ),
    surface: cheapest.id,
    day: 0,
    wallMs: 0,
    playMs: 0,
    ticketsEarnedToday: 0,
    noveltyToday: false,
    lastMailDay: null,
    welcomeDonePlayMs: null,
    speciesMet: [],
  };
}

function record(player: Player, event: GameEvent): void {
  if (event.type === 'arrivalOpened') {
    if (event.isNew) {
      player.speciesMet.push({ speciesId: event.speciesId, playMs: player.playMs });
    }
    // A new species or a new habitat star.
    player.noveltyToday ||= event.isNew || event.stars > 1;
  } else if (event.type === 'welcomeChoiceOffered') {
    player.welcomeDonePlayMs ??= player.playMs;
  } else if (event.type === 'parkLevelReached') {
    player.ticketsEarnedToday += event.rewardTickets;
    player.noveltyToday = true;
  } else if (event.type === 'mailClaimed') {
    player.ticketsEarnedToday += event.tickets;
  } else if (event.type === 'counterTicketBought') {
    player.ticketsEarnedToday += 1;
  }
}

function collect(player: Player): void {
  for (const event of drain(player.events)) {
    record(player, event);
  }
}

function play(player: Player, durationMs: number): void {
  advance(player.state, durationMs, player.context, player.events);
  player.playMs += durationMs;
  player.wallMs += durationMs;
  collect(player);
}

function tryCommand(player: Player, command: Command): boolean {
  // Events are read after the action's duration, so that a species counts once the arrival is seen.
  return applyCommand(player.state, command, player.data, player.events).ok;
}

function rectangle(x: number, y: number, width: number, depth: number): GridPoint[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

/** Extends the main path north up to `row`. Returns false when the coins are short. */
function extendPath(player: Player, row: number): boolean {
  const { layout } = player;
  if (row >= layout.pathNorthRow) {
    return true;
  }
  const cells: CellPosition[] = [];
  for (let current = row; current < layout.pathNorthRow; current += 1) {
    cells.push({ column: layout.pathColumn, row: current });
  }
  if (!tryCommand(player, { type: 'placePath', cells, surface: player.surface })) {
    return false;
  }
  layout.pathNorthRow = row;
  return true;
}

function enclosureSide(player: Player, speciesId: SpeciesId): number {
  const species = requireValue(player.data.species.get(speciesId), `species ${speciesId}`);
  const area = player.data.enclosureSizes[species.minEnclosureSize].minAreaCells;
  return Math.ceil(Math.sqrt(area)) + ENCLOSURE_MARGIN_CELLS;
}

/** Draws an enclosure on the west side of the main path and moves the group in. */
function houseSpecies(player: Player, speciesId: SpeciesId): number {
  const { layout } = player;
  const side = enclosureSide(player, speciesId);
  const top = layout.westRow - side + 1;
  if (!extendPath(player, top)) {
    return ACTION_SECONDS.idle;
  }
  const outline = rectangle(layout.pathColumn - side, top, side, side);
  const enclosureId = makeEnclosureId(player.state.nextIds.enclosure);
  if (!tryCommand(player, { type: 'placeEnclosure', outline })) {
    throw new Error(`The simulated player could not place the enclosure of ${speciesId}.`);
  }
  if (!tryCommand(player, { type: 'installGroup', enclosureId, speciesId })) {
    throw new Error(`The simulated player could not install ${speciesId}.`);
  }
  layout.westRow = top - 1 - GAP_ROWS;
  layout.housed.add(speciesId);
  return ACTION_SECONDS.placePath + ACTION_SECONDS.placeEnclosure + ACTION_SECONDS.installGroup;
}

/** Places one building of each unlocked kind on the east side, once the coins allow it. */
function buildService(player: Player): number | null {
  const { state, data, layout } = player;
  for (const kind of data.buildings.values()) {
    if (
      layout.built.has(kind.id) ||
      !isBuildingUnlocked(state, data, kind.id) ||
      state.currencies.coins < kind.coinCost
    ) {
      continue;
    }
    const top = layout.eastRow - kind.footprint.depth + 1;
    if (!extendPath(player, top)) {
      return null;
    }
    const command: Command = {
      type: 'placeBuilding',
      itemId: kind.id,
      column: layout.pathColumn + 1,
      row: top,
      quarterTurns: 0,
    };
    if (!tryCommand(player, command)) {
      return null;
    }
    layout.eastRow = top - 1 - GAP_ROWS;
    layout.built.add(kind.id);
    return ACTION_SECONDS.placeBuilding;
  }
  return null;
}

/**
 * Opens arrivals: on the welcome banner, batches of 10 while at least 10 remain (saving tickets
 * for them), then single ones; afterwards on the permanent banner.
 */
function openArrivals(player: Player): number | null {
  const { state, data, welcome, refuge } = player;
  const rules = data.gachaRules;
  const tickets = state.currencies.arrivalTickets;
  const batch = rules.multiArrival;
  const welcomeLeft =
    welcome?.kind === 'welcome' ? welcome.arrivalLimit - state.gacha.welcome.arrivalsDone : 0;
  const banner = welcome !== undefined && welcomeLeft > 0 ? welcome : refuge;
  const canBatch =
    tickets >= batch.ticketCost && (banner !== welcome || welcomeLeft >= batch.count);
  if (canBatch) {
    tryCommand(player, { type: 'performArrival', bannerId: banner.id, mode: 'multi' });
    return ACTION_SECONDS.multiArrival;
  }
  const savingForBatch = banner === welcome && welcomeLeft >= batch.count;
  if (!savingForBatch && tickets >= rules.arrivalTicketCost) {
    tryCommand(player, { type: 'performArrival', bannerId: banner.id, mode: 'single' });
    return ACTION_SECONDS.singleArrival;
  }
  return null;
}

/** The next thing the player does, and how many seconds it takes. */
function nextAction(player: Player): number {
  const { state, data } = player;
  if (player.lastMailDay !== player.day) {
    player.lastMailDay = player.day;
    tryCommand(player, { type: 'claimMail', day: player.day });
    return ACTION_SECONDS.claimMail;
  }
  const choice = state.gacha.welcome.pendingChoice;
  if (choice !== null) {
    const met = new Set(state.gacha.collection.map((entry) => entry.speciesId));
    const pick = choice.options.find((id) => !met.has(id)) ?? choice.options[0];
    tryCommand(player, { type: 'chooseWelcomeSpecies', speciesId: requireValue(pick, 'a choice') });
    return ACTION_SECONDS.welcomeChoice;
  }
  const homeless = state.gacha.collection.find(
    (entry) => !player.layout.housed.has(entry.speciesId),
  );
  if (homeless !== undefined) {
    return houseSpecies(player, homeless.speciesId);
  }
  const arrival = openArrivals(player);
  if (arrival !== null) {
    return arrival;
  }
  const service = buildService(player);
  if (service !== null) {
    return service;
  }
  const counter = data.economyRules.ticketCounter;
  if (state.currencies.coins >= counter.coinsPerTicket) {
    if (tryCommand(player, { type: 'buyCounterTicket', day: player.day })) {
      return ACTION_SECONDS.buyCounterTicket;
    }
  }
  return ACTION_SECONDS.idle;
}

function playSession(player: Player, minutes: number, onFirstSession: () => void): void {
  const endMs = player.playMs + minutes * MINUTE_MS;
  while (player.playMs < endMs) {
    const seconds = nextAction(player);
    const before = player.playMs;
    play(player, Math.min(seconds * SECOND_MS, endMs - player.playMs));
    if (before < FIRST_SESSION_MS && player.playMs >= FIRST_SESSION_MS) {
      onFirstSession();
    }
  }
}

function waitUntil(player: Player, wallMs: number): void {
  const awayMs = wallMs - player.wallMs;
  if (awayMs > 0) {
    catchUp(player.state, awayMs, player.context, player.events);
    player.wallMs = wallMs;
    collect(player);
  }
}

/** Plays `days` real days of a profile from a new park. */
export function runProfile(
  profile: Profile,
  days: number,
  seed: number,
  data: GameData,
): ProfileReport {
  const player = createPlayer(seed, data);
  let atFirstSession: ProfileReport['atFirstSession'] = null;
  const onFirstSession = (): void => {
    atFirstSession = {
      level: player.state.economy.parkLevel,
      species: player.state.gacha.collection.length,
    };
  };
  const reports: DayReport[] = [];
  for (let day = 0; day < days; day += 1) {
    player.day = day;
    const start = { playMs: player.playMs, totals: { ...player.state.economy.totals } };
    profile.sessions.forEach((session, index) => {
      const startMs = day * DAY_MS + session.startHour * HOUR_MS;
      const isFirst = day === 0 && index === 0;
      if (isFirst) {
        player.wallMs = startMs;
      }
      waitUntil(player, startMs);
      const minutes = isFirst ? (profile.firstSessionMinutes ?? session.minutes) : session.minutes;
      playSession(player, minutes, onFirstSession);
    });
    const { state } = player;
    reports.push({
      day,
      playMs: player.playMs - start.playMs,
      ticketsEarned: player.ticketsEarnedToday,
      visitorCoins: state.economy.totals.visitorCoins - start.totals.visitorCoins,
      upkeepCoins: state.economy.totals.upkeepCoins - start.totals.upkeepCoins,
      coinsAtEnd: state.currencies.coins,
      ticketsAtEnd: state.currencies.arrivalTickets,
      speciesOwned: state.gacha.collection.length,
      parkLevel: state.economy.parkLevel,
      parkStars: state.economy.parkStars,
      novelty: player.noveltyToday,
    });
    player.ticketsEarnedToday = 0;
    player.noveltyToday = false;
  }
  return summarize(profile, seed, data, player, atFirstSession, reports);
}

function longestRunWithoutNovelty(days: readonly DayReport[]): number {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    current = day.novelty ? 0 : current + 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function summarize(
  profile: Profile,
  seed: number,
  data: GameData,
  player: Player,
  atFirstSession: ProfileReport['atFirstSession'],
  days: readonly DayReport[],
): ProfileReport {
  const allSpecies = player.speciesMet.length >= data.species.size;
  const dryDay = days.find((day) => day.ticketsEarned === 0);
  let blocked: string | null = null;
  if (!allSpecies) {
    blocked = `only ${String(player.speciesMet.length)} of ${String(data.species.size)} species`;
  } else if (dryDay !== undefined) {
    blocked = `no ticket earned on day ${String(dryDay.day + 1)}`;
  }
  return {
    profile: profile.id,
    seed,
    speciesMet: player.speciesMet,
    allSpeciesPlayMs: allSpecies ? (player.speciesMet.at(-1)?.playMs ?? null) : null,
    welcomeDonePlayMs: player.welcomeDonePlayMs,
    atFirstSession,
    days,
    longestDaysWithoutNovelty: longestRunWithoutNovelty(days),
    blocked,
  };
}

export function runAllProfiles(
  days: number,
  seed: number,
  data: GameData,
): readonly ProfileReport[] {
  return Object.values(PROFILES).map((profile) => runProfile(profile, days, seed, data));
}
