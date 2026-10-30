import { BASIS_POINTS_TOTAL } from '../../data/schemas/common';
import type { EconomyRules } from '../../data/schemas/economy';

/**
 * Attendance at this entry price, in basis points: a dear entry turns some visitors away, a cheap
 * one draws a few more (GDD "Économie du parc").
 */
export function priceAttendanceBp(priceCoins: number, rules: EconomyRules): number {
  const { fairCoins, lossPerCoinAboveBp, gainPerCoinBelowBp, minAttendanceBp } = rules.entryPrice;
  if (priceCoins > fairCoins) {
    return Math.max(
      minAttendanceBp,
      BASIS_POINTS_TOTAL - lossPerCoinAboveBp * (priceCoins - fairCoins),
    );
  }
  return BASIS_POINTS_TOTAL + gainPerCoinBelowBp * (fairCoins - priceCoins);
}

/**
 * A less happy park sees slightly fewer visitors, never none (GDD "Besoins et satisfaction").
 * Before the first departure, nothing is known yet: full attendance.
 */
export function satisfactionAttendanceBp(
  parkSatisfactionBp: number | null,
  rules: EconomyRules,
): number {
  if (parkSatisfactionBp === null) {
    return BASIS_POINTS_TOTAL;
  }
  const floor = rules.satisfactionAttendanceFloorBp;
  return (
    floor + Math.floor(((BASIS_POINTS_TOTAL - floor) * parkSatisfactionBp) / BASIS_POINTS_TOTAL)
  );
}
