import type { GameData } from '../../data/load';
import { BASIS_POINTS_TOTAL } from '../../data/schemas/common';
import type { SimContext } from '../context';
import { emit, type EventQueue } from '../events';
import type { GameState } from '../state';
import { syncPathCache } from '../visitors/path-cache';
import { SETTLEMENT_PERIOD_MS, UPKEEP_UNITS_PER_COIN } from './economy-state';
import { updateParkLevel } from './park-level';
import { cappedAdd } from './revenue';

/** Upkeep of every building in the park, in coins per hour. */
export function upkeepPerHour(state: GameState, data: GameData): number {
  let total = 0;
  for (const building of state.buildings) {
    total += data.buildings.get(building.itemId)?.upkeepCoinsPerHour ?? 0;
  }
  return total;
}

/**
 * Takes the upkeep due out of the period's revenue, never more than its allowed share and never
 * below zero coins: what cannot be paid is forgiven, so the park can never go bankrupt (GDD).
 */
function settleUpkeep(state: GameState, data: GameData, nowMs: number, events: EventQueue): void {
  const economy = state.economy;
  const due = Math.floor(economy.upkeepOwed / UPKEEP_UNITS_PER_COIN);
  const allowed = Math.floor(
    (economy.periodRevenue * data.economyRules.upkeepMaxShareOfRevenueBp) / BASIS_POINTS_TOTAL,
  );
  const paid = Math.min(due, allowed, state.currencies.coins);
  economy.upkeepOwed -= due * UPKEEP_UNITS_PER_COIN;
  economy.periodRevenue = 0;
  economy.settledAtMs = nowMs;
  if (paid > 0) {
    state.currencies.coins -= paid;
    economy.totals.upkeepCoins = cappedAdd(economy.totals.upkeepCoins, paid);
    emit(events, { type: 'upkeepPaid', amount: paid, total: state.currencies.coins });
  }
}

/** The economy's system: park level, then upkeep, settled once per game minute. */
export function economySystem(
  state: GameState,
  stepMs: number,
  context: SimContext,
  events: EventQueue,
): void {
  const { data } = context;
  syncPathCache(context.paths, state, data);
  updateParkLevel(state, data, context.paths, events);
  const economy = state.economy;
  economy.upkeepOwed += upkeepPerHour(state, data) * stepMs;
  const nowMs = state.clock.timeMs + stepMs;
  const period = Math.floor(nowMs / SETTLEMENT_PERIOD_MS);
  if (period > Math.floor(economy.settledAtMs / SETTLEMENT_PERIOD_MS)) {
    settleUpkeep(state, data, nowMs, events);
  }
}
