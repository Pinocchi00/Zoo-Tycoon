import { MAX_HABITAT_STARS, type Species } from '../../data/schemas/species';
import type { SpeciesProgress } from './gacha-state';

/** What one arrival of a species changed in the refuge. */
export interface ReceiveOutcome {
  readonly isNew: boolean;
  readonly stars: number;
  readonly groupSize: number;
  /** True when the habitat had five stars and the group its maximum size already. */
  readonly wasComplete: boolean;
}

export function findProgress(
  collection: readonly SpeciesProgress[],
  species: Species,
): SpeciesProgress | undefined {
  return collection.find((progress) => progress.speciesId === species.id);
}

export function isComplete(progress: SpeciesProgress, species: Species): boolean {
  return progress.stars >= MAX_HABITAT_STARS && progress.groupSize >= species.group.maxSize;
}

/**
 * The first arrival brings star 1 (the habitat kit) and the arrival group. Each duplicate adds a
 * star up to five and, alongside, one animal up to the maximum group size.
 */
export function receiveSpecies(collection: SpeciesProgress[], species: Species): ReceiveOutcome {
  const progress = findProgress(collection, species);
  if (progress === undefined) {
    const created = { speciesId: species.id, stars: 1, groupSize: species.group.arrivalSize };
    collection.push(created);
    return { isNew: true, stars: created.stars, groupSize: created.groupSize, wasComplete: false };
  }
  const wasComplete = isComplete(progress, species);
  if (progress.stars < MAX_HABITAT_STARS) {
    progress.stars += 1;
  }
  if (progress.groupSize < species.group.maxSize) {
    progress.groupSize += 1;
  }
  return { isNew: false, stars: progress.stars, groupSize: progress.groupSize, wasComplete };
}
