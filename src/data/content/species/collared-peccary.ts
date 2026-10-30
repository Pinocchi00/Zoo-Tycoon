import type { SpeciesInput } from '../../schemas/species';

export const collaredPeccary = {
  id: 'collared-peccary',
  biome: 'tropical-americas',
  rarity: 'common',
  // Arrival size from the GDD bestiary; max = arrival + 3 (phase 1 brief).
  group: { arrivalSize: 5, maxSize: 8 },
  minEnclosureSize: 'M',
  // Starting value, balanced by the economy simulator (task 1.6).
  baseAttractiveness: 10,
  habitatKit: {
    ground: 'forest-litter',
    water: 'pond',
    shelter: 'wooden-shelter',
    vegetation: ['tropical-shrubs'],
  },
  starRewards: {
    2: { elements: ['puzzle-feeder'], unlocksBehavior: 'forage-feeder' },
    3: { elements: ['mud-wallow'], unlocksBehavior: 'mud-bath' },
    4: { elements: ['rock-cave', 'raised-walkway'], unlocksBehavior: 'mutual-rubbing' },
    5: { elements: ['prickly-pear-patch'], unlocksBehavior: 'eat-cactus' },
  },
  behaviors: [
    { id: 'root', nameKey: 'behavior.root' },
    { id: 'pile-sleep', nameKey: 'behavior.pileSleep' },
    { id: 'rest', nameKey: 'behavior.rest' },
    { id: 'forage-feeder', nameKey: 'behavior.forageFeeder' },
    { id: 'mud-bath', nameKey: 'behavior.mudBath' },
    { id: 'mutual-rubbing', nameKey: 'behavior.mutualRubbing' },
    { id: 'eat-cactus', nameKey: 'behavior.eatCactus' },
  ],
  texts: {
    nameKey: 'species.collaredPeccary.name',
    signatureKey: 'species.collaredPeccary.signature',
  },
  modelId: 'collared_peccary',
} satisfies SpeciesInput;
