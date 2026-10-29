import type { GameData } from '../../data/load';
import { BASIS_POINTS_TOTAL } from '../../data/schemas/common';
import type { SpeciesId } from '../../shared/brand';
import { emit, type EventQueue } from '../events';
import type { GameState } from '../state';
import {
  buildOccupancy,
  CELL_FREE,
  FIRST_OWNER_CODE,
  isWalkable,
  type Occupancy,
} from './occupancy';
import { outlineCells } from './outline';

const STARS_WITH_REWARDS = [2, 3, 4, 5] as const;

/** True when the species' stars so far have unlocked an element of the `viewpoint` category. */
export function hasUnlockedViewpoint(speciesId: SpeciesId, stars: number, data: GameData): boolean {
  const species = data.species.get(speciesId);
  if (species === undefined) {
    return false;
  }
  return STARS_WITH_REWARDS.some(
    (star) =>
      star <= stars &&
      species.starRewards[star].elements.some(
        (element) => data.habitatElements.get(element)?.category === 'viewpoint',
      ),
  );
}

/** Bresenham line between two cells: blocked by a cell of a building or of another enclosure. */
function isLineClear(occupancy: Occupancy, from: number, to: number, ownCode: number): boolean {
  const { columns } = occupancy;
  let column = from % columns;
  let row = (from - column) / columns;
  const targetColumn = to % columns;
  const targetRow = (to - targetColumn) / columns;
  const stepColumn = column < targetColumn ? 1 : -1;
  const stepRow = row < targetRow ? 1 : -1;
  const spanColumns = Math.abs(targetColumn - column);
  const spanRows = -Math.abs(targetRow - row);
  let error = spanColumns + spanRows;
  for (;;) {
    const doubled = 2 * error;
    if (doubled >= spanRows) {
      error += spanRows;
      column += stepColumn;
    }
    if (doubled <= spanColumns) {
      error += spanColumns;
      row += stepRow;
    }
    if (column === targetColumn && row === targetRow) {
      return true;
    }
    const code = occupancy.cells[row * columns + column] ?? CELL_FREE;
    if (code >= FIRST_OWNER_CODE && code !== ownCode) {
      return false;
    }
  }
}

/** Distance (1 to range) of the closest walkway cell that sees `cell`, or 0 when none does. */
function closestViewer(occupancy: Occupancy, cell: number, ownCode: number, range: number): number {
  const { columns, rows } = occupancy;
  const column = cell % columns;
  const row = (cell - column) / columns;
  for (let distance = 1; distance <= range; distance += 1) {
    for (let dy = -distance; dy <= distance; dy += 1) {
      // Only the ring at this distance: whole rows at the top and bottom, two cells elsewhere.
      const onEdge = dy === -distance || dy === distance;
      const step = onEdge ? 1 : 2 * distance;
      for (let dx = -distance; dx <= distance; dx += step) {
        const viewerColumn = column + dx;
        const viewerRow = row + dy;
        if (viewerColumn < 0 || viewerColumn >= columns || viewerRow < 0 || viewerRow >= rows) {
          continue;
        }
        const viewer = viewerRow * columns + viewerColumn;
        const code = occupancy.cells[viewer] ?? CELL_FREE;
        if (isWalkable(code) && isLineClear(occupancy, viewer, cell, ownCode)) {
          return distance;
        }
      }
    }
  }
  return 0;
}

function borderCells(cells: readonly number[], columns: number): number[] {
  const inside = new Set(cells);
  return cells.filter((cell) => {
    const column = cell % columns;
    return (
      column === 0 ||
      column === columns - 1 ||
      !inside.has(cell - 1) ||
      !inside.has(cell + 1) ||
      !inside.has(cell - columns) ||
      !inside.has(cell + columns)
    );
  });
}

/**
 * View score of an enclosure (GDD "Qualité de vue"), from 0 to `view.maxScore`:
 * each border cell is worth (R + 1 − d) / R when the closest walkway cell with a clear line to it
 * is d cells away (d ≤ R), 0 when none sees it. The average over the border, in basis points,
 * gives up to `maxScore − viewpointBonus`; an unlocked viewpoint element adds the bonus as long
 * as the enclosure is seen at all.
 */
export function computeViewScore(
  occupancy: Occupancy,
  cells: readonly number[],
  ownCode: number,
  hasViewpoint: boolean,
  data: GameData,
): number {
  const { rangeCells, maxScore, viewpointBonus } = data.buildRules.view;
  const border = borderCells(cells, occupancy.columns);
  if (border.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const cell of border) {
    const distance = closestViewer(occupancy, cell, ownCode, rangeCells);
    if (distance > 0) {
      sum += Math.floor(((rangeCells + 1 - distance) * BASIS_POINTS_TOTAL) / rangeCells);
    }
  }
  const coverageBp = Math.floor(sum / border.length);
  if (coverageBp === 0) {
    return 0;
  }
  const seen = Math.floor((coverageBp * (maxScore - viewpointBonus)) / BASIS_POINTS_TOTAL);
  return seen + (hasViewpoint ? viewpointBonus : 0);
}

/** Recomputes every enclosure's view score; emits `viewScoreChanged` for those that moved. */
export function refreshViewScores(state: GameState, data: GameData, events: EventQueue): void {
  if (state.enclosures.length === 0) {
    return;
  }
  const occupancy = buildOccupancy(state, data);
  state.enclosures.forEach((enclosure, index) => {
    const ownCode = occupancy.owners.findIndex(
      (owner) => owner.kind === 'enclosure' && owner.id === enclosure.id,
    );
    const progress =
      enclosure.speciesId === null
        ? undefined
        : state.gacha.collection.find((entry) => entry.speciesId === enclosure.speciesId);
    const hasViewpoint =
      progress !== undefined && hasUnlockedViewpoint(progress.speciesId, progress.stars, data);
    const viewScore = computeViewScore(
      occupancy,
      outlineCells(enclosure.outline, occupancy.columns),
      FIRST_OWNER_CODE + ownCode,
      hasViewpoint,
      data,
    );
    if (viewScore !== enclosure.viewScore) {
      state.enclosures[index] = { ...enclosure, viewScore };
      emit(events, { type: 'viewScoreChanged', enclosureId: enclosure.id, viewScore });
    }
  });
}
