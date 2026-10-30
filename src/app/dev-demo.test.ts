import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGameContent, type GameData } from '@/data';
import { logger } from '@/shared';
import { createEventQueue, outlineCells, type GridPoint } from '@/sim';
import { buildAnimalDemo } from './dev-demo';

function gameData(): GameData {
  const loaded = loadGameContent();
  if (!loaded.ok) {
    throw new Error('the game data must load');
  }
  return loaded.value;
}

function isConvex(outline: readonly GridPoint[]): boolean {
  let turn = 0;
  for (const [index, a] of outline.entries()) {
    const b = outline[(index + 1) % outline.length];
    const c = outline[(index + 2) % outline.length];
    if (b === undefined || c === undefined) {
      return false;
    }
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) {
      if (turn !== 0 && Math.sign(cross) !== turn) {
        return false;
      }
      turn = Math.sign(cross);
    }
  }
  return true;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the animal demo park', () => {
  it('builds without a single refused command', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    buildAnimalDemo(gameData(), createEventQueue());
    expect(warn).not.toHaveBeenCalled();
  });

  it('has five inhabited enclosures, one per species, each big enough, one not convex', () => {
    const data = gameData();
    const state = buildAnimalDemo(data, createEventQueue());
    expect(state.enclosures).toHaveLength(5);
    const species = state.enclosures.map((enclosure) => enclosure.speciesId);
    expect(new Set(species).size).toBe(5);
    expect(species.every((id) => id !== null)).toBe(true);
    for (const enclosure of state.enclosures) {
      const home = enclosure.speciesId === null ? undefined : data.species.get(enclosure.speciesId);
      expect(home).toBeDefined();
      const wanted = home ? data.enclosureSizes[home.minEnclosureSize].minAreaCells : Infinity;
      expect(outlineCells(enclosure.outline, data.terrain.columns).length).toBeGreaterThanOrEqual(
        wanted,
      );
    }
    expect(state.enclosures.some((enclosure) => !isConvex(enclosure.outline))).toBe(true);
  });

  it('lets some species show several habitat stars', () => {
    const state = buildAnimalDemo(gameData(), createEventQueue());
    expect(state.gacha.collection).toHaveLength(5);
    expect(state.gacha.collection.filter((progress) => progress.stars >= 3).length).toBeGreaterThan(
      1,
    );
  });

  it('is the same park every time', () => {
    const data = gameData();
    const first = buildAnimalDemo(data, createEventQueue());
    const second = buildAnimalDemo(data, createEventQueue());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
