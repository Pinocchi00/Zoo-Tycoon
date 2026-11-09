import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  Texture,
} from 'three';
import { archetypeId, type Result } from '@/shared';
import { makeVisitorId, type VisitorState } from '@/sim';
import { prepareVisitorSource } from './model-source';
import { VISITOR_CLIPS, type VisitorSource } from './types';

export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error('Fixture failed.');
  return result.value;
}
export function visitor(number = 1, archetype = 'couple', groupSize = 2): VisitorState {
  return {
    id: makeVisitorId(number),
    archetypeId: unwrap(archetypeId(archetype)),
    groupSize,
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
export function prototype(
  archetype = 'couple',
  members = 2,
  textured = false,
): { root: Group; clips: AnimationClip[] } {
  const root = new Group();
  root.name = archetype;
  root.userData = { zooVisitor: { version: 1, archetypeId: archetype, memberCount: members } };
  const material = new MeshStandardMaterial({ map: textured ? new Texture() : null });
  const geometry = new BoxGeometry(0.2, 0.5, 0.2);
  for (let person = 0; person < members; person += 1) {
    const personRoot = new Group();
    personRoot.name = `p${String(person)}_root`;
    personRoot.position.x = person * 0.5;
    root.add(personRoot);
    for (const limb of ['arm', 'leg']) {
      const pivot = new Group();
      pivot.name = `p${String(person)}_${limb}_pivot`;
      const mesh = new Mesh(geometry, material);
      mesh.name = `p${String(person)}_${limb}`;
      mesh.userData = { zooPerson: person, zooTint: 'shirt' };
      mesh.position.y = 1;
      pivot.add(mesh);
      personRoot.add(pivot);
    }
  }
  const clips = VISITOR_CLIPS.map(
    (name) =>
      new AnimationClip(name, 1, [
        new NumberKeyframeTrack(
          'p0_arm_pivot.rotation[z]',
          [0, 0.5, 1],
          name === 'sit' ? [0, 0.1, 0.2] : [0, name === 'walk' ? 1 : 0.2, 0],
        ),
        new NumberKeyframeTrack(
          'p0_leg_pivot.rotation[x]',
          [0, 0.5, 1],
          name === 'sit' ? [0, -0.5, -1] : [0, -0.5, 0],
        ),
      ]),
  );
  return { root, clips };
}
export function source(archetype = 'couple', members = 2, textured = false): VisitorSource {
  const fixture = prototype(archetype, members, textured);
  return unwrap(prepareVisitorSource(archetype, fixture.root, fixture.clips));
}
