import type { GameData } from '@/data';
import {
  advance,
  applyCommand,
  createSimContext,
  type CellPosition,
  type EventQueue,
  type GameState,
} from '@/sim';
import { buildAnimalDemo } from './dev-demo';

export const VISITOR_DEMO_PEOPLE = 100;
const DEMO_STEP_MS = 1000;
const MAX_DEMO_STEPS = 20 * 60;

function people(state: GameState): number {
  let total = 0;
  for (const visitor of state.visitors.list) {
    total += visitor.groupSize;
  }
  return total;
}

/** Advances a normal demo park until its visitors can exercise all five visual archetypes. */
export function buildVisitorDemo(data: GameData, events: EventQueue): GameState {
  const state = buildAnimalDemo(data, events);
  const surface = [...data.pathSurfaces.keys()].find((id) => id === 'gravel');
  if (surface === undefined) {
    throw new Error('Visitor demo needs the demo path surface.');
  }
  const cells: CellPosition[] = [];
  for (let column = 118; column <= 137; column += 1) {
    cells.push({ column, row: 235 }, { column, row: 245 });
  }
  for (const cell of cells) {
    const connected = applyCommand(
      state,
      { type: 'placePath', cells: [cell], surface },
      data,
      events,
    );
    if (!connected.ok && connected.error !== 'cellOccupied') {
      throw new Error(`Visitor demo paths failed: ${connected.error}.`);
    }
  }
  const context = createSimContext(data);
  for (let step = 0; step < MAX_DEMO_STEPS; step += 1) {
    const archetypes = new Set(state.visitors.list.map((visitor) => visitor.archetypeId));
    if (people(state) >= VISITOR_DEMO_PEOPLE && archetypes.size === data.visitorArchetypes.size) {
      return state;
    }
    advance(state, DEMO_STEP_MS, context, events);
  }
  throw new Error(
    `Visitor demo reached only ${String(people(state))} people within twenty simulated minutes.`,
  );
}
