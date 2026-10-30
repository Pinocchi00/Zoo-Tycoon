import { z } from 'zod';
import { itemId } from '../../shared/brand';
import {
  addDuplicateIssues,
  BASIS_POINTS_TOTAL,
  brandedId,
  nonNegativeInt,
  positiveInt,
} from './common';

const basisPoints = z.int().min(0).max(BASIS_POINTS_TOTAL);

/** One park level: the park stars it needs, its ticket reward and the buildings it unlocks. */
const parkLevelSchema = z.strictObject({
  stars: nonNegativeInt,
  rewardTickets: nonNegativeInt,
  unlocksBuildings: z.array(brandedId(itemId)).superRefine((ids, context) => {
    addDuplicateIssues(ids, context, []);
  }),
});
export type ParkLevel = z.output<typeof parkLevelSchema>;

/** Money loop of the park (GDD "Économie du parc" and "Progression, économie et équilibrage"). */
export const economyRulesSchema = z.strictObject({
  /** Given once, when a new park opens. */
  startingGift: z.strictObject({ coins: nonNegativeInt, arrivalTickets: nonNegativeInt }),
  /** Paid by every person of a group at the gate. */
  entryPrice: z
    .strictObject({
      defaultCoins: nonNegativeInt,
      maxCoins: positiveInt,
      /** Price at which the attendance is neither raised nor lowered. */
      fairCoins: nonNegativeInt,
      /** Attendance lost per coin above the fair price. */
      lossPerCoinAboveBp: basisPoints,
      /** Attendance gained per coin below the fair price. */
      gainPerCoinBelowBp: basisPoints,
      /** However dear the entry, attendance never falls below this share. */
      minAttendanceBp: basisPoints.min(1),
    })
    .refine((price) => price.defaultCoins <= price.maxCoins, {
      message: 'the default price must not exceed the max price',
      path: ['defaultCoins'],
    })
    .refine((price) => price.fairCoins <= price.maxCoins, {
      message: 'the fair price must not exceed the max price',
      path: ['fairCoins'],
    }),
  /** Attendance at park satisfaction 0; it grows linearly to 100 % at full satisfaction. */
  satisfactionAttendanceFloorBp: basisPoints,
  /** Upkeep is paid only out of the revenue, never more than this share of it: no bankruptcy. */
  upkeepMaxShareOfRevenueBp: basisPoints,
  dailyMail: z.strictObject({ ticketsPerDay: positiveInt, maxDays: positiveInt }),
  ticketCounter: z.strictObject({ ticketsPerDay: positiveInt, coinsPerTicket: positiveInt }),
  /** Level 1 first. Its threshold is 0 stars and the thresholds keep rising. */
  parkLevels: z
    .array(parkLevelSchema)
    .min(1)
    .superRefine((levels, context) => {
      if (levels[0] !== undefined && levels[0].stars !== 0) {
        context.addIssue({ code: 'custom', message: 'level 1 needs 0 stars', path: [0, 'stars'] });
      }
      levels.forEach((level, index) => {
        const previous = levels[index - 1];
        if (previous !== undefined && level.stars <= previous.stars) {
          const message = 'each level needs more stars than the one before';
          context.addIssue({ code: 'custom', message, path: [index, 'stars'] });
        }
      });
      addDuplicateIssues(
        levels.flatMap((level) => level.unlocksBuildings),
        context,
        [],
      );
    }),
});
export type EconomyRules = z.output<typeof economyRulesSchema>;
export type EconomyRulesInput = z.input<typeof economyRulesSchema>;
