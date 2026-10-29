import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { drawArrival, pickInTier, recordArrivalRarity } from './draw';
import { createGachaTables, type ArrivalsSince } from './rates';
import { sliceGameData, syntheticGameData } from './test-support';

const synthetic = syntheticGameData();
const fullTables = createGachaTables(synthetic.gachaRules, synthetic.species);
const slice = sliceGameData();
const sliceTables = createGachaTables(slice.gachaRules, slice.species);

describe('recordArrivalRarity', () => {
  it('resets the counters of the tier drawn and every more common one', () => {
    const since: ArrivalsSince = { rare: 5, veryRare: 30, iconic: 80 };
    recordArrivalRarity(fullTables, since, 'common');
    expect(since).toEqual({ rare: 6, veryRare: 31, iconic: 81 });
    recordArrivalRarity(fullTables, since, 'rare');
    expect(since).toEqual({ rare: 0, veryRare: 32, iconic: 82 });
    recordArrivalRarity(fullTables, since, 'veryRare');
    expect(since).toEqual({ rare: 0, veryRare: 0, iconic: 83 });
    recordArrivalRarity(fullTables, since, 'iconic');
    expect(since).toEqual({ rare: 0, veryRare: 0, iconic: 0 });
  });

  it('freezes the counter of a sleeping guarantee', () => {
    const since: ArrivalsSince = { rare: 0, veryRare: 0, iconic: 0 };
    recordArrivalRarity(sliceTables, since, 'common');
    expect(since).toEqual({ rare: 1, veryRare: 1, iconic: 0 });
  });
});

describe('drawArrival', () => {
  it('returns a species of the drawn tier, the same for the same seed', () => {
    const since: ArrivalsSince = { rare: 0, veryRare: 0, iconic: 0 };
    const first = drawArrival(fullTables, since, createRng(3));
    const second = drawArrival(fullTables, since, createRng(3));
    expect(first).toEqual(second);
    expect(synthetic.species.get(first.speciesId)?.rarity).toBe(first.rarity);
  });

  it('honours a due guarantee on the slice, whose very rare tier holds the iconic rate', () => {
    const rng = createRng(11);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const drawn = drawArrival(sliceTables, { rare: 0, veryRare: 39, iconic: 0 }, rng);
      expect(drawn.speciesId).toBe('jaguar');
    }
  });

  it('refuses to pick in an empty tier', () => {
    expect(() => pickInTier(sliceTables, 'iconic', createRng(1))).toThrow(Error);
  });
});
