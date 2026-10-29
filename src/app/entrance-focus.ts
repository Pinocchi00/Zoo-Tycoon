import type { Terrain } from '@/data';
import { cellCenterX, cellCenterZ, createGridSize, type GridSize } from '@/shared';

export function terrainGrid(terrain: Terrain): GridSize {
  return createGridSize(terrain.columns, terrain.rows);
}

/** Centre of the entrance rectangle in world metres: where the camera looks at the start. */
export function entranceFocus(terrain: Terrain): { x: number; z: number } {
  const grid = terrainGrid(terrain);
  const { entrance } = terrain;
  return {
    x: cellCenterX(grid, entrance.column) + (entrance.width - 1) / 2,
    z: cellCenterZ(grid, entrance.row) + (entrance.depth - 1) / 2,
  };
}
