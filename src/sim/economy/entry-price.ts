import type { GameData } from '../../data/load';
import type { SimContext } from '../context';
import type { GameState } from '../state';
import { arrivalRateAtPrice, MILLI } from '../visitors/attractiveness';
import { syncPathCache } from '../visitors/path-cache';

const MINUTES_PER_HOUR = 60;

/** Average people per visitor group, in thousandths, weighted like the arrivals. */
export function averageGroupSizeMilli(data: GameData): number {
  let weight = 0;
  let people = 0;
  for (const archetype of data.visitorArchetypes.values()) {
    weight += archetype.spawnWeight;
    // The size is drawn evenly between min and max.
    people +=
      (archetype.spawnWeight * MILLI * (archetype.groupSize.min + archetype.groupSize.max)) / 2;
  }
  return weight === 0 ? 0 : Math.floor(people / weight);
}

/** What the park would get at an entry price, shown before the player confirms it. */
export interface EntryPriceEstimate {
  readonly priceCoins: number;
  /** Visitor groups per hour, in thousandths. */
  readonly groupsPerHourMilli: number;
  /** Coins per hour from the entries alone. */
  readonly entryCoinsPerHour: number;
}

/**
 * Estimates the attendance and entry revenue at `priceCoins`, from the park as it is now. The
 * crowd limit of the walkways is left out: it caps the people present, not the rate.
 */
export function estimateEntryPrice(
  state: GameState,
  context: SimContext,
  priceCoins: number,
): EntryPriceEstimate {
  const { data } = context;
  syncPathCache(context.paths, state, data);
  const rateMilli = arrivalRateAtPrice(state, data, context.paths, priceCoins);
  const groupsPerHourMilli = rateMilli * MINUTES_PER_HOUR;
  const entryCoinsPerHour = Math.floor(
    (groupsPerHourMilli * averageGroupSizeMilli(data) * priceCoins) / (MILLI * MILLI),
  );
  return { priceCoins, groupsPerHourMilli, entryCoinsPerHour };
}
