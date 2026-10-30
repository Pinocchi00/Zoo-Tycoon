import type { GameData } from '@/data';
import { logger } from '@/shared';
import {
  applyCommand,
  createNewGame,
  type CellPosition,
  type Command,
  type EventQueue,
  type GameState,
  type GridPoint,
} from '@/sim';

/** Fixed, so that the demo park is the same every time. */
export const DEMO_SEED = 20_260_101;
/** Plenty of coins for tickets and paths: the demo is not about the economy. */
const DEMO_COINS = 1_000_000;
/** The demo stops asking for arrivals after this many days of counter tickets. */
const MAX_TICKET_DAYS = 120;
/** Some species are shown with several habitat stars, to see the enrichment used. */
const RICH_STARS = 3;
const RICH_SPECIES_WANTED = 2;
const PATH_SURFACE = 'gravel';

function rectangle(column: number, row: number, width: number, depth: number): GridPoint[] {
  return [
    { x: column, y: row },
    { x: column + width, y: row },
    { x: column + width, y: row + depth },
    { x: column, y: row + depth },
  ];
}

interface DemoEnclosure {
  /** File name of the species' model, which tells species apart without hard-coding ids. */
  readonly modelId: string;
  readonly outline: readonly GridPoint[];
}

/**
 * North of the entrance (columns 124 to 131, rows 253 to 255), where the camera starts. Sizes
 * respect the species' minimum (M: 36 cells, L: 64). The tapir has an L-shaped enclosure.
 */
const LAYOUT: readonly DemoEnclosure[] = [
  { modelId: 'capybara', outline: rectangle(108, 241, 10, 9) },
  { modelId: 'collared_peccary', outline: rectangle(138, 241, 10, 9) },
  { modelId: 'giant_otter', outline: rectangle(108, 230, 9, 9) },
  { modelId: 'jaguar', outline: rectangle(120, 226, 14, 9) },
  {
    modelId: 'lowland_tapir',
    outline: [
      { x: 136, y: 228 },
      { x: 148, y: 228 },
      { x: 148, y: 234 },
      { x: 142, y: 234 },
      { x: 142, y: 239 },
      { x: 136, y: 239 },
    ],
  },
];

/** A path from the entrance between the enclosures, two cells wide. */
const PATH_CELLS: readonly CellPosition[] = Array.from({ length: 17 }, (_, index) => [
  { column: 127, row: 236 + index },
  { column: 128, row: 236 + index },
]).flat();

function run(state: GameState, data: GameData, events: EventQueue, command: Command): boolean {
  const result = applyCommand(state, command, data, events);
  if (!result.ok) {
    logger.warn(`Demo park: ${command.type} refused (${result.error}).`);
  }
  return result.ok;
}

function hasAllSpecies(state: GameState, data: GameData): boolean {
  return [...data.species.keys()].every((id) =>
    state.gacha.collection.some((progress) => progress.speciesId === id),
  );
}

function isRichEnough(state: GameState): boolean {
  const rich = state.gacha.collection.filter((progress) => progress.stars >= RICH_STARS);
  return rich.length >= RICH_SPECIES_WANTED;
}

/** Counter tickets and batches of arrivals, until every species is met and some have stars. */
function receiveSpecies(state: GameState, data: GameData, events: EventQueue): void {
  const banner = [...data.banners.values()].find((candidate) => candidate.kind === 'permanent');
  if (banner === undefined) {
    logger.warn('Demo park: the data has no permanent banner.');
    return;
  }
  const { ticketCost } = data.gachaRules.multiArrival;
  const perDay = data.economyRules.ticketCounter.ticketsPerDay;
  for (let day = 1; day <= MAX_TICKET_DAYS; day += 1) {
    for (let bought = 0; bought < perDay; bought += 1) {
      if (!run(state, data, events, { type: 'buyCounterTicket', day })) {
        return;
      }
    }
    while (state.currencies.arrivalTickets >= ticketCost) {
      if (
        !run(state, data, events, { type: 'performArrival', bannerId: banner.id, mode: 'multi' })
      ) {
        return;
      }
    }
    if (hasAllSpecies(state, data) && isRichEnough(state)) {
      return;
    }
  }
  logger.warn(`Demo park: the species were not all met within ${String(MAX_TICKET_DAYS)} days.`);
}

function build(state: GameState, data: GameData, events: EventQueue): void {
  const surface = [...data.pathSurfaces.keys()].find((id) => id === PATH_SURFACE);
  if (surface === undefined) {
    logger.warn(`Demo park: no path surface ${PATH_SURFACE}.`);
  } else {
    run(state, data, events, { type: 'placePath', cells: PATH_CELLS, surface });
  }
  for (const planned of LAYOUT) {
    const species = [...data.species.values()].find(
      (candidate) => candidate.modelId === planned.modelId,
    );
    if (species === undefined) {
      logger.warn(`Demo park: no species uses the model ${planned.modelId}.`);
      continue;
    }
    const known = new Set(state.enclosures.map((enclosure) => enclosure.id));
    if (!run(state, data, events, { type: 'placeEnclosure', outline: planned.outline })) {
      continue;
    }
    const created = state.enclosures.find((enclosure) => !known.has(enclosure.id));
    if (created === undefined) {
      logger.warn('Demo park: the new enclosure was not found.');
      continue;
    }
    run(state, data, events, {
      type: 'installGroup',
      enclosureId: created.id,
      speciesId: species.id,
    });
  }
}

/**
 * A park made only of normal commands, for looking at the animals while the interface does not
 * exist yet: every species met (some with several habitat stars), one enclosure each, one of
 * them L-shaped. Development only; the player's save is never read nor written.
 */
export function buildAnimalDemo(data: GameData, events: EventQueue): GameState {
  const state = createNewGame(DEMO_SEED, data);
  run(state, data, events, { type: 'addCoins', amount: DEMO_COINS });
  receiveSpecies(state, data, events);
  build(state, data, events);
  return state;
}
