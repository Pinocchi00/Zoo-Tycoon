import { loadAnimalSource, type AnimalSource } from './animal-model';

// Vite resolves each model to the URL it is served from, so a species only names its file.
const MODEL_URLS = import.meta.glob<string>('../../../assets/models/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});

const MODEL_FOLDER = '../../../assets/models/';

/** Where `assets/models/<modelId>.glb` is served from, or undefined when there is no such file. */
export function modelUrl(modelId: string): string | undefined {
  return MODEL_URLS[`${MODEL_FOLDER}${modelId}.glb`];
}

/** Downloads `assets/models/<modelId>.glb`; rejects when the species names a file that is missing. */
export function loadSpeciesModel(modelId: string): Promise<AnimalSource> {
  const url = modelUrl(modelId);
  if (url === undefined) {
    return Promise.reject(new Error(`No model file assets/models/${modelId}.glb.`));
  }
  return loadAnimalSource(url);
}
