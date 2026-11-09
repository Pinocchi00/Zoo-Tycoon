import { describe, expect, it, vi } from 'vitest';
import { archetypeId, visitorId, type VisitorId } from '@/shared';
import type { VisitorState } from '@/sim';
import { createVisitorSelection, type VisitorSelection } from './visitor-selection';

interface SelectionFixture {
  readonly first: VisitorState;
  readonly second: VisitorState;
  readonly world: {
    visitors: VisitorState[];
    x: number;
    y: number;
    visible: boolean;
    text: string;
  };
  readonly bubble: {
    show: (text: string, x: number, y: number, closeLabel: string) => void;
    hide: () => void;
  };
  readonly project: {
    (id: VisitorId, out: { x: number; y: number }): boolean;
    mockClear: () => void;
  };
  readonly selection: VisitorSelection;
}

function makeVisitor(raw: string): VisitorState {
  const id = visitorId(raw);
  const archetype = archetypeId('couple');
  if (!id.ok || !archetype.ok) {
    throw new Error('Invalid test identifiers.');
  }
  return {
    id: id.value,
    archetypeId: archetype.value,
    groupSize: 2,
    column: 1,
    row: 1,
    nextColumn: 1,
    nextRow: 1,
    progressMm: 0,
    activity: 'walking',
    goal: { kind: 'exit' },
    waitMs: 0,
    serviceId: null,
    needs: { foodDrink: 0, rest: 0, comfort: 0 },
    wonderBp: 0,
    satisfaction: 0,
    seen: [],
    visitLeftMs: 1000,
    missingNeeds: [],
    updatedAtMs: 0,
  };
}

function setup(): SelectionFixture {
  const first = makeVisitor('first');
  const second = makeVisitor('second');
  const world = { visitors: [first, second], x: 20, y: 30, visible: true, text: 'A thought' };
  const bubble = { show: vi.fn(), hide: vi.fn() };
  const project = vi.fn((id: VisitorId, out: { x: number; y: number }) => {
    out.x = world.x;
    out.y = world.y;
    return world.visible && world.visitors.some((visitor) => visitor.id === id);
  });
  const selection = createVisitorSelection({
    visitors: () => world.visitors,
    thought: () => world.text,
    closeLabel: () => 'Close',
    project,
    bubble,
  });
  return { first, second, world, bubble, project, selection };
}

describe('visitor selection', () => {
  it('shows an existing group and toggles the same group closed', () => {
    const { first, selection, bubble } = setup();
    selection.tap(first.id);
    expect(bubble.show).toHaveBeenCalledWith('A thought', 20, 30, 'Close');
    selection.tap(first.id);
    expect(bubble.hide).toHaveBeenCalledOnce();
    selection.update();
    expect(bubble.show).toHaveBeenCalledOnce();
  });

  it('closes on an empty tap and switches to a different group', () => {
    const { first, second, selection, bubble } = setup();
    selection.tap(first.id);
    selection.tap(second.id);
    selection.tap(null);
    expect(bubble.hide).toHaveBeenCalledOnce();
    selection.update();
    expect(bubble.show).toHaveBeenCalledOnce();
  });

  it('does not redraw an unchanged thought on every frame', () => {
    const { first, selection, bubble } = setup();
    selection.tap(first.id);
    selection.update();
    selection.update();
    expect(bubble.show).toHaveBeenCalledOnce();
  });

  it('tracks camera movement and changing thoughts', () => {
    const { first, selection, world, bubble } = setup();
    selection.tap(first.id);
    world.x = 42.7;
    world.y = 9.2;
    selection.update();
    expect(bubble.show).toHaveBeenLastCalledWith('A thought', 43, 9, 'Close');
    world.text = 'A new thought';
    selection.update();
    expect(bubble.show).toHaveBeenLastCalledWith('A new thought', 43, 9, 'Close');
  });

  it('closes when the group leaves and ignores a stale tap', () => {
    const { first, selection, world, bubble } = setup();
    selection.tap(first.id);
    world.visitors = [];
    selection.update();
    expect(bubble.hide).toHaveBeenCalledOnce();
    selection.tap(first.id);
    expect(bubble.show).toHaveBeenCalledOnce();
  });

  it('closes when the selected group goes off screen', () => {
    const { first, selection, world, bubble } = setup();
    selection.tap(first.id);
    world.visible = false;
    selection.update();
    expect(bubble.hide).toHaveBeenCalledOnce();
  });

  it('does no more work after disposal', () => {
    const { first, selection, bubble, project } = setup();
    selection.tap(first.id);
    selection.dispose();
    project.mockClear();
    selection.tap(first.id);
    selection.update();
    expect(project).not.toHaveBeenCalled();
    expect(bubble.hide).toHaveBeenCalledOnce();
  });
});
