import { describe, expect, it } from 'vitest';
import type { Species } from '../../data/schemas/species';
import { isComplete, receiveSpecies } from './collection';
import type { SpeciesProgress } from './gacha-state';
import { sliceGameData, testSpeciesId } from './test-support';

const capybaraData = sliceGameData().species.get(testSpeciesId('capybara'));
if (capybaraData === undefined) {
  throw new Error('The slice has a capybara.');
}
const capybara: Species = capybaraData;
const { arrivalSize, maxSize } = capybara.group;

describe('receiveSpecies', () => {
  it('brings star 1 and the arrival group the first time', () => {
    const collection: SpeciesProgress[] = [];
    expect(receiveSpecies(collection, capybara)).toEqual({
      isNew: true,
      stars: 1,
      groupSize: arrivalSize,
      wasComplete: false,
    });
    expect(collection).toEqual([{ speciesId: capybara.id, stars: 1, groupSize: arrivalSize }]);
  });

  it('adds a star and an animal per duplicate: four duplicates lead to five stars', () => {
    const collection: SpeciesProgress[] = [];
    receiveSpecies(collection, capybara);
    const outcomes = [1, 2, 3, 4].map(() => receiveSpecies(collection, capybara));
    expect(outcomes.map((outcome) => outcome.stars)).toEqual([2, 3, 4, 5]);
    expect(outcomes.map((outcome) => outcome.groupSize)).toEqual([
      arrivalSize + 1,
      arrivalSize + 2,
      arrivalSize + 3,
      maxSize,
    ]);
    expect(outcomes.every((outcome) => !outcome.wasComplete && !outcome.isNew)).toBe(true);
  });

  it('keeps growing the group after five stars, until its maximum size', () => {
    const collection: SpeciesProgress[] = [{ speciesId: capybara.id, stars: 5, groupSize: 1 }];
    expect(receiveSpecies(collection, capybara)).toMatchObject({ stars: 5, groupSize: 2 });
  });

  it('keeps adding stars when the group is already at its maximum', () => {
    const collection: SpeciesProgress[] = [
      { speciesId: capybara.id, stars: 2, groupSize: maxSize },
    ];
    expect(receiveSpecies(collection, capybara)).toMatchObject({ stars: 3, groupSize: maxSize });
  });

  it('changes nothing once complete, and says so', () => {
    const collection: SpeciesProgress[] = [
      { speciesId: capybara.id, stars: 5, groupSize: maxSize },
    ];
    expect(receiveSpecies(collection, capybara)).toEqual({
      isNew: false,
      stars: 5,
      groupSize: maxSize,
      wasComplete: true,
    });
    const [progress] = collection;
    expect(progress === undefined ? false : isComplete(progress, capybara)).toBe(true);
  });
});
