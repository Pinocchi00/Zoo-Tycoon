import type { GameState } from '../state';

/** Adds without ever leaving the safe integers: a balance that high just stops growing. */
export function cappedAdd(balance: number, amount: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, balance + amount);
}

/**
 * Credits coins paid by visitors (entry or service) and counts them in the current period, the
 * only money upkeep may be taken from. Returns the new coin balance.
 */
export function earnVisitorCoins(state: GameState, amount: number): number {
  const economy = state.economy;
  state.currencies.coins = cappedAdd(state.currencies.coins, amount);
  economy.periodRevenue = cappedAdd(economy.periodRevenue, amount);
  economy.totals.visitorCoins = cappedAdd(economy.totals.visitorCoins, amount);
  return state.currencies.coins;
}
