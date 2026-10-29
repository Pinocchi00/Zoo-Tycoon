import { describe, expect, it } from 'vitest';
import { err, ok } from '../shared';
import { STATE_VERSION } from '../sim';
import { checkMigrationRegistry, MIGRATIONS, runMigrations, type Migration } from './migrations';

const bump =
  (from: number): Migration['migrate'] =>
  (data) =>
    ok({ ...(typeof data === 'object' ? data : {}), version: from + 1 });

describe('migration registry', () => {
  it('covers every version up to the current one, once', () => {
    expect(checkMigrationRegistry(MIGRATIONS, STATE_VERSION)).toEqual(ok(undefined));
  });

  it('rejects a gap, a duplicate and a step beyond the target', () => {
    const step0 = { from: 0, migrate: bump(0) };
    const step2 = { from: 2, migrate: bump(2) };
    expect(checkMigrationRegistry([step0, step2], 3)).toEqual(
      err({ kind: 'missingMigration', from: 1 }),
    );
    expect(checkMigrationRegistry([step0, step0], 1)).toEqual(
      err({ kind: 'duplicateMigration', from: 0 }),
    );
    expect(checkMigrationRegistry([step0], 0)).toEqual(
      err({ kind: 'migrationBeyondTarget', from: 0 }),
    );
  });
});

describe('runMigrations', () => {
  it('chains steps in order up to the target', () => {
    const registry = [1, 0, 2].map((from) => ({ from, migrate: bump(from) }));
    expect(runMigrations({ version: 0, park: 'kept' }, registry, 3)).toEqual(
      ok({ version: 3, park: 'kept' }),
    );
  });

  it('leaves current data untouched', () => {
    const data = { version: 2 };
    expect(runMigrations(data, [], 2)).toEqual(ok(data));
  });

  it('rejects data without a whole, non-negative version', () => {
    for (const data of [null, [], {}, { version: -1 }, { version: 1.5 }, { version: '1' }]) {
      expect(runMigrations(data, MIGRATIONS, 1)).toEqual(err({ kind: 'invalidPayload' }));
    }
  });

  it('refuses a save written by a newer game', () => {
    expect(runMigrations({ version: 5 }, MIGRATIONS, 1)).toEqual(
      err({ kind: 'versionFromFuture', version: 5 }),
    );
  });

  it('reports a missing step', () => {
    expect(runMigrations({ version: 0 }, [], 1)).toEqual(
      err({ kind: 'missingMigration', from: 0 }),
    );
  });

  it('reports a failing step with its reason', () => {
    const failing = { from: 0, migrate: () => err('broken') };
    expect(runMigrations({ version: 0 }, [failing], 1)).toEqual(
      err({ kind: 'migrationFailed', from: 0, reason: 'broken' }),
    );
  });

  it('reports a step that does not land on the next version', () => {
    const skipping = { from: 0, migrate: () => ok({ version: 2 }) };
    expect(runMigrations({ version: 0 }, [skipping], 2)).toEqual(
      err({ kind: 'migrationFailed', from: 0, reason: 'wrongResultVersion' }),
    );
  });
});

describe('migration from version 1 to 2', () => {
  const step = MIGRATIONS.find((migration) => migration.from === 1);

  it('adds arrivals with no progress and keeps every other field', () => {
    expect(step?.migrate({ version: 1, coins: 'kept' })).toEqual(
      ok({
        version: 2,
        coins: 'kept',
        gacha: {
          arrivalsSince: { rare: 0, veryRare: 0, iconic: 0 },
          welcome: { arrivalsDone: 0, pendingChoice: null },
          collection: [],
          history: [],
        },
      }),
    );
  });

  it('refuses data that is not a version 1 state', () => {
    expect(step?.migrate({ version: 0 })).toEqual(err('notAVersion1State'));
  });
});

describe('migration from version 2 to 3', () => {
  const step = MIGRATIONS.find((migration) => migration.from === 2);

  it('adds an empty park and keeps every other field', () => {
    expect(step?.migrate({ version: 2, coins: 'kept', enclosures: [] })).toEqual(
      ok({
        version: 3,
        coins: 'kept',
        enclosures: [],
        paths: [],
        buildings: [],
        nextIds: { enclosure: 1, building: 1 },
      }),
    );
  });

  it('refuses data that is not a version 2 state', () => {
    expect(step?.migrate({ version: 1, enclosures: [] })).toEqual(err('notAVersion2State'));
    expect(step?.migrate({ version: 2, enclosures: 'none' })).toEqual(err('notAVersion2State'));
  });

  it('refuses enclosures that version 2 could not hold', () => {
    expect(step?.migrate({ version: 2, enclosures: [{ id: 'meadow-1' }] })).toEqual(
      err('unexpectedVersion2Enclosures'),
    );
  });
});
