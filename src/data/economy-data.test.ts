import { describe, expect, it } from 'vitest';
import { GAME_CONTENT } from './content';
import { economyRules } from './content/economy';
import { loadGameContent, loadGameData, type DataError } from './index';
import type { RawGameData } from './load';

function errorsOf(raw: RawGameData): readonly DataError[] {
  const result = loadGameData(raw);
  if (result.ok) {
    throw new Error('expected the data to be refused');
  }
  return result.error;
}

function expectRefused(patch: Record<string, unknown>, expected: Partial<DataError>): void {
  const raw = { ...GAME_CONTENT, economyRules: { ...economyRules, ...patch } };
  expect(errorsOf(raw)).toContainEqual(expect.objectContaining(expected));
}

const [firstLevel, secondLevel] = economyRules.parkLevels;

describe('economy data of the slice', () => {
  it('loads the economy rules, and every building has its upkeep and its unlock level', () => {
    const loaded = loadGameContent();
    if (!loaded.ok) {
      throw new Error('the slice content is valid');
    }
    const { economyRules: rules, buildings } = loaded.value;
    expect(rules.parkLevels[0]?.stars).toBe(0);
    const unlocked = rules.parkLevels.flatMap((level) => level.unlocksBuildings);
    expect([...buildings.keys()].sort()).toEqual([...unlocked].sort());
    expect([...buildings.values()].every((building) => building.upkeepCoinsPerHour >= 0)).toBe(
      true,
    );
  });

  it('refuses a default or fair price above the max', () => {
    const entryPrice = economyRules.entryPrice;
    expectRefused(
      { entryPrice: { ...entryPrice, defaultCoins: entryPrice.maxCoins + 1 } },
      { source: 'economyRules', path: 'entryPrice.defaultCoins' },
    );
    expectRefused(
      { entryPrice: { ...entryPrice, fairCoins: entryPrice.maxCoins + 1 } },
      { source: 'economyRules', path: 'entryPrice.fairCoins' },
    );
  });

  it('refuses a first level that needs stars, or levels that do not rise', () => {
    expectRefused(
      { parkLevels: [{ ...firstLevel, stars: 3 }] },
      { source: 'economyRules', path: 'parkLevels.0.stars' },
    );
    expectRefused(
      { parkLevels: [firstLevel, { ...secondLevel, stars: 0 }] },
      { source: 'economyRules', path: 'parkLevels.1.stars' },
    );
    expectRefused({ parkLevels: [] }, { source: 'economyRules', path: 'parkLevels' });
  });

  it('refuses an unknown building, a building unlocked twice or never', () => {
    expectRefused(
      {
        parkLevels: [
          { ...firstLevel, unlocksBuildings: [...(firstLevel?.unlocksBuildings ?? []), 'castle'] },
        ],
      },
      { source: 'economyRules', message: 'unknown building "castle"' },
    );
    expectRefused(
      { parkLevels: [firstLevel, { ...secondLevel, unlocksBuildings: ['bench'] }] },
      { source: 'economyRules', message: 'duplicate "bench"' },
    );
    expectRefused(
      { parkLevels: [firstLevel] },
      { source: 'economyRules', message: 'building "toilets" is never unlocked by a park level' },
    );
  });

  it('refuses missing economy rules', () => {
    expect(errorsOf({ ...GAME_CONTENT, economyRules: null })).toContainEqual(
      expect.objectContaining({ source: 'economyRules' }),
    );
  });
});
