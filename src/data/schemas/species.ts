import { z } from 'zod';
import { behaviorId, biomeId, itemId, speciesId } from '../../shared/brand';
import {
  addDuplicateIssues,
  brandedId,
  enclosureSizeSchema,
  positiveInt,
  raritySchema,
  textKeySchema,
} from './common';

/** Highest habitat level: stars 2 to 5 each add one reward on top of the arrival kit (star 1). */
export const MAX_HABITAT_STARS = 5;

export const HABITAT_ELEMENT_CATEGORIES = [
  'ground',
  'water',
  'vegetation',
  'shelter',
  'enrichment',
  'barrier',
  'viewpoint',
] as const;
export type HabitatElementCategory = (typeof HABITAT_ELEMENT_CATEGORIES)[number];

const itemIdSchema = brandedId(itemId);

export const biomeSchema = z.strictObject({
  id: brandedId(biomeId),
  nameKey: textKeySchema,
});
export type Biome = z.output<typeof biomeSchema>;
export type BiomeInput = z.input<typeof biomeSchema>;

const sizeRuleSchema = z.strictObject({ minAreaCells: positiveInt });

export const enclosureSizesSchema = z
  .strictObject({ S: sizeRuleSchema, M: sizeRuleSchema, L: sizeRuleSchema, XL: sizeRuleSchema })
  .refine(
    (sizes) =>
      sizes.S.minAreaCells < sizes.M.minAreaCells &&
      sizes.M.minAreaCells < sizes.L.minAreaCells &&
      sizes.L.minAreaCells < sizes.XL.minAreaCells,
    { message: 'each size must need more cells than the previous one' },
  );
export type EnclosureSizes = z.output<typeof enclosureSizesSchema>;
export type EnclosureSizesInput = z.input<typeof enclosureSizesSchema>;

export const habitatElementSchema = z.strictObject({
  id: itemIdSchema,
  category: z.enum(HABITAT_ELEMENT_CATEGORIES),
  nameKey: textKeySchema,
});
export type HabitatElement = z.output<typeof habitatElementSchema>;
export type HabitatElementInput = z.input<typeof habitatElementSchema>;

const starRewardSchema = z.strictObject({
  elements: z.array(itemIdSchema).min(1),
  unlocksBehavior: brandedId(behaviorId),
});
export type StarReward = z.output<typeof starRewardSchema>;

/** Same pattern as typed ids: safe as a file name in `assets/models/<modelId>.glb`. */
const MODEL_ID_PATTERN = /^[a-z0-9_-]+$/;

export const speciesSchema = z
  .strictObject({
    id: brandedId(speciesId),
    biome: brandedId(biomeId),
    rarity: raritySchema,
    group: z
      .strictObject({ arrivalSize: positiveInt, maxSize: positiveInt })
      .refine((group) => group.maxSize >= group.arrivalSize, {
        message: 'maxSize must be at least arrivalSize',
        path: ['maxSize'],
      }),
    minEnclosureSize: enclosureSizeSchema,
    baseAttractiveness: positiveInt,
    habitatKit: z.strictObject({
      ground: itemIdSchema,
      water: itemIdSchema.nullable(),
      shelter: itemIdSchema,
      vegetation: z.array(itemIdSchema).min(1),
    }),
    starRewards: z.strictObject({
      2: starRewardSchema,
      3: starRewardSchema,
      4: starRewardSchema,
      5: starRewardSchema,
    }),
    behaviors: z
      .array(z.strictObject({ id: brandedId(behaviorId), nameKey: textKeySchema }))
      .min(1),
    texts: z.strictObject({ nameKey: textKeySchema, signatureKey: textKeySchema }),
    modelId: z.string().regex(MODEL_ID_PATTERN),
  })
  .superRefine((species, context) => {
    const behaviorIds = species.behaviors.map((behavior) => behavior.id);
    addDuplicateIssues(behaviorIds, context, ['behaviors']);
    const known = new Set<string>(behaviorIds);
    const unlocked = new Set<string>();
    for (const [star, reward] of Object.entries(species.starRewards)) {
      const path = ['starRewards', star, 'unlocksBehavior'];
      if (!known.has(reward.unlocksBehavior)) {
        context.addIssue({ code: 'custom', message: 'behavior not in behaviors', path });
      } else if (unlocked.has(reward.unlocksBehavior)) {
        context.addIssue({ code: 'custom', message: 'behavior unlocked by two stars', path });
      }
      unlocked.add(reward.unlocksBehavior);
    }
    addDuplicateElementIssues(species, context);
  });

/** Each element is given once: by the arrival kit or by a single star. */
function addDuplicateElementIssues(
  species: {
    readonly habitatKit: {
      readonly ground: string;
      readonly water: string | null;
      readonly shelter: string;
      readonly vegetation: readonly string[];
    };
    readonly starRewards: Readonly<Record<string, { readonly elements: readonly string[] }>>;
  },
  context: z.RefinementCtx,
): void {
  const kit = species.habitatKit;
  const placed: readonly [string, PropertyKey[]][] = [
    [kit.ground, ['habitatKit', 'ground']],
    ...(kit.water === null
      ? []
      : [[kit.water, ['habitatKit', 'water']] satisfies [string, PropertyKey[]]]),
    [kit.shelter, ['habitatKit', 'shelter']],
    ...kit.vegetation.map((id, index): [string, PropertyKey[]] => [
      id,
      ['habitatKit', 'vegetation', index],
    ]),
    ...Object.entries(species.starRewards).flatMap(([star, reward]) =>
      reward.elements.map((id, index): [string, PropertyKey[]] => [
        id,
        ['starRewards', star, 'elements', index],
      ]),
    ),
  ];
  const seen = new Set<string>();
  for (const [id, path] of placed) {
    if (seen.has(id)) {
      context.addIssue({ code: 'custom', message: `element "${id}" given twice`, path });
    }
    seen.add(id);
  }
}
export type Species = z.output<typeof speciesSchema>;
export type SpeciesInput = z.input<typeof speciesSchema>;
