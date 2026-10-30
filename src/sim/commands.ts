import type { GameData } from '../data/load';
import { err, ok, type Result } from '../shared/result';
import {
  applyEconomyCommand,
  type EconomyCommand,
  type EconomyError,
} from './economy/economy-commands';
import { emit, type EventQueue } from './events';
import {
  adoptFromCatalog,
  chooseWelcomeSpecies,
  performArrival,
  type AdoptFromCatalogCommand,
  type ArrivalError,
  type ChooseWelcomeSpeciesCommand,
  type PerformArrivalCommand,
} from './gacha/arrivals';
import { applyBuildCommand, type BuildCommand } from './park/build-commands';
import type { BuildError } from './park/build-errors';
import { refreshViewScores } from './park/view-score';
import type { GameState } from './state';

/** Development-only cheat that proves the command pipeline; app never exposes it in production. */
export interface AddCoinsCommand {
  readonly type: 'addCoins';
  readonly amount: number;
}

/** Everything the player can ask for. The simulation validates, then applies. */
export type Command =
  | AddCoinsCommand
  | PerformArrivalCommand
  | ChooseWelcomeSpeciesCommand
  | AdoptFromCatalogCommand
  | BuildCommand
  | EconomyCommand;

export type CommandError =
  'invalidAmount' | 'currencyOverflow' | ArrivalError | BuildError | EconomyError;

/** New stars can unlock a viewpoint element, which raises the enclosure's view score. */
function withViewScores(
  result: Result<void, ArrivalError>,
  state: GameState,
  data: GameData,
  events: EventQueue,
): Result<void, ArrivalError> {
  if (result.ok) {
    refreshViewScores(state, data, events);
  }
  return result;
}

function addCoins(
  state: GameState,
  command: AddCoinsCommand,
  events: EventQueue,
): Result<void, CommandError> {
  if (!Number.isSafeInteger(command.amount) || command.amount <= 0) {
    return err('invalidAmount');
  }
  const total = state.currencies.coins + command.amount;
  if (!Number.isSafeInteger(total)) {
    return err('currencyOverflow');
  }
  state.currencies.coins = total;
  emit(events, { type: 'coinsAdded', amount: command.amount, total });
  return ok(undefined);
}

/** Applies a command if it is valid; an invalid command leaves the state untouched. */
export function applyCommand(
  state: GameState,
  command: Command,
  data: GameData,
  events: EventQueue,
): Result<void, CommandError> {
  switch (command.type) {
    case 'addCoins':
      return addCoins(state, command, events);
    case 'performArrival':
      return withViewScores(performArrival(state, command, data, events), state, data, events);
    case 'chooseWelcomeSpecies':
      return withViewScores(
        chooseWelcomeSpecies(state, command, data, events),
        state,
        data,
        events,
      );
    case 'adoptFromCatalog':
      return withViewScores(adoptFromCatalog(state, command, data, events), state, data, events);
    case 'placePath':
    case 'removePath':
    case 'placeEnclosure':
    case 'moveEnclosure':
    case 'removeEnclosure':
    case 'installGroup':
    case 'placeBuilding':
    case 'moveBuilding':
    case 'removeBuilding':
    case 'undoBuild':
    case 'redoBuild':
      return applyBuildCommand(state, command, data, events);
    case 'setEntryPrice':
    case 'claimMail':
    case 'buyCounterTicket':
      return applyEconomyCommand(state, command, data, events);
  }
}
