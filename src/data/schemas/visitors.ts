import { z } from 'zod';
import { BASIS_POINTS_TOTAL, nonNegativeInt, positiveInt, textKeySchema } from './common';

/** Needs met by a service building; wonder is met by the animals instead. */
export const SERVICE_NEEDS = ['foodDrink', 'rest', 'comfort'] as const;
export type ServiceNeed = (typeof SERVICE_NEEDS)[number];

const basisPoints = z.int().min(0).max(BASIS_POINTS_TOTAL);

const serviceNeedRuleSchema = z.strictObject({
  risePerMinuteBp: positiveInt,
  /** Thought while the visitor walks to a service. */
  urgentThoughtKey: textKeySchema,
  /** Thought, and suggestion of the feed, when no service of this need can be reached. */
  missingThoughtKey: textKeySchema,
});
export type ServiceNeedRule = z.output<typeof serviceNeedRuleSchema>;

/** How visitors come, walk, feel and spend (GDD "Visiteurs"). */
export const visitorRulesSchema = z.strictObject({
  arrivals: z.strictObject({
    /** k of the GDD formula V = min(k × √A, capacity), in thousandths of a visitor per minute. */
    milliVisitorsPerSqrtAttractiveness: positiveInt,
    maxPerMinute: positiveInt,
    maxPresent: positiveInt,
    /** Walkable cells needed per visitor present, so that short paths never get crowded. */
    walkableCellsPerVisitor: positiveInt,
  }),
  /** A_enclosure = A_species × (1 + perStar × stars) × (1 + perViewPoint × view). */
  attractiveness: z.strictObject({
    perStarBp: nonNegativeInt,
    perViewPointBp: nonNegativeInt,
  }),
  needs: z.strictObject({
    /** Above this level, the visitor walks to the closest service. */
    seekThresholdBp: basisPoints.min(1),
    /** Rise multiplier of the needs the archetype wants (15 000 = × 1.5). */
    wantedRiseBp: positiveInt,
    foodDrink: serviceNeedRuleSchema,
    rest: serviceNeedRuleSchema,
    comfort: serviceNeedRuleSchema,
  }),
  viewing: z.strictObject({
    baseSeconds: positiveInt,
    secondsPerViewPoint: nonNegativeInt,
    wonderPerViewBp: positiveInt,
    wonderPerViewPointBp: nonNegativeInt,
  }),
  satisfaction: z.strictObject({
    startBp: basisPoints,
    /** Target satisfaction of a visitor with no wonder and no unmet need. */
    baseBp: basisPoints,
    /** Share of the wonder added to the target. */
    wonderWeightBp: basisPoints,
    /** Removed from the target per point of an urgent need above the threshold, in basis points. */
    unmetPenaltyBp: basisPoints,
    smoothingSeconds: positiveInt,
    /** Spending at satisfaction 0; it grows linearly to 100 % at full satisfaction. */
    spendFloorBp: basisPoints,
    /** The park's satisfaction follows the last departures with this weight (1 / n). */
    departureSmoothingVisitors: positiveInt,
  }),
  /** Counts of the suggestion feed halve after this time, so that old wishes fade. */
  suggestionHalfLifeMinutes: positiveInt,
  /** Side of the square zones whose satisfaction can be looked up, in cells. */
  zoneSizeCells: positiveInt,
  thoughts: z.strictObject({
    contentKey: textKeySchema,
    amazedKey: textKeySchema,
    leavingKey: textKeySchema,
  }),
});
export type VisitorRules = z.output<typeof visitorRulesSchema>;
export type VisitorRulesInput = z.input<typeof visitorRulesSchema>;
