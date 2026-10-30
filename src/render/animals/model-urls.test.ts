import { describe, expect, it } from 'vitest';
import { formatDataErrors, loadGameContent } from '@/data';
import { modelUrl } from './model-urls';

describe('model files', () => {
  it('exist for every species that names a model', () => {
    const loaded = loadGameContent();
    if (!loaded.ok) {
      throw new Error(formatDataErrors(loaded.error));
    }
    const named = [...loaded.value.species.values()].flatMap((species) =>
      species.modelId === null ? [] : [species.modelId],
    );
    expect(named.length).toBeGreaterThan(0);
    for (const modelId of named) {
      expect(modelUrl(modelId), modelId).toEqual(expect.stringContaining(`${modelId}.glb`));
    }
  });

  it('has no url for a model that does not exist', () => {
    expect(modelUrl('no_such_animal')).toBeUndefined();
  });
});
