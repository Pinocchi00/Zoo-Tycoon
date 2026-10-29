import { z } from 'zod';
import { BASIS_POINTS_TOTAL, RARITIES } from '../data/schemas/common';
import { MAX_HABITAT_STARS } from '../data/schemas/species';
import { SERVICE_NEEDS, type ServiceNeed } from '../data/schemas/visitors';
import {
  animalId,
  archetypeId,
  bannerId,
  buildingId,
  enclosureId,
  itemId,
  speciesId,
  visitorId,
  type IdError,
  type Result,
} from '../shared';
import {
  ARRIVAL_SOURCES,
  FINE_TOTAL,
  MM_PER_CELL,
  QUARTER_TURNS,
  STATE_VERSION,
  STEP_MS,
  VISITOR_ACTIVITIES,
} from '../sim';

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

/**
 * Coarse bounds for a hand-edited file: far above anything the game builds (the data allow 32
 * corners on a 256-cell land), low enough that loading can never stall on a forged outline.
 */
const MAX_SAVED_OUTLINE_POINTS = 256;
const MAX_SAVED_COORDINATE = 65_535;

/** Ids are `<prefix>-<n>`, issued in order: every n is below the counter of the next id. */
function isIssuedId(id: string, prefix: string, next: number): boolean {
  if (!id.startsWith(`${prefix}-`)) {
    return false;
  }
  const digits = id.slice(prefix.length + 1);
  return /^[1-9][0-9]*$/.test(digits) && Number(digits) < next;
}

function hasDistinct<T>(values: readonly T[], key: (value: T) => string | number): boolean {
  return new Set(values.map(key)).size === values.length;
}

const cellCoordinate = z.int().min(0).max(MAX_SAVED_COORDINATE);

const enclosuresSchema = z
  .array(
    z.strictObject({
      id: brandedId(enclosureId),
      outline: z
        .array(z.strictObject({ x: cellCoordinate, y: cellCoordinate }))
        .min(3)
        .max(MAX_SAVED_OUTLINE_POINTS),
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

const fineLevel = z.int().min(0).max(FINE_TOTAL);
const basisPoints = z.int().min(0).max(BASIS_POINTS_TOTAL);
const needSchema = z.enum(SERVICE_NEEDS);
function needLevels(level: z.ZodInt): z.ZodObject<Record<ServiceNeed, z.ZodInt>, z.core.$strict> {
  return z.strictObject({ foodDrink: level, rest: level, comfort: level });
}

const visitorGoalSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('enclosure'), enclosureId: brandedId(enclosureId) }),
  z.strictObject({ kind: z.literal('service'), need: needSchema }),
  z.strictObject({ kind: z.literal('exit') }),
]);

const visitorSchema = z
  .strictObject({
    id: brandedId(visitorId),
    archetypeId: brandedId(archetypeId),
    groupSize: z.int().min(1),
    column: cellCoordinate,
    row: cellCoordinate,
    nextColumn: cellCoordinate,
    nextRow: cellCoordinate,
    progressMm: z
      .int()
      .min(0)
      .max(MM_PER_CELL - 1),
    activity: z.enum(VISITOR_ACTIVITIES),
    goal: visitorGoalSchema,
    waitMs: amount,
    serviceId: brandedId(buildingId).nullable(),
    needs: needLevels(fineLevel),
    wonderBp: basisPoints,
    satisfaction: fineLevel,
    seen: z
      .array(brandedId(enclosureId))
      .refine((seen) => hasDistinct(seen, (id) => id), { message: 'duplicateSeen' }),
    visitLeftMs: amount,
    missingNeeds: z
      .array(needSchema)
      .refine((needs) => hasDistinct(needs, (need) => need), { message: 'duplicateNeed' }),
    updatedAtMs: amount,
  })
  // A visitor walks from a cell to a side neighbour: anything else would teleport it.
  .refine(
    (visitor) =>
      Math.abs(visitor.nextColumn - visitor.column) + Math.abs(visitor.nextRow - visitor.row) <= 1,
    { message: 'nextCellNotANeighbour', path: ['nextColumn'] },
  );

const visitorsSchema = z.strictObject({
  list: z
    .array(visitorSchema)
    .refine((list) => hasDistinct(list, (visitor) => visitor.id), { message: 'duplicateVisitor' }),
  nextNumber: z.int().min(1),
  arrivalProgress: amount,
  parkSatisfactionBp: basisPoints.nullable(),
  suggestions: needLevels(amount),
  suggestionsHalvedAtMs: amount,
});

/**
 * Full shape of the saved GameState (everything but the session). Strict: an unknown field means
 * the file is not ours. Overlaps are not checked here: only the simulation can build the park.
 */
export const gameStateSchema = z
  .strictObject({
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
    visitors: visitorsSchema,
  })
  // A counter behind an existing id would give the next object a twin, merged by every change.
  .superRefine((state, context) => {
    const { nextIds } = state;
    if (!state.enclosures.every(({ id }) => isIssuedId(id, 'enclosure', nextIds.enclosure))) {
      const path = ['nextIds', 'enclosure'];
      context.addIssue({ code: 'custom', message: 'idNotIssuedYet', path });
    }
    if (!state.buildings.every(({ id }) => isIssuedId(id, 'building', nextIds.building))) {
      const path = ['nextIds', 'building'];
      context.addIssue({ code: 'custom', message: 'idNotIssuedYet', path });
    }
    const { visitors } = state;
    if (!visitors.list.every(({ id }) => isIssuedId(id, 'visitor', visitors.nextNumber))) {
      const path = ['visitors', 'nextNumber'];
      context.addIssue({ code: 'custom', message: 'idNotIssuedYet', path });
    }
    // Ahead of the clock, the feed would never fade.
    if (visitors.suggestionsHalvedAtMs > state.clock.timeMs) {
      const path = ['visitors', 'suggestionsHalvedAtMs'];
      context.addIssue({ code: 'custom', message: 'aheadOfClock', path });
    }
    // A visitor ahead of the clock would be simulated backwards.
    if (visitors.list.some((visitor) => visitor.updatedAtMs > state.clock.timeMs)) {
      const path = ['visitors', 'list'];
      context.addIssue({ code: 'custom', message: 'visitorAheadOfClock', path });
    }
  });

/** Dotted path of the first issue, e.g. `currencies.coins`, so that a bad save says what is wrong. */
export function firstIssuePath(error: z.ZodError): string {
  const [issue] = error.issues;
  return issue === undefined ? '' : issue.path.map(String).join('.');
}
