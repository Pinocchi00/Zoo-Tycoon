import { gltfSchema, type Gltf } from './glb';
import { VISITOR_ANIMATIONS, VISITOR_MEMBERS } from './visitor-rules';

interface VisitorDescriptionFixture {
  id: keyof typeof VISITOR_MEMBERS;
  archetypeId: keyof typeof VISITOR_MEMBERS;
  version: number;
  memberCount: number;
  persons: { index: number; height: number; width: number; hairstyle: string }[];
  constructionSettings: { segments: number };
}

export function visitorDescription(
  id: keyof typeof VISITOR_MEMBERS = 'teen-photographer',
): VisitorDescriptionFixture {
  const memberCount = VISITOR_MEMBERS[id];
  return {
    id,
    archetypeId: id,
    version: 1,
    memberCount,
    persons: Array.from({ length: memberCount }, (_, index) => ({
      index,
      height: 1.7,
      width: 0.5,
      hairstyle: 'short',
    })),
    constructionSettings: { segments: 12 },
  };
}

export function visitorFixture(id: keyof typeof VISITOR_MEMBERS = 'teen-photographer'): Gltf {
  const memberCount = VISITOR_MEMBERS[id];
  const nodes: unknown[] = [
    {
      name: id,
      children: Array.from({ length: memberCount }, (_, index) => 1 + index * 5),
      extras: { zooVisitor: { version: 1, archetypeId: id, memberCount } },
    },
  ];
  for (let index = 0; index < memberCount; index++) {
    const start = nodes.length;
    nodes.push(
      { name: `p${String(index)}_root`, children: [start + 1, start + 3] },
      { name: `p${String(index)}_head_pivot`, children: [start + 2] },
      { name: `p${String(index)}_head`, mesh: 0, extras: { zooPerson: index, zooTint: 'skin' } },
      { name: `p${String(index)}_arm_pivot`, children: [start + 4] },
      { name: `p${String(index)}_arm`, mesh: 0, extras: { zooPerson: index, zooTint: 'shirt' } },
    );
  }
  return gltfSchema.parse({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [
      { count: 100, min: [-0.1, 0, -0.1], max: [0.1, 1, 0.1], type: 'VEC3' },
      { count: 1500, type: 'SCALAR' },
      { count: 2, min: [0], max: [1], type: 'SCALAR', componentType: 5126 },
      { count: 2, type: 'VEC4', componentType: 5126 },
    ],
    materials: [{ name: 'palette' }],
    textures: [{ source: 0 }],
    images: [{ name: 'palette' }],
    animations: VISITOR_ANIMATIONS.map((name) => ({
      name,
      channels: Array.from({ length: memberCount }, (_, index) => [2 + index * 5, 4 + index * 5])
        .flat()
        .map((node) => ({ sampler: 0, target: { node, path: 'rotation' } })),
      samplers: [{ input: 2, output: 3 }],
    })),
  });
}
