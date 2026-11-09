import { Group, InstancedMesh } from 'three';
import { expect, it, vi } from 'vitest';
import { ok } from '@/shared';
import { createVisitorCrowd } from './crowd';
import { isShadowCastingPiece, parseVisitorSource } from './model-source';
import { unwrap, visitor } from './test-fixtures';
import type { VisitorSource } from './types';

const archetypes = [
  ['stroller-family', 4],
  ['shoulder-ride', 2],
  ['couple', 2],
  ['teen-photographer', 1],
  ['retirees', 2],
] as const;

const { readFile } = await vi.importActual<{
  readFile: (url: URL) => Promise<Uint8Array<ArrayBuffer>>;
}>('node:fs/promises');

async function loadModels(): Promise<VisitorSource[]> {
  // Node has no image decoder; geometry and animation still come from the unmodified GLBs.
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 1, height: 1 }));
  const models: VisitorSource[] = [];
  try {
    for (const [id] of archetypes) {
      const bytes = await readFile(
        new URL(`../../../assets/models/visitors/${id}.glb`, import.meta.url),
      );
      models.push(
        unwrap(
          await parseVisitorSource(
            id,
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          ),
        ),
      );
    }
  } finally {
    vi.unstubAllGlobals();
  }
  return models;
}

for (const [quality, expectedDrawCalls] of [
  ['low', 90],
  ['medium', 112],
  ['high', 180],
] as const) {
  const models = await loadModels();
  const parent = new Group();
  const crowd = createVisitorCrowd({
    parent,
    grid: { columns: 3, rows: 3 },
    quality,
    loadSource: (id) => {
      const model = models.find((candidate) => candidate.archetypeId === id);
      if (model === undefined) throw new Error('Missing real model.');
      return Promise.resolve(ok(model));
    },
  });
  const list = [];
  for (let cycle = 0; cycle < 9; cycle += 1) {
    for (const [id, size] of archetypes) list.push(visitor(list.length + 1, id, size));
  }
  list.push(visitor(46, 'teen-photographer', 1));
  crowd.syncAll({ visitors: { list } });
  await vi.waitFor(() => {
    expect(crowd.stats().people).toBe(100);
  });
  crowd.update(100);
  const draws = crowd.stats().drawCalls;
  it(`five real GLBs, ${quality}: stats().drawCalls = ${String(draws)} for 100 people`, () => {
    expect(draws).toBe(expectedDrawCalls);
    expect(crowd.stats().groups).toBe(46);
    const meshes = parent.children.filter((child) => child instanceof InstancedMesh);
    expect(meshes.length).toBe(models.reduce((sum, model) => sum + model.parts.length, 0));
    const casters = meshes.filter((mesh) => mesh.castShadow);
    if (quality === 'low') expect(casters).toHaveLength(0);
    else if (quality === 'medium') {
      const expected = meshes.filter((mesh) =>
        isShadowCastingPiece(mesh.name.slice(mesh.name.indexOf(':') + 1)),
      );
      expect(expected).toHaveLength(22);
      expect(casters).toEqual(expected);
      expect(casters.length).toBeLessThan(meshes.length);
    } else expect(casters).toHaveLength(meshes.length);
    expect(draws).toBe(meshes.length + casters.length);
    crowd.setQuality('low');
    expect(meshes.every((mesh) => !mesh.castShadow)).toBe(true);
    crowd.setQuality('medium');
    expect(meshes.filter((mesh) => mesh.castShadow).map((mesh) => mesh.name)).toEqual(
      meshes
        .filter((mesh) => isShadowCastingPiece(mesh.name.slice(mesh.name.indexOf(':') + 1)))
        .map((mesh) => mesh.name),
    );
    crowd.dispose();
  });
}
