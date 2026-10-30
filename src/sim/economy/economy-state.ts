/** Upkeep is counted in coins × milliseconds per hour, so that a 100 ms step stays a whole number. */
export const UPKEEP_UNITS_PER_COIN = 60 * 60 * 1000;
/** Upkeep is settled once per game minute against that minute's revenue. */
export const SETTLEMENT_PERIOD_MS = 60_000;

/** Running totals, for the park's simple finances and the offline report. */
export interface EconomyTotals {
  /** Every coin paid by visitors: entries and services. */
  visitorCoins: number;
  upkeepCoins: number;
}

export interface EconomyState {
  /** Paid by each person at the gate. */
  entryPriceCoins: number;
  /** Current attractiveness of the park, rounded down: never spent. */
  parkStars: number;
  /** 1-based and never lowered, even if the stars drop (GDD: nothing degrades). */
  parkLevel: number;
  /** Real day number given by app with the last mail claimed; null before the first one. */
  lastMailDay: number | null;
  /** Real day of the last counter purchase; null before the first one. */
  counterDay: number | null;
  /** Tickets bought at the counter on `counterDay`. */
  counterBought: number;
  /** Upkeep building up since the last settlement, in `UPKEEP_UNITS_PER_COIN`. */
  upkeepOwed: number;
  /** Visitor revenue since the last settlement: upkeep is only ever taken from it. */
  periodRevenue: number;
  /** Game time of the last settlement. */
  settledAtMs: number;
  totals: EconomyTotals;
}

/** A park before its opening gift: app and the simulator use `createNewGame` instead. */
export function createEconomyState(): EconomyState {
  return {
    entryPriceCoins: 0,
    parkStars: 0,
    parkLevel: 1,
    lastMailDay: null,
    counterDay: null,
    counterBought: 0,
    upkeepOwed: 0,
    periodRevenue: 0,
    settledAtMs: 0,
    totals: { visitorCoins: 0, upkeepCoins: 0 },
  };
}
