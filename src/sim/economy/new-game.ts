import type { GameData } from '../../data/load';
import { createGameState, type GameState } from '../state';

/** A brand-new park, with its opening gift and the default entry price. */
export function createNewGame(seed: number, data: GameData): GameState {
  const state = createGameState(seed);
  const { startingGift, entryPrice } = data.economyRules;
  state.currencies.coins = startingGift.coins;
  state.currencies.arrivalTickets = startingGift.arrivalTickets;
  state.economy.entryPriceCoins = entryPrice.defaultCoins;
  return state;
}
