import { describe, expect, it } from 'vitest';
import { archetypeId, buildingId, enclosureId, visitorId } from '../../shared/brand';
import { createGameState } from '../state';
import { satisfactionByZone, visitorThoughtKey } from './feedback';
import { slice } from './test-support';
import {
  FINE_PER_BASIS_POINT,
  makeVisitorId,
  toBasisPoints,
  type VisitorState,
} from './visitor-state';
import { targetSatisfaction } from './walk';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

function visitor(patch: Partial<VisitorState> = {}): VisitorState {
  return {
    id: unwrap(visitorId('visitor-1')),
    archetypeId: unwrap(archetypeId('couple')),
    groupSize: 2,
    column: 10,
    row: 10,
    nextColumn: 10,
    nextRow: 10,
    progressMm: 0,
    activity: 'walking',
    goal: { kind: 'enclosure', enclosureId: unwrap(enclosureId('enclosure-1')) },
    waitMs: 0,
    serviceId: null,
    needs: { foodDrink: 0, rest: 0, comfort: 0 },
    wonderBp: 0,
    satisfaction: 7000 * FINE_PER_BASIS_POINT,
    seen: [],
    visitLeftMs: 60_000,
    missingNeeds: [],
    updatedAtMs: 0,
    ...patch,
  };
}

describe('thought bubbles', () => {
  it('says first what is missing, the latest wish on top', () => {
    const wishing = visitor({ missingNeeds: ['comfort', 'rest'], activity: 'viewing' });
    expect(visitorThoughtKey(wishing, slice)).toBe('visitor.thought.missingRest');
  });

  it('then the need it walks to meet', () => {
    const hungry = visitor({ goal: { kind: 'service', need: 'foodDrink' } });
    expect(visitorThoughtKey(hungry, slice)).toBe('visitor.thought.hungry');
  });

  it('then how the visit goes', () => {
    expect(visitorThoughtKey(visitor({ activity: 'viewing' }), slice)).toBe(
      'visitor.thought.amazed',
    );
    expect(visitorThoughtKey(visitor({ goal: { kind: 'exit' } }), slice)).toBe(
      'visitor.thought.leaving',
    );
    expect(visitorThoughtKey(visitor(), slice)).toBe('visitor.thought.content');
  });

  it('works for a group using a service', () => {
    const resting = visitor({
      activity: 'usingService',
      goal: { kind: 'service', need: 'rest' },
      serviceId: unwrap(buildingId('building-1')),
    });
    expect(visitorThoughtKey(resting, slice)).toBe('visitor.thought.tired');
  });
});

describe('satisfaction', () => {
  it('rises with wonder and drops with urgent needs, within 0 and 100 %', () => {
    const rules = slice.visitorRules;
    expect(targetSatisfaction(visitor(), rules)).toBe(6000 * FINE_PER_BASIS_POINT);
    expect(targetSatisfaction(visitor({ wonderBp: 10_000 }), rules)).toBe(
      10_000 * FINE_PER_BASIS_POINT,
    );
    const tired = visitor({
      needs: { foodDrink: 0, rest: 8000 * FINE_PER_BASIS_POINT, comfort: 0 },
    });
    expect(targetSatisfaction(tired, rules)).toBe(5000 * FINE_PER_BASIS_POINT);
    const full = 10_000 * FINE_PER_BASIS_POINT;
    const miserable = visitor({ needs: { foodDrink: full, rest: full, comfort: full } });
    expect(targetSatisfaction(miserable, rules)).toBe(0);
  });

  it('averages groups by square zone, row by row', () => {
    const state = createGameState(1);
    const size = slice.visitorRules.zoneSizeCells;
    state.visitors.list.push(
      visitor({ column: size + 1, row: 0, satisfaction: 9000 * FINE_PER_BASIS_POINT }),
      visitor({ column: 0, row: size, satisfaction: 4000 * FINE_PER_BASIS_POINT }),
      visitor({ column: size + 2, row: 3, satisfaction: 6001 * FINE_PER_BASIS_POINT }),
    );
    expect(satisfactionByZone(state, slice)).toEqual([
      { zoneColumn: 1, zoneRow: 0, visitors: 2, averageBp: 7500 },
      { zoneColumn: 0, zoneRow: 1, visitors: 1, averageBp: 4000 },
    ]);
    expect(satisfactionByZone(createGameState(1), slice)).toEqual([]);
  });
});

describe('visitor ids', () => {
  it('are numbered and converted to basis points downwards', () => {
    expect(makeVisitorId(12)).toBe('visitor-12');
    expect(() => makeVisitorId(Number.NaN)).toThrow();
    expect(toBasisPoints(1999)).toBe(1);
  });
});
