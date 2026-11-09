import { describe, expect, it } from 'vitest';
import { loadGameContent } from '@/data';
import { createEventQueue } from '@/sim';
import { buildVisitorDemo, VISITOR_DEMO_PEOPLE } from './dev-visitors-demo';

describe('visitor demo', () => {
  it('reaches one hundred people and every archetype through the normal simulation', () => {
    const data = loadGameContent();
    if (!data.ok) {
      throw new Error('Game data must load.');
    }
    const state = buildVisitorDemo(data.value, createEventQueue());
    expect(
      state.visitors.list.reduce((total, group) => total + group.groupSize, 0),
    ).toBeGreaterThanOrEqual(VISITOR_DEMO_PEOPLE);
    expect(new Set(state.visitors.list.map((group) => group.archetypeId)).size).toBe(
      data.value.visitorArchetypes.size,
    );
    expect(state.enclosures).toHaveLength(5);
  });
});
