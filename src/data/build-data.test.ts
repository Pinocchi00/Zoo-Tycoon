import { describe, expect, it } from 'vitest';
import { GAME_CONTENT } from './content';
import { buildRules, pathSurfaces } from './content/build-rules';
import { terrain } from './content/terrain';
import { loadGameContent, loadGameData, type DataError } from './index';
import type { RawGameData } from './load';

function errorsOf(raw: RawGameData): readonly DataError[] {
  const result = loadGameData(raw);
  if (result.ok) {
    throw new Error('expected the data to be refused');
  }
  return result.error;
}

function expectRefused(raw: RawGameData, expected: Partial<DataError>): void {
  expect(errorsOf(raw)).toContainEqual(expect.objectContaining(expected));
}

function withTerrain(patch: Record<string, unknown>): RawGameData {
  return { ...GAME_CONTENT, terrain: { ...terrain, ...patch } };
}

describe('construction data of the slice', () => {
  it('loads the land, the rules, the four surfaces and the five services', () => {
    const loaded = loadGameContent();
    if (!loaded.ok) {
      throw new Error('the slice content is valid');
    }
    const data = loaded.value;
    expect(data.terrain.columns).toBe(256);
    expect(data.terrain.rows).toBe(256);
    expect(data.pathSurfaces.size).toBe(4);
    expect([...data.buildings.keys()]).toEqual([
      'bench',
      'litter-bin',
      'water-fountain',
      'ice-cream-kiosk',
      'toilets',
    ]);
    expect([...data.buildings.values()].every((building) => building.requiresPath)).toBe(true);
    expect(data.buildRules.refundRateBp).toBe(10_000);
  });
});

describe('terrain', () => {
  it('wants the entrance on the south edge, in the middle, inside the land', () => {
    const entrance = terrain.entrance;
    expectRefused(withTerrain({ entrance: { ...entrance, row: 200 } }), {
      source: 'terrain',
      message: 'entrance must touch the south edge',
    });
    expectRefused(withTerrain({ entrance: { ...entrance, column: 10 } }), {
      source: 'terrain',
      message: 'entrance must be in the middle of the south edge',
    });
    expectRefused(withTerrain({ entrance: { ...entrance, column: -4, width: 264 } }), {
      source: 'terrain',
      message: 'entrance outside the land',
    });
  });

  it('wants the parking areas outside the land, one on each side of the entrance', () => {
    const [west, east] = terrain.parking;
    expectRefused(withTerrain({ parking: [{ ...west, row: 250 }, east] }), {
      source: 'terrain',
      message: 'parking must lie outside the land, south of it',
    });
    expectRefused(withTerrain({ parking: [east, west] }), {
      source: 'terrain',
      message: 'parking areas must lie west and east of the entrance',
    });
  });

  it('refuses a missing land', () => {
    expectRefused({ ...GAME_CONTENT, terrain: null }, { source: 'terrain' });
  });
});

describe('build rules and path surfaces', () => {
  it('keeps the viewpoint bonus below the best score and the refund within 100 %', () => {
    expectRefused(
      {
        ...GAME_CONTENT,
        buildRules: { ...buildRules, view: { ...buildRules.view, viewpointBonus: 5 } },
      },
      { source: 'buildRules', path: 'view.viewpointBonus' },
    );
    expectRefused(
      { ...GAME_CONTENT, buildRules: { ...buildRules, refundRateBp: 10_001 } },
      { source: 'buildRules', path: 'refundRateBp' },
    );
    expectRefused(
      {
        ...GAME_CONTENT,
        buildRules: { ...buildRules, enclosure: { maxAreaCells: 100, maxOutlinePoints: 2 } },
      },
      { source: 'buildRules', path: 'enclosure.maxOutlinePoints' },
    );
  });

  it('needs at least one surface, each with its own id', () => {
    expectRefused({ ...GAME_CONTENT, pathSurfaces: [] }, { source: 'pathSurfaces' });
    const [gravel] = pathSurfaces;
    expectRefused(
      { ...GAME_CONTENT, pathSurfaces: [gravel, { ...gravel, id: 'pond' }] },
      {
        source: 'pathSurfaces',
        message: 'id "pond" used by both habitatElements and pathSurfaces',
      },
    );
  });
});
