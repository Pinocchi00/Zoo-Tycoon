import type { Terrain } from '../../data/schemas/build';
import { err, ok, type Result } from '../../shared/result';
import type { CellPosition, GridPoint, QuarterTurns } from './park-state';

export type OutlineError = 'outlineInvalid' | 'outOfBounds';

/** Fewest corners of a closed outline. */
const MIN_OUTLINE_POINTS = 3;

interface Rational {
  readonly num: number;
  /** Always positive. */
  readonly den: number;
}

/**
 * A usable outline: 3 to `maxPoints` integer corners inside the land, no repeated corner in a
 * row, no edge crossing or folding back on another, and a non-zero area.
 */
export function checkOutline(
  outline: readonly GridPoint[],
  terrain: Terrain,
  maxPoints: number,
): Result<void, OutlineError> {
  if (outline.length < MIN_OUTLINE_POINTS || outline.length > maxPoints) {
    return err('outlineInvalid');
  }
  for (const point of outline) {
    if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
      return err('outlineInvalid');
    }
  }
  for (const point of outline) {
    if (point.x < 0 || point.x > terrain.columns || point.y < 0 || point.y > terrain.rows) {
      return err('outOfBounds');
    }
  }
  if (!isSimplePolygon(outline) || doubledArea(outline) === 0) {
    return err('outlineInvalid');
  }
  return ok(undefined);
}

function cornerAt(outline: readonly GridPoint[], index: number): GridPoint {
  const point = outline[index % outline.length];
  if (point === undefined) {
    throw new Error('cornerAt: empty outline, checked before.');
  }
  return point;
}

function cross(origin: GridPoint, a: GridPoint, b: GridPoint): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function doubledArea(outline: readonly GridPoint[]): number {
  let sum = 0;
  for (let index = 0; index < outline.length; index += 1) {
    const a = cornerAt(outline, index);
    const b = cornerAt(outline, index + 1);
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum);
}

function isOnSegment(a: GridPoint, b: GridPoint, point: GridPoint): boolean {
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
  );
}

/** Closed segments: touching counts as crossing. */
function segmentsTouch(a: GridPoint, b: GridPoint, c: GridPoint, d: GridPoint): boolean {
  const d1 = Math.sign(cross(c, d, a));
  const d2 = Math.sign(cross(c, d, b));
  const d3 = Math.sign(cross(a, b, c));
  const d4 = Math.sign(cross(a, b, d));
  if (d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) {
    return true;
  }
  return (
    (d1 === 0 && isOnSegment(c, d, a)) ||
    (d2 === 0 && isOnSegment(c, d, b)) ||
    (d3 === 0 && isOnSegment(a, b, c)) ||
    (d4 === 0 && isOnSegment(a, b, d))
  );
}

function isSimplePolygon(outline: readonly GridPoint[]): boolean {
  const count = outline.length;
  for (let index = 0; index < count; index += 1) {
    const previous = cornerAt(outline, index + count - 1);
    const corner = cornerAt(outline, index);
    const next = cornerAt(outline, index + 1);
    if (corner.x === next.x && corner.y === next.y) {
      return false;
    }
    // Two consecutive edges going back over each other.
    const turn = cross(corner, previous, next);
    const dot =
      (previous.x - corner.x) * (next.x - corner.x) + (previous.y - corner.y) * (next.y - corner.y);
    if (turn === 0 && dot > 0) {
      return false;
    }
  }
  for (let first = 0; first < count; first += 1) {
    for (let second = first + 2; second < count; second += 1) {
      // The last edge and the first one share a corner: they are neighbours, not a crossing.
      if (first === 0 && second === count - 1) {
        continue;
      }
      const touch = segmentsTouch(
        cornerAt(outline, first),
        cornerAt(outline, first + 1),
        cornerAt(outline, second),
        cornerAt(outline, second + 1),
      );
      if (touch) {
        return false;
      }
    }
  }
  return true;
}

/** Floor of a / b for integers, b > 0, without floating-point rounding. */
function floorDiv(a: number, b: number): number {
  const remainder = ((a % b) + b) % b;
  return (a - remainder) / b;
}

/** Where the edges cross the horizontal line through the centres of `row`, in doubled units. */
function rowCrossings(outline: readonly GridPoint[], row: number): Rational[] {
  // Doubled coordinates keep everything integer: cell centres are odd, corners are even,
  // so a scan line never passes through a corner.
  const scanY = 2 * row + 1;
  const crossings: Rational[] = [];
  for (let index = 0; index < outline.length; index += 1) {
    const a = cornerAt(outline, index);
    const b = cornerAt(outline, index + 1);
    const [low, high] = a.y < b.y ? [a, b] : [b, a];
    const lowY = 2 * low.y;
    const highY = 2 * high.y;
    if (scanY < lowY || scanY > highY || lowY === highY) {
      continue;
    }
    const den = highY - lowY;
    crossings.push({ num: 2 * low.x * den + (scanY - lowY) * 2 * (high.x - low.x), den });
  }
  return crossings.sort((p, q) => p.num * q.den - q.num * p.den);
}

/**
 * Cells of the outline: those whose centre is inside it (even-odd rule; a centre lying exactly
 * on a slanted edge is inside when the enclosure lies west of that edge). Returned as
 * `row * columns + column`, row by row; render must use the same cells.
 * The outline must have passed `checkOutline`.
 */
export function outlineCells(outline: readonly GridPoint[], columns: number): number[] {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of outline) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const cells: number[] = [];
  for (let row = minY; row < maxY; row += 1) {
    const crossings = rowCrossings(outline, row);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const enter = crossings[index];
      const leave = crossings[index + 1];
      if (enter === undefined || leave === undefined) {
        throw new Error('outlineCells: crossings come in pairs.');
      }
      // Columns whose centre 2c + 1 lies in (enter, leave].
      const first = floorDiv(enter.num - enter.den, 2 * enter.den) + 1;
      const last = floorDiv(leave.num - leave.den, 2 * leave.den);
      for (let column = first; column <= last; column += 1) {
        cells.push(row * columns + column);
      }
    }
  }
  return cells;
}

/** True when every cell can be reached from the first one through shared sides. */
export function areCellsConnected(cells: readonly number[], columns: number): boolean {
  const [start] = cells;
  if (start === undefined) {
    return false;
  }
  const remaining = new Set(cells);
  remaining.delete(start);
  const stack = [start];
  for (let cell = stack.pop(); cell !== undefined; cell = stack.pop()) {
    const column = cell % columns;
    const neighbours = [cell - columns, cell + columns];
    if (column > 0) {
      neighbours.push(cell - 1);
    }
    if (column < columns - 1) {
      neighbours.push(cell + 1);
    }
    for (const neighbour of neighbours) {
      if (remaining.delete(neighbour)) {
        stack.push(neighbour);
      }
    }
  }
  return remaining.size === 0;
}

function rotateOnce(outline: readonly GridPoint[]): GridPoint[] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of outline) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  // Clockwise around the north-west corner of the bounding box, which stays in place.
  return outline.map((point) => ({ x: minX + (maxY - point.y), y: minY + (point.x - minX) }));
}

/** Turns the outline clockwise around its bounding box's north-west corner, then shifts it. */
export function transformOutline(
  outline: readonly GridPoint[],
  offsetColumns: number,
  offsetRows: number,
  quarterTurns: QuarterTurns,
): GridPoint[] {
  let turned: readonly GridPoint[] = outline;
  for (let turn = 0; turn < quarterTurns; turn += 1) {
    turned = rotateOnce(turned);
  }
  return turned.map((point) => ({ x: point.x + offsetColumns, y: point.y + offsetRows }));
}

/** Width and depth of a footprint once turned. */
export function turnedFootprint(
  width: number,
  depth: number,
  quarterTurns: QuarterTurns,
): { readonly width: number; readonly depth: number } {
  return quarterTurns % 2 === 0 ? { width, depth } : { width: depth, depth: width };
}

export function isCellInside(terrain: Terrain, cell: CellPosition): boolean {
  return (
    Number.isSafeInteger(cell.column) &&
    Number.isSafeInteger(cell.row) &&
    cell.column >= 0 &&
    cell.column < terrain.columns &&
    cell.row >= 0 &&
    cell.row < terrain.rows
  );
}
