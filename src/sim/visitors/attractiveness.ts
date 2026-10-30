import type { GameData } from '../../data/load';
import { BASIS_POINTS_TOTAL } from '../../data/schemas/common';
import { priceAttendanceBp, satisfactionAttendanceBp } from '../economy/attendance';
import type { EnclosureState } from '../park/park-state';
import type { GameState } from '../state';
import { isEnclosureReachable, type PathCache } from './path-cache';

/** Attractiveness and visitor rates are kept in thousandths, so that the square root stays exact enough. */
export const MILLI = 1000;

/**
 * A_enclosure = A_species × (1 + perStar × stars) × (1 + perViewPoint × view), in thousandths
 * (GDD "Formules de base"; no district bonus in the slice). 0 for an empty enclosure.
 */
export function enclosureAttractivenessMilli(
  enclosure: EnclosureState,
  state: GameState,
  data: GameData,
): number {
  if (enclosure.speciesId === null) {
    return 0;
  }
  const species = data.species.get(enclosure.speciesId);
  if (species === undefined) {
    return 0;
  }
  const speciesId = enclosure.speciesId;
  const stars = state.gacha.collection.find((entry) => entry.speciesId === speciesId)?.stars ?? 0;
  const { perStarBp, perViewPointBp } = data.visitorRules.attractiveness;
  return Math.floor(
    (species.baseAttractiveness *
      MILLI *
      (BASIS_POINTS_TOTAL + perStarBp * stars) *
      (BASIS_POINTS_TOTAL + perViewPointBp * enclosure.viewScore)) /
      (BASIS_POINTS_TOTAL * BASIS_POINTS_TOTAL),
  );
}

/** Sum over the inhabited enclosures that visitors can walk to from the entrance. */
export function totalAttractivenessMilli(
  state: GameState,
  data: GameData,
  cache: PathCache,
): number {
  let total = 0;
  for (const enclosure of state.enclosures) {
    if (enclosure.speciesId !== null && isEnclosureReachable(cache, state, data, enclosure.id)) {
      total += enclosureAttractivenessMilli(enclosure, state, data);
    }
  }
  return total;
}

/**
 * V = min(k × √A, capacity) of the GDD, in thousandths of a visitor group per minute, with the
 * entry price and the park's satisfaction raising or lowering it a little.
 */
export function arrivalRateMilliPerMinute(
  state: GameState,
  data: GameData,
  cache: PathCache,
): number {
  return arrivalRateAtPrice(state, data, cache, state.economy.entryPriceCoins);
}

/** The arrival rate the park would have with this entry price, everything else unchanged. */
export function arrivalRateAtPrice(
  state: GameState,
  data: GameData,
  cache: PathCache,
  entryPriceCoins: number,
): number {
  const total = totalAttractivenessMilli(state, data, cache);
  if (total === 0) {
    return 0;
  }
  const { milliVisitorsPerSqrtAttractiveness, maxPerMinute } = data.visitorRules.arrivals;
  const base = Math.floor(milliVisitorsPerSqrtAttractiveness * Math.sqrt(total / MILLI));
  const priceBp = priceAttendanceBp(entryPriceCoins, data.economyRules);
  const satisfactionBp = satisfactionAttendanceBp(
    state.visitors.parkSatisfactionBp,
    data.economyRules,
  );
  const rate = Math.floor(
    (base * priceBp * satisfactionBp) / (BASIS_POINTS_TOTAL * BASIS_POINTS_TOTAL),
  );
  return Math.min(rate, maxPerMinute * MILLI);
}

/** Most groups the park holds at once: the data's cap, lower when the walkways are short. */
export function visitorCapacity(data: GameData, cache: PathCache): number {
  const { maxPresent, walkableCellsPerVisitor } = data.visitorRules.arrivals;
  return Math.min(maxPresent, Math.floor(cache.walkableCount / walkableCellsPerVisitor));
}
