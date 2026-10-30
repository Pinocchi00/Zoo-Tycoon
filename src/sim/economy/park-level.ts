import type { GameData } from '../../data/load';
import type { ItemId } from '../../shared/brand';
import { emit, type EventQueue } from '../events';
import type { GameState } from '../state';
import { MILLI, totalAttractivenessMilli } from '../visitors/attractiveness';
import type { PathCache } from '../visitors/path-cache';
import { cappedAdd } from './revenue';

/** True when one of the levels reached so far unlocks this building. */
export function isBuildingUnlocked(state: GameState, data: GameData, id: ItemId): boolean {
  const reached = data.economyRules.parkLevels.slice(0, state.economy.parkLevel);
  return reached.some((level) => level.unlocksBuildings.includes(id));
}

/**
 * Park stars follow the park's current attractiveness. Every level whose threshold they reach is
 * granted once, with its tickets; a level is never taken back.
 */
export function updateParkLevel(
  state: GameState,
  data: GameData,
  cache: PathCache,
  events: EventQueue,
): void {
  const economy = state.economy;
  const stars = Math.floor(totalAttractivenessMilli(state, data, cache) / MILLI);
  if (stars !== economy.parkStars) {
    economy.parkStars = stars;
    emit(events, { type: 'parkStarsChanged', stars });
  }
  const levels = data.economyRules.parkLevels;
  let next = levels[economy.parkLevel];
  while (next !== undefined && stars >= next.stars) {
    economy.parkLevel += 1;
    const tickets = cappedAdd(state.currencies.arrivalTickets, next.rewardTickets);
    state.currencies.arrivalTickets = tickets;
    emit(events, {
      type: 'parkLevelReached',
      level: economy.parkLevel,
      rewardTickets: next.rewardTickets,
      unlockedBuildings: next.unlocksBuildings,
      ticketsTotal: tickets,
    });
    next = levels[economy.parkLevel];
  }
}
