import { describe, expect, it } from 'vitest';
import { loadGameContent, type Terrain } from '@/data';
import { entranceFocus, terrainGrid } from './entrance-focus';

function terrainOfRealData(): Terrain {
  const loaded = loadGameContent();
  if (!loaded.ok) {
    throw new Error('The game data must be valid.');
  }
  return loaded.value.terrain;
}

describe('entrance focus', () => {
  it('centres the entrance of the real land on the middle of the south edge', () => {
    const focus = entranceFocus(terrainOfRealData());
    expect(focus.x).toBe(0);
    expect(focus.z).toBe(126.5);
  });

  it('sizes the grid from the land', () => {
    const terrain = terrainOfRealData();
    expect(terrainGrid(terrain)).toEqual({ columns: terrain.columns, rows: terrain.rows });
  });
});
