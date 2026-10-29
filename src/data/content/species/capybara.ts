import type { SpeciesInput } from '../../schemas/species';

export const capybara = {
  id: 'capybara',
  biome: 'tropical-americas',
  rarity: 'common',
  // Arrival size from the GDD bestiary; max = arrival + 3 (phase 1 brief).
  group: { arrivalSize: 4, maxSize: 7 },
  minEnclosureSize: 'M',
  // Starting value, balanced by the economy simulator (task 1.6).
  baseAttractiveness: 10,
  habitatKit: {
    ground: 'grass',
    water: 'pond',
    shelter: 'wooden-shelter',
    vegetation: ['tall-grass'],
  },
  starRewards: {
    2: { elements: ['puzzle-feeder'], unlocksBehavior: 'forage-feeder' },
    3: { elements: ['mud-wallow'], unlocksBehavior: 'mud-bath' },
    4: { elements: ['reed-shelter', 'panoramic-window'], unlocksBehavior: 'watch-visitors' },
    5: { elements: ['hot-bath'], unlocksBehavior: 'hot-bath-soak' },
  },
  behaviors: [
    { id: 'graze', nameKey: 'behavior.graze' },
    { id: 'swim', nameKey: 'behavior.swim' },
    { id: 'pile-sleep', nameKey: 'behavior.pileSleep' },
    { id: 'rest', nameKey: 'behavior.rest' },
    { id: 'forage-feeder', nameKey: 'behavior.forageFeeder' },
    { id: 'mud-bath', nameKey: 'behavior.mudBath' },
    { id: 'watch-visitors', nameKey: 'behavior.watchVisitors' },
    { id: 'hot-bath-soak', nameKey: 'behavior.hotBathSoak' },
  ],
  texts: { nameKey: 'species.capybara.name', signatureKey: 'species.capybara.signature' },
  modelId: 'capybara',
} satisfies SpeciesInput;
