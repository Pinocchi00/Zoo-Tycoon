import type { BuildingInput, DecorInput, VisitorArchetypeInput } from '../schemas/park';

// Filled by the tasks that set their numbers: buildings (1.4), visitor archetypes (1.5).
// The slice has no decor.
export const buildings: readonly BuildingInput[] = [];
export const decor: readonly DecorInput[] = [];
export const visitorArchetypes: readonly VisitorArchetypeInput[] = [];
