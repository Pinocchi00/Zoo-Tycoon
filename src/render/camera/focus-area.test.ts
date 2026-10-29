import { describe, expect, it } from 'vitest';
import { createGridSize } from '@/shared';
import type { FocusArea } from '@/sim';
import { ISO_YAW_RAD, type CameraPose } from './camera-rig';
import { FOCUS_MARGIN, writeFocusArea } from './focus-area';

const GRID = createGridSize(256, 256);
const ASPECT = 2;

function pose(x: number, z: number, viewHeight: number): CameraPose {
  return { x, z, viewHeight, yaw: ISO_YAW_RAD };
}

function area(): FocusArea {
  return { minColumn: 0, minRow: 0, maxColumn: 0, maxRow: 0 };
}

describe('writeFocusArea', () => {
  it('is centred on the cell the camera looks at', () => {
    const out = area();
    writeFocusArea(pose(0.5, 0.5, 20), ASPECT, GRID, out);
    expect(out.minColumn + out.maxColumn).toBe(256);
    expect(out.minRow + out.maxRow).toBe(256);
  });

  it('covers at least the visible ground rectangle plus the margin', () => {
    const out = area();
    const viewHeight = 20;
    writeFocusArea(pose(0, 0, viewHeight), ASPECT, GRID, out);
    const halfVisibleM = (viewHeight * ASPECT) / 2;
    expect(128 - out.minColumn).toBeGreaterThanOrEqual(halfVisibleM * (1 + FOCUS_MARGIN));
    expect(out.maxColumn - 128).toBeGreaterThanOrEqual(halfVisibleM);
  });

  it('widens when the camera is higher', () => {
    const low = area();
    const high = area();
    writeFocusArea(pose(0, 0, 10), ASPECT, GRID, low);
    writeFocusArea(pose(0, 0, 30), ASPECT, GRID, high);
    expect(high.minColumn).toBeLessThan(low.minColumn);
    expect(high.maxRow).toBeGreaterThan(low.maxRow);
  });

  it('stays inside the grid near the edges', () => {
    const out = area();
    writeFocusArea(pose(-128, 128, 72), ASPECT, GRID, out);
    expect(out.minColumn).toBe(0);
    expect(out.maxRow).toBe(255);
    expect(out.maxColumn).toBeLessThanOrEqual(255);
    expect(out.minRow).toBeGreaterThanOrEqual(0);
  });

  it('covers the whole grid when zoomed fully out', () => {
    const out = area();
    writeFocusArea(pose(0, 0, 400), ASPECT, GRID, out);
    expect(out).toEqual({ minColumn: 0, minRow: 0, maxColumn: 255, maxRow: 255 });
  });
});
