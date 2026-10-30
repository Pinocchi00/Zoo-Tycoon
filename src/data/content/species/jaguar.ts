import type { SpeciesInput } from '../../schemas/species';

export const jaguar = {
  id: 'jaguar',
  biome: 'tropical-americas',
  rarity: 'veryRare',
  // Arrival size from the GDD bestiary; max = arrival + 3 (phase 1 brief).
  group: { arrivalSize: 2, maxSize: 5 },
  minEnclosureSize: 'L',
  // Starting value, balanced by the economy simulator (task 1.6).
  baseAttractiveness: 30,
  habitatKit: {
    ground: 'forest-litter',
    water: 'pond',
    shelter: 'wooden-shelter',
    vegetation: ['tropical-shrubs'],
  },
  starRewards: {
    2: { elements: ['scratching-log'], unlocksBehavior: 'claw-marking' },
    3: { elements: ['climbing-tree'], unlocksBehavior: 'tree-rest' },
    4: { elements: ['rock-cave', 'observation-cabin'], unlocksBehavior: 'stalk' },
    5: { elements: ['deep-pool'], unlocksBehavior: 'water-hunt' },
  },
  behaviors: [
    { id: 'patrol', nameKey: 'behavior.patrol' },
    { id: 'swim', nameKey: 'behavior.swim' },
    { id: 'rest', nameKey: 'behavior.rest' },
    { id: 'claw-marking', nameKey: 'behavior.clawMarking' },
    { id: 'tree-rest', nameKey: 'behavior.treeRest' },
    { id: 'stalk', nameKey: 'behavior.stalk' },
    { id: 'water-hunt', nameKey: 'behavior.waterHunt' },
  ],
  texts: { nameKey: 'species.jaguar.name', signatureKey: 'species.jaguar.signature' },
  modelId: 'jaguar',
} satisfies SpeciesInput;
