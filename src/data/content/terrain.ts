import type { TerrainInput } from '../schemas/build';

/**
 * Starting land of D-018: 256 × 256 cells (256 m). The entrance (8 × 3) is in the middle of the
 * south edge, and the two parking areas (12 × 10) lie just outside, on each side of it.
 */
export const terrain = {
  columns: 256,
  rows: 256,
  entrance: { column: 124, row: 253, width: 8, depth: 3 },
  parking: [
    { column: 108, row: 256, width: 12, depth: 10 },
    { column: 136, row: 256, width: 12, depth: 10 },
  ],
} satisfies TerrainInput;
