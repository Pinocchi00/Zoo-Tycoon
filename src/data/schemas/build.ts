import { z } from 'zod';
import { itemId } from '../../shared/brand';
import {
  BASIS_POINTS_TOTAL,
  brandedId,
  nonNegativeInt,
  positiveInt,
  textKeySchema,
} from './common';

/** A rectangle of cells; `column` and `row` are its north-west cell. */
const cellRectSchema = z.strictObject({
  column: z.int(),
  row: z.int(),
  width: positiveInt,
  depth: positiveInt,
});
export type CellRect = z.output<typeof cellRectSchema>;

/**
 * The land the park is built on (D-018). Row 0 is the north edge, the last row the south edge.
 * The entrance sits inside the land, in the middle of the south edge; the two parking areas lie
 * just outside it, one on each side of the entrance.
 */
export const terrainSchema = z
  .strictObject({
    columns: positiveInt,
    rows: positiveInt,
    entrance: cellRectSchema,
    parking: z.tuple([cellRectSchema, cellRectSchema]),
  })
  .superRefine((terrain, context) => {
    const { entrance, parking } = terrain;
    const entranceEnd = entrance.column + entrance.width;
    if (entrance.column < 0 || entranceEnd > terrain.columns || entrance.row < 0) {
      context.addIssue({
        code: 'custom',
        message: 'entrance outside the land',
        path: ['entrance'],
      });
    }
    if (entrance.row + entrance.depth !== terrain.rows) {
      const message = 'entrance must touch the south edge';
      context.addIssue({ code: 'custom', message, path: ['entrance'] });
    }
    // Centred: as much land on the west side as on the east side.
    if (entrance.column !== terrain.columns - entranceEnd) {
      const message = 'entrance must be in the middle of the south edge';
      context.addIssue({ code: 'custom', message, path: ['entrance'] });
    }
    const [west, east] = parking;
    if (west.row !== terrain.rows || east.row !== terrain.rows) {
      const message = 'parking must lie just outside the south edge';
      context.addIssue({ code: 'custom', message, path: ['parking'] });
    }
    if (west.column + west.width > entrance.column || east.column < entranceEnd) {
      const message = 'parking areas must lie west and east of the entrance';
      context.addIssue({ code: 'custom', message, path: ['parking'] });
    }
  });
export type Terrain = z.output<typeof terrainSchema>;
export type TerrainInput = z.input<typeof terrainSchema>;

export const pathSurfaceSchema = z.strictObject({
  id: brandedId(itemId),
  nameKey: textKeySchema,
  coinCostPerCell: nonNegativeInt,
});
export type PathSurface = z.output<typeof pathSurfaceSchema>;
export type PathSurfaceInput = z.input<typeof pathSurfaceSchema>;

/** Fewest corners of a closed outline: a triangle. */
const MIN_OUTLINE_POINTS = 3;

export const buildRulesSchema = z.strictObject({
  enclosure: z.strictObject({
    /** Upper bound that keeps the cell and view computations small. */
    maxAreaCells: positiveInt,
    maxOutlinePoints: z.int().min(MIN_OUTLINE_POINTS),
  }),
  /** Share of the price given back on removal, in basis points. */
  refundRateBp: z.int().min(0).max(BASIS_POINTS_TOTAL),
  view: z
    .strictObject({
      /** How far a visitor on a path sees into an enclosure, in cells (Chebyshev distance). */
      rangeCells: positiveInt,
      maxScore: positiveInt,
      /** Added when the group's stars unlocked a viewpoint element. */
      viewpointBonus: nonNegativeInt,
    })
    .refine((view) => view.viewpointBonus < view.maxScore, {
      message: 'viewpointBonus must be below maxScore',
      path: ['viewpointBonus'],
    }),
});
export type BuildRules = z.output<typeof buildRulesSchema>;
export type BuildRulesInput = z.input<typeof buildRulesSchema>;
