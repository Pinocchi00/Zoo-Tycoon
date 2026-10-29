import { z } from 'zod';
import type { TranslationKey } from '../../i18n';
import type { IdError } from '../../shared/brand';
import type { Result } from '../../shared/result';

/** Rarity tiers, from the most to the least frequent. The order is used by the gacha. */
export const RARITIES = ['common', 'uncommon', 'rare', 'veryRare', 'iconic'] as const;
export type Rarity = (typeof RARITIES)[number];
export const raritySchema = z.enum(RARITIES);

/** Enclosure sizes of the GDD available in the slice (pools and indoor buildings come later). */
export const ENCLOSURE_SIZES = ['S', 'M', 'L', 'XL'] as const;
export type EnclosureSize = (typeof ENCLOSURE_SIZES)[number];
export const enclosureSizeSchema = z.enum(ENCLOSURE_SIZES);

/** Visitor needs of the GDD ("Besoins et satisfaction"). */
export const VISITOR_NEEDS = [
  'wonder',
  'foodDrink',
  'rest',
  'comfort',
  'fun',
  'orientation',
] as const;
export type VisitorNeed = (typeof VISITOR_NEEDS)[number];
export const visitorNeedSchema = z.enum(VISITOR_NEEDS);

/** 100 % in basis points (1 % = 100), see AGENTS.md 4.5. */
export const BASIS_POINTS_TOTAL = 10_000;

export const positiveInt = z.int().min(1);
export const nonNegativeInt = z.int().min(0);

/** Same shape as the existing keys: dotted camelCase segments, e.g. `species.capybara.name`. */
const TEXT_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

/**
 * A text key. The compiler checks that it exists (data files are typed with `TranslationKey`);
 * at run time only its shape can be checked here, because data must not import the catalogs.
 */
export const textKeySchema = z.custom<TranslationKey>(
  (value) => typeof value === 'string' && TEXT_KEY_PATTERN.test(value),
  { message: 'missing or malformed text key' },
);

/** Turns a branding function into a schema, so that a loaded id is checked like a fresh one. */
export function brandedId<T>(brand: (raw: string) => Result<T, IdError>): z.ZodType<T, string> {
  return z.string().transform((raw, context) => {
    const branded = brand(raw);
    if (!branded.ok) {
      context.addIssue({ code: 'custom', message: branded.error });
      return z.NEVER;
    }
    return branded.value;
  });
}

/** Cells covered on the park grid (one cell = 1 m). */
export const footprintSchema = z.strictObject({
  width: positiveInt,
  depth: positiveInt,
});
export type Footprint = z.output<typeof footprintSchema>;

/** Reports every value that appears more than once, at its own index. */
export function addDuplicateIssues(
  values: readonly string[],
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({ code: 'custom', message: `duplicate "${value}"`, path: [...path, index] });
    }
    seen.add(value);
  });
}
