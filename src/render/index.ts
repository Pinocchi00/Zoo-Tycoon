// Layer entry point: see AGENTS.md section 3.
export * from './park-view';
export * from './quality/quality';
export { createAnimalHerd, type SpeciesLook } from './animals/animal-herd';
export {
  CROSS_FADE_S,
  SWIM_REFERENCE_SPEED_MPS,
  WALK_REFERENCE_SPEED_MPS,
  swimClipScale,
  walkClipScale,
  walkPace,
  type AnimalSource,
} from './animals/animal-model';
