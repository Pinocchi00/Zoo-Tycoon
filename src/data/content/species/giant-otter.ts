import type { SpeciesInput } from '../../schemas/species';

export const giantOtter = {
  id: 'giant-otter',
  biome: 'tropical-americas',
  rarity: 'rare',
  // Arrival size from the GDD bestiary; max = arrival + 3 (phase 1 brief).
  group: { arrivalSize: 4, maxSize: 7 },
  minEnclosureSize: 'M',
  // Starting value, balanced by the economy simulator (task 1.6).
  baseAttractiveness: 22,
  habitatKit: {
    ground: 'sand',
    water: 'river',
    shelter: 'burrow',
    vegetation: ['riverside-ferns'],
  },
  starRewards: {
    2: { elements: ['fish-feeder'], unlocksBehavior: 'group-hunt' },
    3: { elements: ['waterfall'], unlocksBehavior: 'periscope' },
    4: { elements: ['glass-den', 'pontoon'], unlocksBehavior: 'rest' },
    5: { elements: ['floating-log'], unlocksBehavior: 'log-rest' },
  },
  behaviors: [
    { id: 'swim', nameKey: 'behavior.swim' },
    { id: 'catch-fish', nameKey: 'behavior.catchFish' },
    { id: 'contact-call', nameKey: 'behavior.contactCall' },
    { id: 'pile-sleep', nameKey: 'behavior.pileSleep' },
    { id: 'group-hunt', nameKey: 'behavior.groupHunt' },
    { id: 'periscope', nameKey: 'behavior.periscope' },
    { id: 'rest', nameKey: 'behavior.rest' },
    { id: 'log-rest', nameKey: 'behavior.logRest' },
  ],
  texts: { nameKey: 'species.giantOtter.name', signatureKey: 'species.giantOtter.signature' },
  modelId: null,
} satisfies SpeciesInput;
