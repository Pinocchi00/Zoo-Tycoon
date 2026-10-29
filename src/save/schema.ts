import { z } from 'zod';
import { RARITIES } from '../data/schemas/common';
import { MAX_HABITAT_STARS } from '../data/schemas/species';
import {
  animalId,
  bannerId,
  buildingId,
  enclosureId,
  itemId,
  speciesId,
  type IdError,
  type Result,
} from '../shared';
import { ARRIVAL_SOURCES, QUARTER_TURNS, STATE_VERSION, STEP_MS } from '../sim';

const MAX_UINT32 = 0xffff_ffff;

const amount = z.int().min(0);
const uint32 = z.int().min(0).max(MAX_UINT32);

/** Turns a branding function into a schema, so that a loaded id is checked like a fresh one. */
function brandedId<T>(brand: (raw: string) => Result<T, IdError>): z.ZodType<T, string> {
  return z.string().transform((raw, context) => {
    const branded = brand(raw);
    if (!branded.ok) {
      context.addIssue({ code: 'custom', message: branded.error });
      return z.NEVER;
    }
    return branded.value;
  });
}

const speciesIdSchema = brandedId(speciesId);
const bannerIdSchema = brandedId(bannerId);
const itemIdSchema = brandedId(itemId);

function hasDistinct<T>(values: readonly T[], key: (value: T) => string | number): boolean {
  return new Set(values.map(key)).size === values.length;
}

const cellCoordinate = z.int().min(0);

const enclosuresSchema = z
  .array(
    z.strictObject({
      id: brandedId(enclosureId),
      outline: z.array(z.strictObject({ x: cellCoordinate, y: cellCoordinate })).min(3),
      speciesId: speciesIdSchema.nullable(),
      viewScore: amount,
    }),
  )
  .refine((enclosures) => hasDistinct(enclosures, (enclosure) => enclosure.id), {
    message: 'duplicateEnclosure',
  })
  .refine(
    (enclosures) => {
      const housed = enclosures.flatMap((enclosure) =>
        enclosure.speciesId === null ? [] : [enclosure.speciesId],
      );
      return hasDistinct(housed, (id) => id);
    },
    { message: 'groupInTwoEnclosures' },
  );

const pathsSchema = z
  .array(z.strictObject({ column: cellCoordinate, row: cellCoordinate, surface: itemIdSchema }))
  .refine((paths) => hasDistinct(paths, (tile) => `${String(tile.column)},${String(tile.row)}`), {
    message: 'duplicatePathCell',
  });

const buildingsSchema = z
  .array(
    z.strictObject({
      id: brandedId(buildingId),
      itemId: itemIdSchema,
      column: cellCoordinate,
      row: cellCoordinate,
      quarterTurns: z.literal(QUARTER_TURNS),
    }),
  )
  .refine((buildings) => hasDistinct(buildings, (building) => building.id), {
    message: 'duplicateBuilding',
  });

const gachaSchema = z.strictObject({
  arrivalsSince: z.strictObject({ rare: amount, veryRare: amount, iconic: amount }),
  welcome: z.strictObject({
    arrivalsDone: amount,
    pendingChoice: z
      .strictObject({
        bannerId: bannerIdSchema,
        options: z
          .array(speciesIdSchema)
          .min(1)
          .refine((options) => new Set(options).size === options.length, {
            message: 'duplicateOption',
          }),
      })
      .nullable(),
  }),
  collection: z
    .array(
      z.strictObject({
        speciesId: speciesIdSchema,
        stars: z.int().min(1).max(MAX_HABITAT_STARS),
        groupSize: z.int().min(1),
      }),
    )
    .refine(
      (collection) =>
        new Set(collection.map((progress) => progress.speciesId)).size === collection.length,
      { message: 'duplicateSpecies' },
    ),
  history: z
    .array(
      z.strictObject({
        number: z.int().min(1),
        timeMs: amount,
        bannerId: bannerIdSchema.nullable(),
        speciesId: speciesIdSchema,
        rarity: z.enum(RARITIES),
        source: z.enum(ARRIVAL_SOURCES),
      }),
    )
    // Numbers are positions in the history: a gap means lost or forged entries.
    .refine((history) => history.every((record, index) => record.number === index + 1), {
      message: 'brokenHistoryNumbers',
    }),
});

/**
 * Full shape of the saved GameState (everything but the session). Strict: an unknown field means
 * the file is not ours. Overlaps are not checked here: only the simulation can build the park.
 */
export const gameStateSchema = z.strictObject({
  version: z.literal(STATE_VERSION),
  clock: z.strictObject({
    timeMs: amount,
    // The accumulator never holds a whole step: advance() would have simulated it.
    accumulatorMs: amount.max(STEP_MS - 1),
  }),
  // xoshiro128** never leaves the all-zero state: the game would draw the same value forever.
  rng: z
    .tuple([uint32, uint32, uint32, uint32])
    .refine((words) => words.some((word) => word !== 0), { message: 'allZeroRng' }),
  currencies: z.strictObject({
    coins: amount,
    arrivalTickets: amount,
    careMedals: amount,
    decorTickets: amount,
    shavings: amount,
  }),
  enclosures: enclosuresSchema,
  animals: z.array(z.strictObject({ id: brandedId(animalId), speciesId: speciesIdSchema })),
  gacha: gachaSchema,
  paths: pathsSchema,
  buildings: buildingsSchema,
  nextIds: z.strictObject({ enclosure: z.int().min(1), building: z.int().min(1) }),
});

/** Dotted path of the first issue, e.g. `currencies.coins`, so that a bad save says what is wrong. */
export function firstIssuePath(error: z.ZodError): string {
  const [issue] = error.issues;
  return issue === undefined ? '' : issue.path.map(String).join('.');
}
