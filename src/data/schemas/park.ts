import { z } from 'zod';
import { archetypeId, itemId } from '../../shared/brand';
import {
  addDuplicateIssues,
  brandedId,
  footprintSchema,
  nonNegativeInt,
  positiveInt,
  textKeySchema,
  visitorNeedSchema,
} from './common';

/** Service categories of the GDD ("Services et attractions"). */
export const BUILDING_CATEGORIES = [
  'food',
  'comfort',
  'shop',
  'attraction',
  'discovery',
  'keeper',
] as const;
export type BuildingCategory = (typeof BUILDING_CATEGORIES)[number];

const needListSchema = z
  .array(visitorNeedSchema)
  .min(1)
  .superRefine((needs, context) => {
    addDuplicateIssues(needs, context, []);
  });

export const buildingSchema = z.strictObject({
  id: brandedId(itemId),
  category: z.enum(BUILDING_CATEGORIES),
  nameKey: textKeySchema,
  footprint: footprintSchema,
  coinCost: nonNegativeInt,
  /** Light upkeep, taken from the revenue only (see `economyRules`). */
  upkeepCoinsPerHour: nonNegativeInt,
  requiresPath: z.boolean(),
  serves: needListSchema,
  /** What one visitor group does there: how long it stays and what it pays. */
  visitorUse: z.strictObject({
    seconds: positiveInt,
    priceCoins: nonNegativeInt,
  }),
});
export type Building = z.output<typeof buildingSchema>;
export type BuildingInput = z.input<typeof buildingSchema>;

export const decorSchema = z.strictObject({
  id: brandedId(itemId),
  nameKey: textKeySchema,
  footprint: footprintSchema,
  coinCost: nonNegativeInt,
});
export type Decor = z.output<typeof decorSchema>;
export type DecorInput = z.input<typeof decorSchema>;

export const visitorArchetypeSchema = z.strictObject({
  id: brandedId(archetypeId),
  nameKey: textKeySchema,
  spawnWeight: positiveInt,
  groupSize: z
    .strictObject({ min: positiveInt, max: positiveInt })
    .refine((size) => size.max >= size.min, { message: 'max must be at least min', path: ['max'] }),
  wants: needListSchema,
  walkSpeedMmPerSecond: positiveInt,
  /** Time the group plans to spend in the park. */
  visitMinutes: positiveInt,
});
export type VisitorArchetype = z.output<typeof visitorArchetypeSchema>;
export type VisitorArchetypeInput = z.input<typeof visitorArchetypeSchema>;
