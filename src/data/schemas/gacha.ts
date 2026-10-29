import { z } from 'zod';
import { bannerId } from '../../shared/brand';
import {
  BASIS_POINTS_TOTAL,
  brandedId,
  nonNegativeInt,
  positiveInt,
  raritySchema,
  textKeySchema,
} from './common';

const basisPoints = z.int().min(0).max(BASIS_POINTS_TOTAL);

/** "Guaranteed at the Nth arrival without this rarity or better". */
const hardPitySchema = z.strictObject({ guaranteedAt: positiveInt });

export const gachaRulesSchema = z
  .strictObject({
    rarityRatesBp: z
      .strictObject({
        common: basisPoints,
        uncommon: basisPoints,
        rare: basisPoints,
        veryRare: basisPoints,
        iconic: basisPoints,
      })
      .refine(
        (rates) => Object.values(rates).reduce((sum, rate) => sum + rate, 0) === BASIS_POINTS_TOTAL,
        { message: `rates must add up to ${String(BASIS_POINTS_TOTAL)} basis points` },
      ),
    pity: z
      .strictObject({
        rare: hardPitySchema,
        veryRare: hardPitySchema,
        iconic: z.strictObject({
          guaranteedAt: positiveInt,
          // How fast the chances rise from here is decided with the gacha engine (task 1.3).
          softPityStartArrival: positiveInt,
        }),
      })
      .superRefine((pity, context) => {
        if (pity.iconic.softPityStartArrival >= pity.iconic.guaranteedAt) {
          context.addIssue({
            code: 'custom',
            message: 'soft pity must start before the guarantee',
            path: ['iconic', 'softPityStartArrival'],
          });
        }
        // A rarer guarantee that comes first would make the more common one meaningless.
        if (
          pity.rare.guaranteedAt >= pity.veryRare.guaranteedAt ||
          pity.veryRare.guaranteedAt >= pity.iconic.guaranteedAt
        ) {
          context.addIssue({
            code: 'custom',
            message: 'guarantees must come later for rarer tiers',
          });
        }
      }),
    arrivalTicketCost: positiveInt,
    multiArrival: z.strictObject({
      count: z.int().min(2),
      ticketCost: positiveInt,
    }),
    medalsPerArrival: nonNegativeInt,
    medalsPerExtraDuplicate: nonNegativeInt,
    // Commons and uncommons cannot be chosen: they come quickly anyway.
    catalogMedalCost: z.strictObject({
      rare: positiveInt,
      veryRare: positiveInt,
      iconic: positiveInt,
    }),
  })
  .superRefine((rules, context) => {
    if (rules.multiArrival.ticketCost > rules.multiArrival.count * rules.arrivalTicketCost) {
      context.addIssue({
        code: 'custom',
        message: 'a multi-arrival must not cost more than the same number of single arrivals',
        path: ['multiArrival', 'ticketCost'],
      });
    }
  });
export type GachaRules = z.output<typeof gachaRulesSchema>;
export type GachaRulesInput = z.input<typeof gachaRulesSchema>;

const permanentBannerSchema = z.strictObject({
  kind: z.literal('permanent'),
  id: brandedId(bannerId),
  nameKey: textKeySchema,
});

const welcomeBannerSchema = z.strictObject({
  kind: z.literal('welcome'),
  id: brandedId(bannerId),
  nameKey: textKeySchema,
  arrivalLimit: positiveInt,
  guaranteedRarity: raritySchema,
  choiceCount: positiveInt,
});

export const bannerSchema = z.discriminatedUnion('kind', [
  permanentBannerSchema,
  welcomeBannerSchema,
]);
export type Banner = z.output<typeof bannerSchema>;
export type BannerInput = z.input<typeof bannerSchema>;
