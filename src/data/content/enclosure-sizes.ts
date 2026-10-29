import type { EnclosureSizesInput } from '../schemas/species';

/** Minimum areas of the GDD ("Tailles d'enclos"): 4 × 4, 6 × 6, 8 × 8 and 12 × 12 cells. */
export const enclosureSizes = {
  S: { minAreaCells: 16 },
  M: { minAreaCells: 36 },
  L: { minAreaCells: 64 },
  XL: { minAreaCells: 144 },
} satisfies EnclosureSizesInput;
