import { describe, expect, it } from 'vitest';
import { GAME_CONTENT } from './content';
import { banners as gameBanners } from './content/banners';
import { gachaRules } from './content/gacha-rules';
import { capybara } from './content/species/capybara';
import { SYNTHETIC_GACHA_CONTENT } from './fixtures/synthetic-gacha';
import { formatDataErrors, loadGameContent, loadGameData, RARITIES, type DataError } from './index';
import type { RawGameData } from './load';

const [, welcomeBanner] = gameBanners;

function withSpecies(...species: unknown[]): RawGameData {
  return { ...GAME_CONTENT, species };
}

function brokenCapybara(patch: Record<string, unknown>): RawGameData {
  return withSpecies({ ...capybara, ...patch });
}

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

const VALID_BUILDING = {
  id: 'bench',
  category: 'comfort',
  nameKey: 'app.title',
  footprint: { width: 2, depth: 1 },
  coinCost: 50,
  requiresPath: true,
  serves: ['rest'],
};

const VALID_ARCHETYPE = {
  id: 'couple',
  nameKey: 'app.title',
  spawnWeight: 3,
  groupSize: { min: 2, max: 2 },
  wants: ['rest', 'wonder'],
};

describe('game content', () => {
  it('loads and validates every data file', () => {
    const result = loadGameContent();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const data = result.value;
    expect([...data.species.keys()]).toEqual(['capybara']);
    expect(data.gachaRules.rarityRatesBp.common).toBe(5500);
    expect([...data.banners.values()].map((banner) => banner.kind)).toEqual([
      'permanent',
      'welcome',
    ]);
    expect(data.biomes.size).toBe(1);
    expect(data.habitatElements.size).toBe(GAME_CONTENT.habitatElements.length);
  });

  it('gives the capybara a max group of its arrival size + 3', () => {
    expect(capybara.group.maxSize).toBe(capybara.group.arrivalSize + 3);
  });

  it('accepts valid buildings, decor and visitor archetypes', () => {
    const result = loadGameData({
      ...GAME_CONTENT,
      buildings: [VALID_BUILDING],
      decor: [
        { id: 'lantern', nameKey: 'app.title', footprint: { width: 1, depth: 1 }, coinCost: 0 },
      ],
      visitorArchetypes: [VALID_ARCHETYPE],
    });
    expect(result.ok).toBe(true);
  });
});

describe('synthetic gacha content', () => {
  it('loads and fills every rarity tier with two species', () => {
    const result = loadGameData(SYNTHETIC_GACHA_CONTENT);
    if (!result.ok) {
      throw new Error(formatDataErrors(result.error));
    }
    const species = [...result.value.species.values()];
    for (const rarity of RARITIES) {
      expect(species.filter((entry) => entry.rarity === rarity)).toHaveLength(2);
    }
  });
});

describe('invalid species', () => {
  it('refuses an unknown rarity', () => {
    expectRefused(brokenCapybara({ rarity: 'legendary' }), {
      source: 'species[0] (capybara)',
      path: 'rarity',
    });
  });

  it('refuses a negative group size', () => {
    expectRefused(brokenCapybara({ group: { arrivalSize: -1, maxSize: 7 } }), {
      path: 'group.arrivalSize',
    });
  });

  it('refuses a max group smaller than the arrival group', () => {
    expectRefused(brokenCapybara({ group: { arrivalSize: 4, maxSize: 3 } }), {
      path: 'group.maxSize',
      message: 'maxSize must be at least arrivalSize',
    });
  });

  it('refuses a missing text key', () => {
    const { signatureKey } = capybara.texts;
    expectRefused(brokenCapybara({ texts: { signatureKey } }), {
      path: 'texts.nameKey',
      message: 'missing or malformed text key',
    });
  });

  it('refuses a malformed text key', () => {
    expectRefused(brokenCapybara({ texts: { nameKey: 'Capybara', signatureKey: 'a.b' } }), {
      path: 'texts.nameKey',
    });
  });

  it('refuses an invalid id', () => {
    expectRefused(brokenCapybara({ id: 'Capy Bara' }), {
      path: 'id',
      message: 'invalidIdCharacters',
    });
  });

  it('refuses an unknown field', () => {
    expectRefused(brokenCapybara({ colour: 'brown' }), { source: 'species[0] (capybara)' });
  });

  it('refuses a missing star reward', () => {
    const { 2: two, 3: three, 4: four } = capybara.starRewards;
    expectRefused(brokenCapybara({ starRewards: { 2: two, 3: three, 4: four } }), {
      path: 'starRewards.5',
    });
  });

  it('refuses a star that unlocks an unknown behavior', () => {
    const starRewards = {
      ...capybara.starRewards,
      2: { elements: ['puzzle-feeder'], unlocksBehavior: 'fly' },
    };
    expectRefused(brokenCapybara({ starRewards }), {
      path: 'starRewards.2.unlocksBehavior',
      message: 'behavior not in behaviors',
    });
  });

  it('refuses a behavior unlocked by two stars', () => {
    const starRewards = {
      ...capybara.starRewards,
      3: { elements: ['mud-wallow'], unlocksBehavior: 'forage-feeder' },
    };
    expectRefused(brokenCapybara({ starRewards }), {
      path: 'starRewards.3.unlocksBehavior',
      message: 'behavior unlocked by two stars',
    });
  });

  it('refuses a duplicated behavior', () => {
    const behaviors = [...capybara.behaviors, { id: 'graze', nameKey: 'behavior.graze' }];
    expectRefused(brokenCapybara({ behaviors }), {
      path: `behaviors.${String(capybara.behaviors.length)}`,
      message: 'duplicate "graze"',
    });
  });

  it('refuses an unknown biome', () => {
    expectRefused(brokenCapybara({ biome: 'moon' }), {
      source: 'species (capybara)',
      path: 'biome',
      message: 'unknown biome "moon"',
    });
  });

  it('refuses an unknown habitat element', () => {
    const starRewards = {
      ...capybara.starRewards,
      5: { elements: ['volcano'], unlocksBehavior: 'hot-bath-soak' },
    };
    expectRefused(brokenCapybara({ starRewards }), {
      path: 'starRewards.5.elements.0',
      message: 'unknown habitat element "volcano"',
    });
  });

  it('refuses a kit element of the wrong category', () => {
    const habitatKit = {
      ...capybara.habitatKit,
      ground: 'pond',
      water: null,
      vegetation: ['grass'],
    };
    const errors = errorsOf(brokenCapybara({ habitatKit }));
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: 'habitatKit.ground',
        message: '"pond" is a water, not a ground',
      }),
    );
    expect(errors).toContainEqual(expect.objectContaining({ path: 'habitatKit.vegetation.0' }));
  });

  it('refuses an element given both by the kit and by a star', () => {
    const starRewards = {
      ...capybara.starRewards,
      2: { elements: ['pond'], unlocksBehavior: 'forage-feeder' },
    };
    expectRefused(brokenCapybara({ starRewards }), {
      path: 'starRewards.2.elements.0',
      message: 'element "pond" given twice',
    });
  });

  it('refuses two species with the same id', () => {
    expectRefused(withSpecies(capybara, capybara), {
      source: 'species[1] (capybara)',
      path: 'id',
      message: 'duplicate id "capybara"',
    });
  });

  it('names an entry by its index when it has no readable id', () => {
    expectRefused(withSpecies('not a species'), { source: 'species[0]', path: '' });
  });
});

describe('invalid gacha rules and banners', () => {
  it('refuses rates that do not add up to 100 %', () => {
    const rarityRatesBp = { ...gachaRules.rarityRatesBp, iconic: 200 };
    expectRefused(withRules({ rarityRatesBp }), {
      source: 'gachaRules',
      path: 'rarityRatesBp',
      message: 'rates must add up to 10000 basis points',
    });
  });

  it('refuses a soft pity that starts after the iconic guarantee', () => {
    const pity = {
      ...gachaRules.pity,
      iconic: { guaranteedAt: 90, softPityStartArrival: 90 },
    };
    expectRefused(withRules({ pity }), { path: 'pity.iconic.softPityStartArrival' });
  });

  it('refuses guarantees that come earlier for rarer tiers', () => {
    const pity = { ...gachaRules.pity, veryRare: { guaranteedAt: 5 } };
    expectRefused(withRules({ pity }), {
      path: 'pity',
      message: 'guarantees must come later for rarer tiers',
    });
  });

  it('refuses a multi-arrival dearer than single arrivals', () => {
    expectRefused(withRules({ multiArrival: { count: 10, ticketCost: 11 } }), {
      path: 'multiArrival.ticketCost',
    });
  });

  it('requires a permanent banner', () => {
    const welcomeOnly = GAME_CONTENT.banners.filter(
      (banner) =>
        typeof banner === 'object' &&
        banner !== null &&
        'kind' in banner &&
        banner.kind === 'welcome',
    );
    expectRefused(
      { ...GAME_CONTENT, banners: welcomeOnly },
      {
        source: 'banners',
        message: 'a permanent banner is required',
      },
    );
  });

  it('refuses two welcome banners', () => {
    const banners = [...GAME_CONTENT.banners, { ...welcomeBanner, id: 'welcome-again' }];
    expectRefused(
      { ...GAME_CONTENT, banners },
      {
        source: 'banners',
        message: 'at most one welcome banner',
      },
    );
  });

  it('refuses an unknown banner kind', () => {
    expectRefused(
      { ...GAME_CONTENT, banners: [{ kind: 'seasonal', id: 'summer' }] },
      {
        source: 'banners[0] (summer)',
        path: 'kind',
      },
    );
  });
});

describe('invalid park content', () => {
  it('refuses enclosure sizes that do not grow', () => {
    expectRefused(
      {
        ...GAME_CONTENT,
        enclosureSizes: {
          S: { minAreaCells: 16 },
          M: { minAreaCells: 16 },
          L: { minAreaCells: 64 },
          XL: { minAreaCells: 144 },
        },
      },
      { source: 'enclosureSizes', message: 'each size must need more cells than the previous one' },
    );
  });

  it('refuses a building that reuses a habitat element id', () => {
    expectRefused(
      { ...GAME_CONTENT, buildings: [{ ...VALID_BUILDING, id: 'pond' }] },
      {
        source: 'buildings',
        message: 'id "pond" used by both habitatElements and buildings',
      },
    );
  });

  it('refuses a building with an empty footprint', () => {
    expectRefused(
      { ...GAME_CONTENT, buildings: [{ ...VALID_BUILDING, footprint: { width: 0, depth: 1 } }] },
      { path: 'footprint.width' },
    );
  });

  it('refuses a visitor group whose max is below its min', () => {
    expectRefused(
      {
        ...GAME_CONTENT,
        visitorArchetypes: [{ ...VALID_ARCHETYPE, groupSize: { min: 3, max: 2 } }],
      },
      { path: 'groupSize.max', message: 'max must be at least min' },
    );
  });

  it('refuses a need listed twice', () => {
    expectRefused(
      { ...GAME_CONTENT, visitorArchetypes: [{ ...VALID_ARCHETYPE, wants: ['rest', 'rest'] }] },
      { path: 'wants.1', message: 'duplicate "rest"' },
    );
  });
});

describe('error reporting', () => {
  it('reports the errors of every file at once', () => {
    const errors = errorsOf({
      ...brokenCapybara({ rarity: 'legendary' }),
      gachaRules: { ...gachaRules, arrivalTicketCost: 0 },
    });
    const sources = new Set(errors.map((error) => error.source));
    expect(sources).toEqual(new Set(['species[0] (capybara)', 'gachaRules']));
  });

  it('formats one readable line per error', () => {
    expect(
      formatDataErrors([
        { source: 'species[0] (capybara)', path: 'group.maxSize', message: 'too small' },
        { source: 'banners', path: '', message: 'a permanent banner is required' },
      ]),
    ).toBe(
      'species[0] (capybara) › group.maxSize: too small\nbanners › (root): a permanent banner is required',
    );
  });
});

function withRules(patch: Record<string, unknown>): RawGameData {
  return { ...GAME_CONTENT, gachaRules: { ...gachaRules, ...patch } };
}
