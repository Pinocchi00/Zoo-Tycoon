import { describe, expect, it } from 'vitest';
import { checkModels } from './check-models';
import { checkVisitorCatalogue, checkVisitorModels } from './check-visitors';
import { makeGlb, makeModelJson, VALID_DESCRIPTION } from './fixtures';
import type { Gltf } from './glb';
import { visitorDescription, visitorFixture } from './visitor-fixtures';

function check(
  gltf: Gltf = visitorFixture(),
  description: unknown = visitorDescription(),
): readonly string[] {
  return (
    checkVisitorModels(
      [{ id: 'teen-photographer', content: makeGlb(gltf) }],
      [{ id: 'teen-photographer', content: JSON.stringify(description) }],
    )[0]?.problems ?? ['missing report']
  );
}

describe('visitor validation', () => {
  it.each(['stroller-family', 'shoulder-ride', 'couple', 'teen-photographer', 'retirees'] as const)(
    'accepts the correct group for %s',
    (id) => {
      expect(
        checkVisitorModels(
          [{ id, content: makeGlb(visitorFixture(id)) }],
          [{ id, content: JSON.stringify(visitorDescription(id)) }],
        )[0]?.problems,
      ).toEqual([]);
    },
  );

  it('keeps accepting animal fixtures without visitor metadata or animation channels', () => {
    expect(
      checkModels(
        [{ id: 'capybara', content: makeGlb(makeModelJson()) }],
        [{ id: 'capybara', content: JSON.stringify(VALID_DESCRIPTION) }],
      )[0]?.problems,
    ).toEqual([]);
  });

  const failures: readonly [string, (gltf: Gltf) => void, string][] = [
    [
      'group identity',
      (gltf) => {
        const node = gltf.nodes[0];
        if (node) node.extras = {};
      },
      'zooVisitor',
    ],
    [
      'owner metadata',
      (gltf) => {
        const node = gltf.nodes[3];
        if (node) node.extras = { zooPerson: 2, zooTint: 'skin' };
      },
      'metadata',
    ],
    [
      'tint metadata',
      (gltf) => {
        const node = gltf.nodes[3];
        if (node) node.extras = { zooPerson: 0, zooTint: 'fur' };
      },
      'metadata',
    ],
    [
      'duplicate names',
      (gltf) => {
        const node = gltf.nodes[5];
        if (node) node.name = 'p0_head';
      },
      'unique',
    ],
    [
      'skinning',
      (gltf) => {
        const node = gltf.nodes[3];
        if (node) node.skin = 0;
      },
      'unskinned',
    ],
    [
      'cycles',
      (gltf) => {
        const node = gltf.nodes[2];
        if (node) node.children = [0];
      },
      'reached twice',
    ],
    [
      'shared nodes',
      (gltf) => {
        const node = gltf.nodes[4];
        if (node) node.children = [3];
      },
      'reached twice',
    ],
    [
      'broken nodes',
      (gltf) => {
        const node = gltf.nodes[2];
        if (node) node.children = [999];
      },
      'missing node',
    ],
    [
      'broken meshes',
      (gltf) => {
        const node = gltf.nodes[3];
        if (node) node.mesh = 999;
      },
      'valid mesh',
    ],
    [
      'unreachable nodes',
      (gltf) => {
        gltf.nodes.push({ name: 'unused' });
      },
      'unreachable',
    ],
    [
      'missing scene',
      (gltf) => {
        gltf.scene = 999;
      },
      'group root',
    ],
    [
      'too few triangles',
      (gltf) => {
        const accessor = gltf.accessors[1];
        if (accessor) accessor.count = 300;
      },
      'triangles',
    ],
    [
      'too many triangles',
      (gltf) => {
        const accessor = gltf.accessors[1];
        if (accessor) accessor.count = 3000;
      },
      'triangles',
    ],
    [
      'extra materials',
      (gltf) => {
        gltf.materials.push({ name: 'palette' });
      },
      'one palette',
    ],
    [
      'bad texture source',
      (gltf) => {
        const texture = gltf.textures[0];
        if (texture) texture.source = 9;
      },
      'one palette',
    ],
    [
      'missing clip',
      (gltf) => {
        gltf.animations.pop();
      },
      'six clips',
    ],
    [
      'duplicate clip',
      (gltf) => {
        const clip = gltf.animations[0];
        if (clip) gltf.animations.push(clip);
      },
      'six clips',
    ],
    [
      'empty clips',
      (gltf) => {
        const clip = gltf.animations[0];
        if (clip) clip.channels = [];
      },
      'no animation data',
    ],
    [
      'one pivot',
      (gltf) => {
        for (const clip of gltf.animations)
          clip.channels = [{ sampler: 0, target: { node: 2, path: 'rotation' } }];
      },
      'multiple articulated pivots',
    ],
    [
      'body matrix only',
      (gltf) => {
        const clip = gltf.animations[0];
        if (clip) clip.channels = [{ sampler: 0, target: { node: 1, path: 'rotation' } }];
      },
      'articulated pivots',
    ],
    [
      'broken samplers',
      (gltf) => {
        const clip = gltf.animations[0];
        if (clip) clip.samplers = [];
      },
      'sampler/accessor',
    ],
    [
      'broken animation accessors',
      (gltf) => {
        const clip = gltf.animations[0];
        if (clip) clip.samplers = [{ input: 999, output: 3 }];
      },
      'sampler/accessor',
    ],
    [
      'zero duration',
      (gltf) => {
        const accessor = gltf.accessors[2];
        if (accessor) accessor.max = [0];
      },
      'sampler/accessor',
    ],
    [
      'wrong keyframe count',
      (gltf) => {
        const accessor = gltf.accessors[3];
        if (accessor) accessor.count = 1;
      },
      'sampler/accessor',
    ],
  ];
  it.each(failures)('refuses %s', (_name, mutate, problem) => {
    const gltf = visitorFixture();
    mutate(gltf);
    expect(check(gltf).some((message) => message.includes(problem))).toBe(true);
  });

  it('counts every mesh instance and its accessories against its owner', () => {
    const gltf = visitorFixture('couple');
    const first = gltf.accessors[1];
    if (first) first.count = 2400;
    const reports = checkVisitorModels(
      [{ id: 'couple', content: makeGlb(gltf) }],
      [{ id: 'couple', content: JSON.stringify(visitorDescription('couple')) }],
    );
    expect(reports[0]?.problems).toContain('person 0 has 1600 triangles, outside 800 to 1500');
    expect(reports[0]?.problems).toContain('person 1 has 1600 triangles, outside 800 to 1500');
  });

  it('refuses invalid descriptions but accepts constructor-specific fields', () => {
    expect(check()).toEqual([]);
    expect(check(visitorFixture(), { ...visitorDescription(), version: 2 })[0]).toContain(
      'description is invalid',
    );
    expect(check(visitorFixture(), { ...visitorDescription(), memberCount: 2 })[0]).toContain(
      'description is invalid',
    );
    expect(
      check(visitorFixture(), {
        ...visitorDescription(),
        persons: [{ index: 1, height: 1, width: 1 }],
      })[0],
    ).toContain('description is invalid');
    expect(check(visitorFixture(), visitorDescription('couple'))[0]).toContain('file id');
  });

  it('reports malformed containers, JSON and structures', () => {
    const descriptions = [
      { id: 'teen-photographer', content: JSON.stringify(visitorDescription()) },
    ];
    expect(
      checkVisitorModels([{ id: 'teen-photographer', content: new Uint8Array() }], descriptions)[0]
        ?.problems[0],
    ).toContain('too short');
    expect(
      checkVisitorModels([{ id: 'teen-photographer', content: makeGlb({}) }], descriptions)[0]
        ?.problems[0],
    ).toContain('structure is invalid');
    expect(
      checkVisitorModels(
        [{ id: 'teen-photographer', content: makeGlb(visitorFixture()) }],
        [{ id: 'teen-photographer', content: '{' }],
      )[0]?.problems[0],
    ).toContain('not valid JSON');
  });

  it('pairs files in both directions and refuses duplicates', () => {
    const model = { id: 'teen-photographer', content: makeGlb(visitorFixture()) };
    const description = { id: 'couple', content: JSON.stringify(visitorDescription('couple')) };
    const reports = checkVisitorModels([model], [description]);
    expect(reports[0]?.problems[0]).toContain('no exported model');
    expect(reports[1]?.problems[0]).toContain('tools/blender/visitors/descriptions');
    expect(checkVisitorModels([model, model], [])[0]?.problems[0]).toContain('duplicate');
  });

  it('requires all five archetypes in a production catalogue', () => {
    expect(checkVisitorCatalogue([], [])).toHaveLength(5);
    expect(checkVisitorCatalogue([], []).every((report) => report.problems.length > 0)).toBe(true);
  });

  it('accepts a look clip targeting only the head when other clips articulate other pivots', () => {
    const gltf = visitorFixture();
    const look = gltf.animations.find((clip) => clip.name === 'look');
    if (look) look.channels = [{ sampler: 0, target: { node: 2, path: 'rotation' } }];
    expect(check(gltf)).toEqual([]);
  });

  it('accepts a carried person attached beneath another person while retaining their own budget', () => {
    const gltf = visitorFixture('shoulder-ride');
    const group = gltf.nodes[0];
    const parentPivot = gltf.nodes[2];
    if (group) group.children = [1];
    if (parentPivot) parentPivot.children = [3, 6];
    expect(
      checkVisitorModels(
        [{ id: 'shoulder-ride', content: makeGlb(gltf) }],
        [{ id: 'shoulder-ride', content: JSON.stringify(visitorDescription('shoulder-ride')) }],
      )[0]?.problems,
    ).toEqual([]);
  });

  it.each([800, 1500])('accepts the inclusive per-person triangle boundary %s', (triangles) => {
    const gltf = visitorFixture();
    const indices = gltf.accessors[1];
    if (indices) indices.count = (triangles * 3) / 2;
    expect(check(gltf)).toEqual([]);
  });
});
