import { z } from 'zod';
import type { Gltf, GltfNode, GltfPrimitive } from './glb';

export const VISITOR_MEMBERS = {
  'stroller-family': 4,
  'shoulder-ride': 2,
  couple: 2,
  'teen-photographer': 1,
  retirees: 2,
} as const;
export const VISITOR_ANIMATIONS = ['walk', 'stop', 'look', 'point', 'photo', 'sit'] as const;
export const VISITOR_MIN_TRIANGLES = 800;
export const VISITOR_MAX_TRIANGLES = 1500;
const MIN_ANIMATED_PIVOTS = 2;
const TRIANGLE_MODE = 4;
const TRIANGLE_VERTICES = 3;
const STRIP_OVERHEAD = 2;
const CUBIC_SPLINE_MULTIPLIER = 3;

const archetypeSchema = z.enum([
  'stroller-family',
  'shoulder-ride',
  'couple',
  'teen-photographer',
  'retirees',
]);
export const VISITOR_ARCHETYPES = archetypeSchema.options;
const visitorMetadataSchema = z.object({
  version: z.literal(1),
  archetypeId: archetypeSchema,
  memberCount: z.number().int().positive(),
});
const tintSchema = z.enum(['skin', 'hair', 'shirt', 'pants', 'none']);

export const visitorDescriptionSchema = visitorMetadataSchema
  .extend({
    id: archetypeSchema,
    persons: z.array(
      z.object({
        index: z.number().int().nonnegative(),
        height: z.number().positive(),
        width: z.number().positive(),
      }),
    ),
  })
  .superRefine((description, context) => {
    const count = VISITOR_MEMBERS[description.archetypeId];
    if (
      description.id !== description.archetypeId ||
      description.memberCount !== count ||
      description.persons.length !== count ||
      description.persons.some((person, index) => person.index !== index)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'visitor identity, count and ordered person indices must agree with the archetype',
      });
    }
  });

export type VisitorDescription = z.infer<typeof visitorDescriptionSchema>;

class VisitorInspection {
  readonly problems: string[] = [];
  readonly reached = new Set<number>();
  readonly pivots = new Set<number>();
  readonly triangles: number[];

  constructor(
    readonly gltf: Gltf,
    readonly description: VisitorDescription,
  ) {
    this.triangles = Array.from({ length: description.memberCount }, () => 0);
  }

  inspectScene(): void {
    const scene = this.gltf.scenes[this.gltf.scene ?? 0];
    if (scene === undefined || scene.nodes?.length !== 1) {
      this.problems.push('visitor scene must have exactly one group root');
      return;
    }
    const rootIndex = scene.nodes[0];
    const root = rootIndex === undefined ? undefined : this.gltf.nodes[rootIndex];
    const metadata = visitorMetadataSchema.safeParse(root?.extras?.['zooVisitor']);
    if (
      root?.name !== this.description.archetypeId ||
      !metadata.success ||
      metadata.data.archetypeId !== this.description.archetypeId ||
      metadata.data.memberCount !== this.description.memberCount
    ) {
      this.problems.push('group root has invalid zooVisitor metadata or name');
    }
    if (rootIndex !== undefined) this.walk(rootIndex, undefined);
    if (this.reached.size !== this.gltf.nodes.length) {
      this.problems.push('visitor contains unreachable nodes');
    }
    for (let person = 0; person < this.description.memberCount; person++) {
      const count = this.triangles[person] ?? 0;
      const roots = [...this.reached].filter(
        (index) => this.gltf.nodes[index]?.name === `p${String(person)}_root`,
      );
      if (roots.length !== 1) this.problems.push(`person ${String(person)} needs exactly one root`);
      if (count < VISITOR_MIN_TRIANGLES || count > VISITOR_MAX_TRIANGLES) {
        this.problems.push(
          `person ${String(person)} has ${String(count)} triangles, outside 800 to 1500`,
        );
      }
    }
  }

  private walk(index: number, owner: number | undefined): boolean {
    const node = this.gltf.nodes[index];
    if (node === undefined) {
      this.problems.push(`missing node #${String(index)}`);
      return false;
    }
    if (this.reached.has(index)) {
      this.problems.push(`node #${String(index)} is reached twice (cycle or shared node)`);
      return false;
    }
    this.reached.add(index);
    const rootOwner = this.description.persons.find(
      (person) => node.name === `p${String(person.index)}_root`,
    )?.index;
    const person = rootOwner ?? owner;
    if (node.skin !== undefined) this.problems.push('visitor pieces must be unskinned');
    if (node.mesh !== undefined) this.inspectPiece(node, person);
    let movesMesh = node.mesh !== undefined;
    for (const child of node.children ?? []) {
      const childMovesMesh = this.walk(child, person);
      movesMesh = movesMesh || childMovesMesh;
    }
    if (movesMesh && node.mesh === undefined && person !== undefined && rootOwner === undefined)
      this.pivots.add(index);
    return movesMesh;
  }

  private inspectPiece(node: GltfNode, owner: number | undefined): void {
    const person = node.extras?.['zooPerson'];
    if (
      owner === undefined ||
      person !== owner ||
      !tintSchema.safeParse(node.extras?.['zooTint']).success ||
      !node.name?.startsWith(`p${String(owner)}_`)
    ) {
      this.problems.push(
        `piece ${node.name ?? '(unnamed)'} has invalid person, name or tint metadata`,
      );
    }
    const mesh = node.mesh === undefined ? undefined : this.gltf.meshes[node.mesh];
    if (mesh === undefined || mesh.primitives.length === 0) {
      this.problems.push(`piece ${node.name ?? '(unnamed)'} has no valid mesh`);
      return;
    }
    for (const primitive of mesh.primitives) {
      const triangles = this.inspectPrimitive(primitive);
      if (owner !== undefined) this.triangles[owner] = (this.triangles[owner] ?? 0) + triangles;
    }
  }

  private inspectPrimitive(primitive: GltfPrimitive): number {
    if (primitive.material !== 0)
      this.problems.push('visitor primitive must use the palette material');
    for (const reference of Object.values(primitive.attributes)) {
      if (this.gltf.accessors[reference] === undefined)
        this.problems.push(`missing attribute accessor #${String(reference)}`);
    }
    const positionIndex = primitive.attributes['POSITION'];
    const position = positionIndex === undefined ? undefined : this.gltf.accessors[positionIndex];
    if (position?.min?.length !== 3 || position.max?.length !== 3 || position.count === 0) {
      this.problems.push('visitor primitive needs POSITION bounds and vertices');
    }
    if ('JOINTS_0' in primitive.attributes || 'WEIGHTS_0' in primitive.attributes) {
      this.problems.push('visitor primitive must be unskinned');
    }
    const source = primitive.indices ?? positionIndex;
    const accessor = source === undefined ? undefined : this.gltf.accessors[source];
    if (accessor === undefined) {
      this.problems.push('visitor primitive has a missing index or POSITION accessor');
      return 0;
    }
    const mode = primitive.mode ?? TRIANGLE_MODE;
    if (mode === TRIANGLE_MODE) {
      if (accessor.count % TRIANGLE_VERTICES !== 0)
        this.problems.push('incomplete triangle indices');
      return Math.floor(accessor.count / TRIANGLE_VERTICES);
    }
    if (mode === 5 || mode === 6) return Math.max(0, accessor.count - STRIP_OVERHEAD);
    this.problems.push(`unsupported visitor primitive mode ${String(mode)}`);
    return 0;
  }

  inspectAnimations(): void {
    const modelTargets = new Set<number>();
    const names = this.gltf.animations.map((animation) => animation.name);
    if (
      names.length !== VISITOR_ANIMATIONS.length ||
      VISITOR_ANIMATIONS.some((name) => names.filter((found) => found === name).length !== 1)
    ) {
      this.problems.push('visitor requires exactly six clips: walk, stop, look, point, photo, sit');
    }
    for (const animation of this.gltf.animations) {
      const targetPaths = new Set<string>();
      const channels = animation.channels ?? [];
      const samplers = animation.samplers ?? [];
      if (channels.length === 0 || samplers.length === 0)
        this.problems.push(`clip ${animation.name ?? '(unnamed)'} has no animation data`);
      for (const channel of channels) {
        const target = channel.target.node;
        if (
          target === undefined ||
          !this.reached.has(target) ||
          !this.pivots.has(target) ||
          !['translation', 'rotation', 'scale'].includes(channel.target.path)
        ) {
          this.problems.push(
            `clip ${animation.name ?? '(unnamed)'} must target reachable articulated pivots`,
          );
          continue;
        }
        modelTargets.add(target);
        const targetPath = `${String(target)}:${channel.target.path}`;
        if (targetPaths.has(targetPath))
          this.problems.push(`clip ${animation.name ?? '(unnamed)'} has duplicate target channels`);
        targetPaths.add(targetPath);
        const sampler = samplers[channel.sampler];
        const input = sampler === undefined ? undefined : this.gltf.accessors[sampler.input];
        const output = sampler === undefined ? undefined : this.gltf.accessors[sampler.output];
        const multiplier = sampler?.interpolation === 'CUBICSPLINE' ? CUBIC_SPLINE_MULTIPLIER : 1;
        const duration = (input?.max?.[0] ?? 0) - (input?.min?.[0] ?? 0);
        const expectedType = channel.target.path === 'rotation' ? 'VEC4' : 'VEC3';
        if (
          input === undefined ||
          output === undefined ||
          input.count < 2 ||
          duration <= 0 ||
          input.type !== 'SCALAR' ||
          output.type !== expectedType ||
          output.count !== input.count * multiplier ||
          !['LINEAR', 'STEP', 'CUBICSPLINE'].includes(sampler?.interpolation ?? 'LINEAR')
        ) {
          this.problems.push(
            `clip ${animation.name ?? '(unnamed)'} has invalid sampler/accessor data`,
          );
        }
      }
    }
    if (modelTargets.size < MIN_ANIMATED_PIVOTS)
      this.problems.push('visitor animations must animate multiple articulated pivots');
  }
}

/** Visitor rules are deliberately separate from animal budgets and signature animations. */
export function checkVisitorModel(gltf: Gltf, description: VisitorDescription): readonly string[] {
  const inspection = new VisitorInspection(gltf, description);
  if (gltf.asset.version !== '2.0') inspection.problems.push('visitor glTF version must be 2.0');
  if (
    gltf.materials.length !== 1 ||
    gltf.materials[0]?.name !== 'palette' ||
    gltf.textures.length !== 1 ||
    gltf.images.length !== 1 ||
    gltf.textures[0]?.source !== 0
  ) {
    inspection.problems.push('visitor requires one palette material, texture and image');
  }
  const names = gltf.nodes.flatMap((node) => (node.name === undefined ? [] : [node.name]));
  if (new Set(names).size !== names.length)
    inspection.problems.push('visitor node names must be unique');
  inspection.inspectScene();
  inspection.inspectAnimations();
  return inspection.problems;
}
