import { describe, expect, it } from 'vitest';
import { makeModelJson, type FixtureOptions } from './fixtures';
import { gltfSchema } from './glb';
import {
  checkModel,
  describeIssue,
  MAX_TRIANGLES,
  MIN_TRIANGLES,
  type ModelIssue,
} from './model-rules';

const EXPECTED = { lengthM: 1.1 };

function issuesFor(json: unknown): readonly ModelIssue[] {
  return checkModel(gltfSchema.parse(json), EXPECTED);
}

function kinds(options: FixtureOptions): string[] {
  return issuesFor(makeModelJson(options)).map((issue) => issue.kind);
}

describe('checkModel', () => {
  it('accepts a model that follows every rule', () => {
    expect(issuesFor(makeModelJson())).toEqual([]);
  });

  it('accepts the exact edges of the triangle budget', () => {
    expect(kinds({ triangles: MIN_TRIANGLES })).toEqual([]);
    expect(kinds({ triangles: MAX_TRIANGLES })).toEqual([]);
  });

  it('refuses a model that is too heavy or too light', () => {
    expect(issuesFor(makeModelJson({ triangles: MAX_TRIANGLES + 1 }))).toEqual([
      { kind: 'triangleBudget', count: MAX_TRIANGLES + 1, min: MIN_TRIANGLES, max: MAX_TRIANGLES },
    ]);
    expect(kinds({ triangles: MIN_TRIANGLES - 1 })).toEqual(['triangleBudget']);
  });

  it('refuses a model without idle, and one without walk', () => {
    expect(issuesFor(makeModelJson({ animations: ['walk'] }))).toEqual([
      { kind: 'missingAnimation', name: 'idle' },
    ]);
    expect(kinds({ animations: [] })).toEqual(['missingAnimation', 'missingAnimation']);
  });

  it('refuses unknown materials and extra textures', () => {
    expect(issuesFor(makeModelJson({ materials: ['palette', 'shiny'] }))).toEqual([
      { kind: 'unknownMaterial', name: 'shiny' },
    ]);
    expect(kinds({ images: 2 })).toEqual(['paletteImageCount']);
    expect(kinds({ images: 0 })).toEqual(['paletteImageCount']);
  });

  it('refuses a model at the wrong size, and a scaled node', () => {
    expect(kinds({ lengthM: 1.1 * 1.2 })).toEqual(['lengthOutOfTolerance']);
    expect(kinds({ lengthM: 1.1 * 0.95 })).toEqual([]);
    expect(kinds({ scale: [2, 2, 2] })).toEqual(['scaledNode', 'lengthOutOfTolerance']);
  });

  it('measures the length through node rotations and matrices', () => {
    const rotated = makeModelJson();
    // A quarter turn around Y swaps the X and Z extents: length is still 1.1 m.
    rotated['nodes'] = [
      { name: 'capybara', mesh: 0 },
      { name: 'skeleton', children: [0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
    ];
    expect(issuesFor(rotated)).toEqual([]);

    const matrix = makeModelJson();
    matrix['nodes'] = [
      { name: 'capybara', mesh: 0 },
      { name: 'skeleton', children: [0], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1] },
    ];
    expect(issuesFor(matrix)).toEqual([]);
  });

  it('counts strips and fans, and refuses lines', () => {
    const strip = makeModelJson({ triangles: 0 });
    strip['meshes'] = [{ primitives: [{ attributes: { POSITION: 0 }, material: 0, mode: 5 }] }];
    strip['accessors'] = [{ count: 2002, min: [-0.2, 0, -0.55], max: [0.2, 0.7, 0.55] }];
    expect(issuesFor(strip)).toEqual([]);

    const lines = makeModelJson();
    lines['meshes'] = [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 1 }] },
    ];
    expect(issuesFor(lines).map((issue) => issue.kind)).toEqual([
      'unsupportedPrimitiveMode',
      'triangleBudget',
    ]);
  });

  it('reports broken structure instead of crashing', () => {
    const noScene = makeModelJson();
    noScene['scenes'] = [];
    expect(issuesFor(noScene).map((issue) => issue.kind)).toEqual(['noScene', 'noMesh']);

    const missingNode = makeModelJson();
    missingNode['scenes'] = [{ nodes: [7] }];
    expect(issuesFor(missingNode)[0]).toEqual({ kind: 'brokenReference', what: 'node', index: 7 });

    const cycle = makeModelJson();
    cycle['nodes'] = [
      { name: 'capybara', mesh: 0, children: [1] },
      { name: 'skeleton', children: [0] },
    ];
    expect(issuesFor(cycle)[0]).toEqual({ kind: 'nodeCycle', node: 1 });

    const missingMesh = makeModelJson();
    missingMesh['nodes'] = [
      { name: 'capybara', mesh: 3 },
      { name: 'skeleton', children: [0] },
    ];
    expect(issuesFor(missingMesh).map((issue) => issue.kind)).toContain('brokenReference');

    const missingAccessor = makeModelJson();
    missingAccessor['accessors'] = [{ count: 100, min: [-0.2, 0, -0.55], max: [0.2, 0.7, 0.55] }];
    expect(issuesFor(missingAccessor)).toContainEqual({
      kind: 'brokenReference',
      what: 'accessor',
      index: 1,
    });

    const noBounds = makeModelJson();
    noBounds['accessors'] = [{ count: 100 }, { count: 6000 }];
    expect(issuesFor(noBounds)).toEqual([{ kind: 'missingBounds' }]);

    const noMaterial = makeModelJson();
    noMaterial['meshes'] = [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }];
    expect(issuesFor(noMaterial)).toEqual([{ kind: 'primitiveWithoutMaterial' }]);

    const badMaterial = makeModelJson();
    badMaterial['meshes'] = [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 4 }] },
    ];
    expect(issuesFor(badMaterial)).toEqual([
      { kind: 'brokenReference', what: 'material', index: 4 },
    ]);

    const noPosition = makeModelJson();
    noPosition['meshes'] = [{ primitives: [{ attributes: {}, material: 0 }] }];
    expect(issuesFor(noPosition).map((issue) => issue.kind)).toContain('missingBounds');

    const oldVersion = makeModelJson();
    oldVersion['asset'] = { version: '1.0' };
    expect(issuesFor(oldVersion)).toEqual([{ kind: 'unsupportedVersion', version: '1.0' }]);
  });

  it('describes every issue in a readable sentence', () => {
    const issues: ModelIssue[] = [
      { kind: 'unsupportedVersion', version: '1.0' },
      { kind: 'noScene' },
      { kind: 'brokenReference', what: 'node', index: 2 },
      { kind: 'nodeCycle', node: 1 },
      { kind: 'noMesh' },
      { kind: 'unsupportedPrimitiveMode', mode: 1 },
      { kind: 'triangleBudget', count: 9000, min: MIN_TRIANGLES, max: MAX_TRIANGLES },
      { kind: 'missingAnimation', name: 'idle' },
      { kind: 'paletteImageCount', images: 2, textures: 2 },
      { kind: 'unknownMaterial', name: 'shiny' },
      { kind: 'primitiveWithoutMaterial' },
      { kind: 'missingBounds' },
      { kind: 'scaledNode', node: 'skeleton' },
      { kind: 'lengthOutOfTolerance', expectedM: 1.1, actualM: 2 },
    ];
    for (const issue of issues) {
      expect(describeIssue(issue).length).toBeGreaterThan(10);
    }
    expect(describeIssue(issues[7] ?? { kind: 'noMesh' })).toContain('"idle"');
  });
});
