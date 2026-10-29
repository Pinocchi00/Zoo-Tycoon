import type { HabitatElementInput } from '../schemas/species';

export const habitatElements = [
  { id: 'grass', category: 'ground', nameKey: 'habitat.grass' },
  { id: 'pond', category: 'water', nameKey: 'habitat.pond' },
  { id: 'mud-wallow', category: 'water', nameKey: 'habitat.mudWallow' },
  { id: 'hot-bath', category: 'water', nameKey: 'habitat.hotBath' },
  { id: 'tall-grass', category: 'vegetation', nameKey: 'habitat.tallGrass' },
  { id: 'wooden-shelter', category: 'shelter', nameKey: 'habitat.woodenShelter' },
  { id: 'reed-shelter', category: 'shelter', nameKey: 'habitat.reedShelter' },
  { id: 'puzzle-feeder', category: 'enrichment', nameKey: 'habitat.puzzleFeeder' },
  { id: 'panoramic-window', category: 'viewpoint', nameKey: 'habitat.panoramicWindow' },
] satisfies readonly HabitatElementInput[];
