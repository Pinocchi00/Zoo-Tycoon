// Layer entry point: see AGENTS.md section 3.
export * from './park-view';
export * from './quality/quality';
// The herd and the pace of the feet are exported for the test of the demo park (src/app).
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
