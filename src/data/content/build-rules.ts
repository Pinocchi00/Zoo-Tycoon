import type { BuildRulesInput, PathSurfaceInput } from '../schemas/build';

/**
 * Starting values of task 1.4, to be balanced by task 1.6. Enclosures are free: the habitat
 * comes with the animals of the arrival.
 */
export const buildRules = {
  enclosure: { maxAreaCells: 1024, maxOutlinePoints: 32 },
  refundRateBp: 10_000,
  view: { rangeCells: 4, maxScore: 5, viewpointBonus: 1 },
} satisfies BuildRulesInput;

/** The four path surfaces of the GDD ("Construire"), priced per cell. */
export const pathSurfaces: readonly PathSurfaceInput[] = [
  { id: 'packed-earth', nameKey: 'pathSurface.packedEarth', coinCostPerCell: 1 },
  { id: 'gravel', nameKey: 'pathSurface.gravel', coinCostPerCell: 2 },
  { id: 'pavers', nameKey: 'pathSurface.pavers', coinCostPerCell: 3 },
  { id: 'boardwalk', nameKey: 'pathSurface.boardwalk', coinCostPerCell: 4 },
];
