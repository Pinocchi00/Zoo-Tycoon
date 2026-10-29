import type { FocusArea } from '@/sim';
import { CELL_SIZE_M, gridDepth, gridWidth, type GridSize } from '@/shared';
import { ISO_PITCH_RAD, type CameraPose } from './camera-rig';

/** Extra ground around the visible disc, because the camera turns and the edges move. */
export const FOCUS_MARGIN = 0.25;

const SIN_PITCH = Math.sin(ISO_PITCH_RAD);
const HALF = 0.5;

/**
 * Writes into `out` the cells that the camera may show. The ground seen is a rectangle of
 * `viewHeight / sin(pitch)` by `viewHeight * aspect` metres; its circumscribed disc (plus a
 * margin) holds it whatever the heading, so the result is generous but never too tight.
 */
export function writeFocusArea(
  pose: Readonly<CameraPose>,
  aspect: number,
  grid: GridSize,
  out: FocusArea,
): void {
  const halfDepthM = (pose.viewHeight / SIN_PITCH) * HALF;
  const halfWidthM = pose.viewHeight * Math.max(0, aspect) * HALF;
  const radiusM = Math.hypot(halfDepthM, halfWidthM) * (1 + FOCUS_MARGIN);
  const originX = gridWidth(grid) * HALF;
  const originZ = gridDepth(grid) * HALF;
  out.minColumn = clampCell(Math.floor((pose.x - radiusM + originX) / CELL_SIZE_M), grid.columns);
  out.maxColumn = clampCell(Math.floor((pose.x + radiusM + originX) / CELL_SIZE_M), grid.columns);
  out.minRow = clampCell(Math.floor((pose.z - radiusM + originZ) / CELL_SIZE_M), grid.rows);
  out.maxRow = clampCell(Math.floor((pose.z + radiusM + originZ) / CELL_SIZE_M), grid.rows);
}

function clampCell(value: number, count: number): number {
  return Math.min(count - 1, Math.max(0, value));
}
