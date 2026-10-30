import type { SpeciesInput } from '../../schemas/species';

export const lowlandTapir = {
  id: 'lowland-tapir',
  biome: 'tropical-americas',
  rarity: 'uncommon',
  // Arrival size from the GDD bestiary; max = arrival + 3 (phase 1 brief).
  group: { arrivalSize: 2, maxSize: 5 },
  minEnclosureSize: 'L',
  // Starting value, balanced by the economy simulator (task 1.6).
  baseAttractiveness: 15,
  habitatKit: {
    ground: 'forest-litter',
    water: 'pond',
    shelter: 'wooden-shelter',
    vegetation: ['tropical-shrubs'],
  },
  starRewards: {
    2: { elements: ['browse-rack'], unlocksBehavior: 'grab-with-trunk' },
    3: { elements: ['deep-pool'], unlocksBehavior: 'underwater-walk' },
    4: { elements: ['thatched-hut', 'panoramic-window'], unlocksBehavior: 'snorkel' },
    5: { elements: ['scratching-brush'], unlocksBehavior: 'scratch-flop' },
  },
  behaviors: [
    { id: 'browse', nameKey: 'behavior.browse' },
    { id: 'swim', nameKey: 'behavior.swim' },
    { id: 'rest', nameKey: 'behavior.rest' },
    { id: 'grab-with-trunk', nameKey: 'behavior.grabWithTrunk' },
    { id: 'underwater-walk', nameKey: 'behavior.underwaterWalk' },
    { id: 'snorkel', nameKey: 'behavior.snorkel' },
    { id: 'scratch-flop', nameKey: 'behavior.scratchFlop' },
  ],
  texts: { nameKey: 'species.lowlandTapir.name', signatureKey: 'species.lowlandTapir.signature' },
  modelId: 'lowland_tapir',
} satisfies SpeciesInput;
