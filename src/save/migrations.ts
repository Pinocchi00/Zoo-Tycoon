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

/** Every migration ever written, in order. Never edit a published one: add the next. */
export const MIGRATIONS: readonly Migration[] = [
  { from: 0, migrate: migrateV0ToV1 },
  { from: 1, migrate: migrateV1ToV2 },
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
