import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_CONTENT } from '../../src/data/content';
import { loadGameData } from '../../src/data/load';

const ROOT = resolve(import.meta.dirname, '..', '..');

describe('species models', () => {
  const loaded = loadGameData(GAME_CONTENT);
  const species = loaded.ok ? [...loaded.value.species.values()] : [];

  it('loads the game content', () => {
    expect(loaded.ok).toBe(true);
  });

  it.each(species.map((entry) => [entry.id, entry.modelId]))(
    '%s has its model and its Blender description',
    (_id, modelId) => {
      expect(existsSync(resolve(ROOT, 'assets', 'models', `${modelId}.glb`))).toBe(true);
      expect(existsSync(resolve(ROOT, 'tools', 'blender', 'species', `${modelId}.json`))).toBe(
        true,
      );
    },
  );
});
