import type { BuildingInput, DecorInput, VisitorArchetypeInput } from '../schemas/park';

/** The slice's services (task 1.4): prices and upkeep balanced by task 1.6. */
export const buildings: readonly BuildingInput[] = [
  {
    id: 'bench',
    category: 'comfort',
    nameKey: 'building.bench',
    footprint: { width: 2, depth: 1 },
    coinCost: 30,
    upkeepCoinsPerHour: 2,
    requiresPath: true,
    serves: ['rest'],
    visitorUse: { seconds: 20, priceCoins: 0 },
  },
  {
    id: 'litter-bin',
    category: 'comfort',
    nameKey: 'building.litterBin',
    footprint: { width: 1, depth: 1 },
    coinCost: 15,
    upkeepCoinsPerHour: 1,
    requiresPath: true,
    serves: ['comfort'],
    visitorUse: { seconds: 3, priceCoins: 0 },
  },
  {
    id: 'water-fountain',
    category: 'food',
    nameKey: 'building.waterFountain',
    footprint: { width: 1, depth: 1 },
    coinCost: 40,
    upkeepCoinsPerHour: 3,
    requiresPath: true,
    serves: ['foodDrink'],
    visitorUse: { seconds: 5, priceCoins: 0 },
  },
  {
    id: 'ice-cream-kiosk',
    category: 'food',
    nameKey: 'building.iceCreamKiosk',
    footprint: { width: 3, depth: 2 },
    coinCost: 200,
    upkeepCoinsPerHour: 12,
    requiresPath: true,
    serves: ['foodDrink'],
    visitorUse: { seconds: 15, priceCoins: 3 },
  },
  {
    id: 'toilets',
    category: 'comfort',
    nameKey: 'building.toilets',
    footprint: { width: 3, depth: 3 },
    coinCost: 250,
    upkeepCoinsPerHour: 15,
    requiresPath: true,
    serves: ['comfort'],
    visitorUse: { seconds: 30, priceCoins: 0 },
  },
];

// The slice has no decor.
export const decor: readonly DecorInput[] = [];

/** The slice's five archetypes (task 1.5): starting values, to be balanced by task 1.6. */
export const visitorArchetypes: readonly VisitorArchetypeInput[] = [
  {
    id: 'stroller-family',
    nameKey: 'visitor.archetype.strollerFamily',
    spawnWeight: 3,
    groupSize: { min: 3, max: 4 },
    wants: ['comfort', 'rest'],
    walkSpeedMmPerSecond: 1000,
    visitMinutes: 10,
  },
  {
    id: 'shoulder-ride',
    nameKey: 'visitor.archetype.shoulderRide',
    spawnWeight: 3,
    groupSize: { min: 2, max: 2 },
    wants: ['wonder', 'foodDrink'],
    walkSpeedMmPerSecond: 1200,
    visitMinutes: 8,
  },
  {
    id: 'couple',
    nameKey: 'visitor.archetype.couple',
    spawnWeight: 3,
    groupSize: { min: 2, max: 2 },
    wants: ['rest', 'foodDrink'],
    walkSpeedMmPerSecond: 1100,
    visitMinutes: 10,
  },
  {
    id: 'teen-photographer',
    nameKey: 'visitor.archetype.teenPhotographer',
    spawnWeight: 2,
    groupSize: { min: 1, max: 1 },
    wants: ['wonder'],
    walkSpeedMmPerSecond: 1300,
    visitMinutes: 6,
  },
  {
    id: 'retirees',
    nameKey: 'visitor.archetype.retirees',
    spawnWeight: 2,
    groupSize: { min: 2, max: 2 },
    wants: ['rest', 'comfort'],
    walkSpeedMmPerSecond: 800,
    visitMinutes: 12,
  },
];
