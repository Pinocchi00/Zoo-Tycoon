import { expect, it } from 'vitest';
import { loadGameContent } from '@/data';
import { createEventQueue } from '@/sim';
import { buildVisitorDemo, VISITOR_DEMO_PEOPLE } from '@/app/dev-visitors-demo';

it('provides at least one path cell per visitor on average and keeps an enclosure to view', () => {
  const data = loadGameContent();
  if (!data.ok) throw new Error('Game data must load.');

  const state = buildVisitorDemo(data.value, createEventQueue());
  const totalPeople = state.visitors.list.reduce((total, visitor) => total + visitor.groupSize, 0);

  expect(totalPeople).toBeGreaterThanOrEqual(VISITOR_DEMO_PEOPLE);
  expect(state.paths.length).toBeGreaterThanOrEqual(totalPeople);
  expect(state.enclosures.length).toBeGreaterThan(0);
});
