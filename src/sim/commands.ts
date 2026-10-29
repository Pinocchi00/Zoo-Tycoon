import type { GameData } from '../data/load';
import { err, ok, type Result } from '../shared/result';
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
import type { GameState } from './state';

/** Development-only cheat that proves the command pipeline; app never exposes it in production. */
export interface AddCoinsCommand {
  readonly type: 'addCoins';
  readonly amount: number;
}

/** Everything the player can ask for. The simulation validates, then applies. */
export type Command =
  AddCoinsCommand | PerformArrivalCommand | ChooseWelcomeSpeciesCommand | AdoptFromCatalogCommand;

export type CommandError = 'invalidAmount' | 'currencyOverflow' | ArrivalError;

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
      return performArrival(state, command, data, events);
    case 'chooseWelcomeSpecies':
      return chooseWelcomeSpecies(state, command, data, events);
    case 'adoptFromCatalog':
      return adoptFromCatalog(state, command, data, events);
  }
}
