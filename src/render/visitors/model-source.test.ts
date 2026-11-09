import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { computeBlendedPoseMatrices, computePoseMatrices, sampleNodeLocal } from './animation';
import { parseVisitorSource, prepareVisitorSource } from './model-source';
import { prototype, source } from './test-fixtures';

describe('visitor source baking', () => {
  it('bakes independent joint transforms and restores the prototype', () => {
    const model = source();
    const matrices = model.nodes.map(() => new Matrix4());
    computePoseMatrices(model, 'walk', 0.5, matrices);
    const arm = model.nodes.findIndex((node) => node.name === 'p0_arm');
    const leg = model.nodes.findIndex((node) => node.name === 'p0_leg');
    const armMatrix = matrices[arm];
    const legMatrix = matrices[leg];
    if (armMatrix === undefined || legMatrix === undefined)
      throw new Error('Missing fixture meshes.');
    expect(armMatrix.elements).not.toEqual(legMatrix.elements);
    expect(armMatrix.elements[12]).toBeCloseTo(-Math.sin(1));
    expect(legMatrix.elements[14]).toBeCloseTo(-Math.sin(0.5));
    expect(model.root.getObjectByName('p0_arm_pivot')?.rotation.z).toBeCloseTo(0);
    expect(new Set(Object.values(model.bakedClips).map((clip) => clip.name)).size).toBe(6);
  });
  it('samples into aliased caller scratch values and blends clips without replacing matrices', () => {
    const model = source();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const node = model.nodes.findIndex((item) => item.name === 'p0_arm_pivot');
    sampleNodeLocal(model.bakedClips.walk, node, 0.25, position, quaternion, scale);
    expect(quaternion.z).toBeCloseTo(Math.sin(0.25));
    const matrices = model.nodes.map(() => new Matrix4());
    const original = [...matrices];
    computeBlendedPoseMatrices(model, 'walk', 'stop', 0.5, 0.5, 0.5, matrices);
    expect(matrices.every((matrix, index) => matrix === original[index])).toBe(true);
    const output = matrices[node];
    if (output === undefined) throw new Error('Missing node.');
    expect(output.elements[0]).toBeCloseTo(Math.cos(0.6));
  });
  it('rejects missing clips, invalid metadata, member count and person roots', () => {
    const fixture = prototype();
    expect(prepareVisitorSource('couple', fixture.root, [])).toMatchObject({
      ok: false,
      error: { kind: 'missingClip' },
    });
    fixture.root.getObjectByName('p1_root')?.removeFromParent();
    expect(prepareVisitorSource('couple', fixture.root, fixture.clips)).toMatchObject({
      ok: false,
      error: { kind: 'missingPersonRoot' },
    });
    const other = prototype();
    const mesh = other.root.getObjectByName('p0_arm');
    if (mesh === undefined) throw new Error('Missing fixture.');
    mesh.userData = { zooPerson: -1, zooTint: 'bogus' };
    expect(prepareVisitorSource('couple', other.root, other.clips)).toMatchObject({
      ok: false,
      error: { kind: 'badExtras' },
    });
    other.root.userData = { zooVisitor: { version: 1, archetypeId: 'couple', memberCount: 4 } };
    expect(prepareVisitorSource('couple', other.root, other.clips)).toMatchObject({
      ok: false,
      error: { kind: 'badExtras' },
    });
  });
  it('returns a typed error for a corrupt GLB', async () => {
    expect(await parseVisitorSource('couple', new ArrayBuffer(12))).toMatchObject({
      ok: false,
      error: { kind: 'invalidGltf' },
    });
  });
});
