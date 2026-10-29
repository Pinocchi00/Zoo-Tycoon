import type { BuildingInput, DecorInput, VisitorArchetypeInput } from '../schemas/park';

/** The slice's services (task 1.4): starting prices, to be balanced by task 1.6. */
export const buildings: readonly BuildingInput[] = [
  {
    id: 'bench',
    category: 'comfort',
    nameKey: 'building.bench',
    footprint: { width: 2, depth: 1 },
    coinCost: 30,
    requiresPath: true,
    serves: ['rest'],
  },
  {
    id: 'litter-bin',
    category: 'comfort',
    nameKey: 'building.litterBin',
    footprint: { width: 1, depth: 1 },
    coinCost: 15,
    requiresPath: true,
    serves: ['comfort'],
  },
  {
    id: 'water-fountain',
    category: 'food',
    nameKey: 'building.waterFountain',
    footprint: { width: 1, depth: 1 },
    coinCost: 40,
    requiresPath: true,
    serves: ['foodDrink'],
  },
  {
    id: 'ice-cream-kiosk',
    category: 'food',
    nameKey: 'building.iceCreamKiosk',
    footprint: { width: 3, depth: 2 },
    coinCost: 200,
    requiresPath: true,
    serves: ['foodDrink'],
  },
  {
    id: 'toilets',
    category: 'comfort',
    nameKey: 'building.toilets',
    footprint: { width: 3, depth: 3 },
    coinCost: 250,
    requiresPath: true,
    serves: ['comfort'],
  },
];

// Visitor archetypes are filled by task 1.5. The slice has no decor.
export const decor: readonly DecorInput[] = [];
export const visitorArchetypes: readonly VisitorArchetypeInput[] = [];
