import { z } from 'zod';
import { err, ok, type Result } from '../shared';
import type { SaveError } from './errors';

/** Upgrades raw save data from version `from` to version `from + 1`. */
export interface Migration {
  readonly from: number;
  readonly migrate: (data: unknown) => Result<unknown, string>;
}

export type RegistryError =
  | { readonly kind: 'duplicateMigration'; readonly from: number }
  | { readonly kind: 'missingMigration'; readonly from: number }
  | { readonly kind: 'migrationBeyondTarget'; readonly from: number };

const versionedSchema = z.looseObject({ version: z.int().min(0) });

const stateV0Schema = z.looseObject({
  version: z.literal(0),
  clock: z.looseObject({}),
  currencies: z.looseObject({}),
});

/**
 * Fake v0, kept to prove the mechanism: version 0 had neither the step accumulator
 * nor wood shavings, so both start at zero.
 */
function migrateV0ToV1(data: unknown): Result<unknown, string> {
  const parsed = stateV0Schema.safeParse(data);
  if (!parsed.success) {
    return err('notAVersion0State');
  }
  const state = parsed.data;
  return ok({
    ...state,
    version: 1,
    clock: { ...state.clock, accumulatorMs: 0 },
    currencies: { ...state.currencies, shavings: 0 },
  });
}

const stateV1Schema = z.looseObject({ version: z.literal(1) });

/** Version 2 adds arrivals: no guarantee progress, no welcome arrival, nothing met yet. */
function migrateV1ToV2(data: unknown): Result<unknown, string> {
  const parsed = stateV1Schema.safeParse(data);
  if (!parsed.success) {
    return err('notAVersion1State');
  }
  return ok({
    ...parsed.data,
    version: 2,
    gacha: {
      arrivalsSince: { rare: 0, veryRare: 0, iconic: 0 },
      welcome: { arrivalsDone: 0, pendingChoice: null },
      collection: [],
      history: [],
    },
  });
}

// A missing list is left to the final state check, which reports it with its path.
const stateV2Schema = z.looseObject({
  version: z.literal(2),
  enclosures: z.array(z.unknown()).optional(),
});

/**
 * Version 3 adds construction: paths, buildings and the id counters. Version 2 had only an
 * enclosure placeholder that nothing could fill, so a non-empty list is not a real save.
 */
function migrateV2ToV3(data: unknown): Result<unknown, string> {
  const parsed = stateV2Schema.safeParse(data);
  if (!parsed.success) {
    return err('notAVersion2State');
  }
  if (parsed.data.enclosures !== undefined && parsed.data.enclosures.length > 0) {
    return err('unexpectedVersion2Enclosures');
  }
  return ok({
    ...parsed.data,
    version: 3,
    paths: [],
    buildings: [],
    nextIds: { enclosure: 1, building: 1 },
  });
}

// A missing or broken clock is left to the final state check, which reports it with its path.
const stateV3Schema = z.looseObject({ version: z.literal(3), clock: z.unknown().optional() });
const clockTimeSchema = z.looseObject({ timeMs: z.int().min(0) });

/**
 * Version 4 adds the visitors: nobody in the park yet, no suggestion. The feed starts fading from
 * the save's own time, never from the day the park opened.
 */
function migrateV3ToV4(data: unknown): Result<unknown, string> {
  const parsed = stateV3Schema.safeParse(data);
  if (!parsed.success) {
    return err('notAVersion3State');
  }
  return ok({
    ...parsed.data,
    version: 4,
    visitors: {
      list: [],
      nextNumber: 1,
      arrivalProgress: 0,
      parkSatisfactionBp: null,
      suggestions: { foodDrink: 0, rest: 0, comfort: 0 },
      suggestionsHalvedAtMs: clockTimeSchema.safeParse(parsed.data.clock).data?.timeMs ?? 0,
    },
  });
}

/** Every migration ever written, in order. Never edit a published one: add the next. */
export const MIGRATIONS: readonly Migration[] = [
  { from: 0, migrate: migrateV0ToV1 },
  { from: 1, migrate: migrateV1ToV2 },
  { from: 2, migrate: migrateV2ToV3 },
  { from: 3, migrate: migrateV3ToV4 },
];

/** Checks that the registry holds exactly one step for every version below the target. */
export function checkMigrationRegistry(
  registry: readonly Migration[],
  targetVersion: number,
): Result<void, RegistryError> {
  const seen = new Set<number>();
  for (const migration of registry) {
    if (seen.has(migration.from)) {
      return err({ kind: 'duplicateMigration', from: migration.from });
    }
    if (migration.from >= targetVersion) {
      return err({ kind: 'migrationBeyondTarget', from: migration.from });
    }
    seen.add(migration.from);
  }
  for (let version = 0; version < targetVersion; version += 1) {
    if (!seen.has(version)) {
      return err({ kind: 'missingMigration', from: version });
    }
  }
  return ok(undefined);
}

/** Brings raw save data up to the target version, one step at a time. */
export function runMigrations(
  data: unknown,
  registry: readonly Migration[],
  targetVersion: number,
): Result<unknown, SaveError> {
  const versioned = versionedSchema.safeParse(data);
  if (!versioned.success) {
    return err({ kind: 'invalidPayload' });
  }
  let version = versioned.data.version;
  if (version > targetVersion) {
    return err({ kind: 'versionFromFuture', version });
  }
  let current: unknown = data;
  while (version < targetVersion) {
    const from = version;
    const migration = registry.find((candidate) => candidate.from === from);
    if (migration === undefined) {
      return err({ kind: 'missingMigration', from });
    }
    const migrated = migration.migrate(current);
    if (!migrated.ok) {
      return err({ kind: 'migrationFailed', from, reason: migrated.error });
    }
    const next = versionedSchema.safeParse(migrated.value);
    if (!next.success || next.data.version !== from + 1) {
      return err({ kind: 'migrationFailed', from, reason: 'wrongResultVersion' });
    }
    current = migrated.value;
    version = from + 1;
  }
  return ok(current);
}
