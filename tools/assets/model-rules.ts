// Rules every exported animal model must follow (GDD, "Fabrication des modèles 3D"
// and "Budgets de performance").
import type { Gltf, GltfNode, GltfPrimitive } from './glb';

/** "Animal (près)" budget of the GDD. */
export const MIN_TRIANGLES = 1500;
export const MAX_TRIANGLES = 4000;
export const REQUIRED_ANIMATIONS = ['idle', 'walk'] as const;
/** The shared palette material is the only one allowed. */
export const ALLOWED_MATERIALS = ['palette'] as const;
export const PALETTE_IMAGE_COUNT = 1;
/** Measured length may differ from the description by this fraction. */
export const LENGTH_TOLERANCE = 0.1;
const UNIT_SCALE_EPSILON = 1e-4;

const MODE_TRIANGLES = 4;
const MODE_TRIANGLE_STRIP = 5;
const MODE_TRIANGLE_FAN = 6;
const VERTICES_PER_TRIANGLE = 3;
const STRIP_OVERHEAD = 2;

export type ModelIssue =
  | { readonly kind: 'unsupportedVersion'; readonly version: string }
  | { readonly kind: 'noScene' }
  | { readonly kind: 'brokenReference'; readonly what: string; readonly index: number }
  | { readonly kind: 'nodeCycle'; readonly node: number }
  | { readonly kind: 'noMesh' }
  | { readonly kind: 'unsupportedPrimitiveMode'; readonly mode: number }
  | {
      readonly kind: 'triangleBudget';
      readonly count: number;
      readonly min: number;
      readonly max: number;
    }
  | { readonly kind: 'missingAnimation'; readonly name: string }
  | { readonly kind: 'paletteImageCount'; readonly images: number; readonly textures: number }
  | { readonly kind: 'unknownMaterial'; readonly name: string }
  | { readonly kind: 'primitiveWithoutMaterial' }
  | { readonly kind: 'missingBounds' }
  | { readonly kind: 'scaledNode'; readonly node: string }
  | { readonly kind: 'lengthOutOfTolerance'; readonly expectedM: number; readonly actualM: number };

export interface ModelExpectations {
  readonly lengthM: number;
}

type Vec3 = readonly [number, number, number];

/** Rotation-scale basis (three columns) plus translation. */
interface Affine {
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
  readonly t: Vec3;
}

const IDENTITY: Affine = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], t: [0, 0, 0] };

function scaled(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function applyBasis(m: Affine, v: Vec3): Vec3 {
  return [
    m.x[0] * v[0] + m.y[0] * v[1] + m.z[0] * v[2],
    m.x[1] * v[0] + m.y[1] * v[1] + m.z[1] * v[2],
    m.x[2] * v[0] + m.y[2] * v[1] + m.z[2] * v[2],
  ];
}

function applyPoint(m: Affine, v: Vec3): Vec3 {
  const [x, y, z] = applyBasis(m, v);
  return [x + m.t[0], y + m.t[1], z + m.t[2]];
}

function combine(parent: Affine, child: Affine): Affine {
  return {
    x: applyBasis(parent, child.x),
    y: applyBasis(parent, child.y),
    z: applyBasis(parent, child.z),
    t: applyPoint(parent, child.t),
  };
}

function localTransform(node: GltfNode): Affine {
  if (node.matrix !== undefined) {
    const [a, b, c, , d, e, f, , g, h, i, , tx, ty, tz] = node.matrix;
    return { x: [a, b, c], y: [d, e, f], z: [g, h, i], t: [tx, ty, tz] };
  }
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return {
    x: scaled([1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw)], sx),
    y: scaled([2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw)], sy),
    z: scaled([2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy)], sz),
    t: node.translation ?? [0, 0, 0],
  };
}

function hasUnitScale(m: Affine): boolean {
  return [m.x, m.y, m.z].every((axis) => Math.abs(length(axis) - 1) < UNIT_SCALE_EPSILON);
}

interface MeshInstance {
  readonly mesh: number;
  readonly world: Affine;
}

interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

class Inspection {
  readonly issues: ModelIssue[] = [];
  readonly instances: MeshInstance[] = [];

  constructor(private readonly gltf: Gltf) {}

  walkScene(): void {
    const scene = this.gltf.scenes[this.gltf.scene ?? 0];
    if (scene === undefined) {
      this.issues.push({ kind: 'noScene' });
      return;
    }
    const visited = new Set<number>();
    for (const root of scene.nodes ?? []) {
      this.walkNode(root, IDENTITY, visited);
    }
  }

  private walkNode(index: number, parent: Affine, visited: Set<number>): void {
    const node = this.gltf.nodes[index];
    if (node === undefined) {
      this.issues.push({ kind: 'brokenReference', what: 'node', index });
      return;
    }
    if (visited.has(index)) {
      this.issues.push({ kind: 'nodeCycle', node: index });
      return;
    }
    visited.add(index);
    const local = localTransform(node);
    if (!hasUnitScale(local)) {
      this.issues.push({ kind: 'scaledNode', node: node.name ?? `#${String(index)}` });
    }
    const world = combine(parent, local);
    if (node.mesh !== undefined) {
      this.instances.push({ mesh: node.mesh, world });
    }
    for (const child of node.children ?? []) {
      this.walkNode(child, world, visited);
    }
  }

  primitives(mesh: number): readonly GltfPrimitive[] {
    const found = this.gltf.meshes[mesh];
    if (found === undefined) {
      this.issues.push({ kind: 'brokenReference', what: 'mesh', index: mesh });
      return [];
    }
    return found.primitives;
  }

  accessorCount(index: number): number {
    const accessor = this.gltf.accessors[index];
    if (accessor === undefined) {
      this.issues.push({ kind: 'brokenReference', what: 'accessor', index });
      return 0;
    }
    return accessor.count;
  }
}

function primitiveTriangles(inspection: Inspection, primitive: GltfPrimitive): number {
  const position = primitive.attributes['POSITION'];
  const indexSource = primitive.indices ?? position;
  if (indexSource === undefined) {
    inspection.issues.push({ kind: 'missingBounds' });
    return 0;
  }
  const count = inspection.accessorCount(indexSource);
  const mode = primitive.mode ?? MODE_TRIANGLES;
  switch (mode) {
    case MODE_TRIANGLES:
      return Math.floor(count / VERTICES_PER_TRIANGLE);
    case MODE_TRIANGLE_STRIP:
    case MODE_TRIANGLE_FAN:
      return Math.max(0, count - STRIP_OVERHEAD);
    default:
      inspection.issues.push({ kind: 'unsupportedPrimitiveMode', mode });
      return 0;
  }
}

function checkTriangles(inspection: Inspection): void {
  let count = 0;
  for (const instance of inspection.instances) {
    for (const primitive of inspection.primitives(instance.mesh)) {
      count += primitiveTriangles(inspection, primitive);
    }
  }
  if (count < MIN_TRIANGLES || count > MAX_TRIANGLES) {
    inspection.issues.push({
      kind: 'triangleBudget',
      count,
      min: MIN_TRIANGLES,
      max: MAX_TRIANGLES,
    });
  }
}

function checkAnimations(gltf: Gltf, issues: ModelIssue[]): void {
  const names = new Set(gltf.animations.map((animation) => animation.name));
  for (const name of REQUIRED_ANIMATIONS) {
    if (!names.has(name)) {
      issues.push({ kind: 'missingAnimation', name });
    }
  }
}

function checkPalette(inspection: Inspection, gltf: Gltf): void {
  const { issues } = inspection;
  if (gltf.images.length !== PALETTE_IMAGE_COUNT || gltf.textures.length !== PALETTE_IMAGE_COUNT) {
    issues.push({
      kind: 'paletteImageCount',
      images: gltf.images.length,
      textures: gltf.textures.length,
    });
  }
  const allowed: readonly string[] = ALLOWED_MATERIALS;
  for (const material of gltf.materials) {
    const name = material.name ?? '(unnamed)';
    if (!allowed.includes(name)) {
      issues.push({ kind: 'unknownMaterial', name });
    }
  }
  for (const instance of inspection.instances) {
    for (const primitive of inspection.primitives(instance.mesh)) {
      if (primitive.material === undefined) {
        issues.push({ kind: 'primitiveWithoutMaterial' });
      } else if (gltf.materials[primitive.material] === undefined) {
        issues.push({ kind: 'brokenReference', what: 'material', index: primitive.material });
      }
    }
  }
}

function extendBounds(bounds: Bounds, point: Vec3): void {
  for (const axis of [0, 1, 2] as const) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
  }
}

function worldBounds(inspection: Inspection, gltf: Gltf): Bounds | undefined {
  const bounds: Bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const instance of inspection.instances) {
    for (const primitive of inspection.primitives(instance.mesh)) {
      const position = primitive.attributes['POSITION'];
      const accessor = position === undefined ? undefined : gltf.accessors[position];
      const [minX, minY, minZ] = accessor?.min ?? [];
      const [maxX, maxY, maxZ] = accessor?.max ?? [];
      if (
        minX === undefined ||
        minY === undefined ||
        minZ === undefined ||
        maxX === undefined ||
        maxY === undefined ||
        maxZ === undefined
      ) {
        inspection.issues.push({ kind: 'missingBounds' });
        return undefined;
      }
      for (const x of [minX, maxX]) {
        for (const y of [minY, maxY]) {
          for (const z of [minZ, maxZ]) {
            extendBounds(bounds, applyPoint(instance.world, [x, y, z]));
          }
        }
      }
    }
  }
  return bounds;
}

function checkLength(inspection: Inspection, gltf: Gltf, expectations: ModelExpectations): void {
  const bounds = worldBounds(inspection, gltf);
  if (bounds === undefined) {
    return;
  }
  // Animals stand on the ground (Y up): their length is the longest horizontal extent.
  const actualM = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
  const deviation = Math.abs(actualM - expectations.lengthM) / expectations.lengthM;
  if (deviation > LENGTH_TOLERANCE) {
    inspection.issues.push({
      kind: 'lengthOutOfTolerance',
      expectedM: expectations.lengthM,
      actualM,
    });
  }
}

/** Every rule broken by the model; an empty list means the model is accepted. */
export function checkModel(gltf: Gltf, expectations: ModelExpectations): readonly ModelIssue[] {
  const inspection = new Inspection(gltf);
  if (gltf.asset.version !== '2.0') {
    inspection.issues.push({ kind: 'unsupportedVersion', version: gltf.asset.version });
  }
  inspection.walkScene();
  if (inspection.instances.length === 0) {
    inspection.issues.push({ kind: 'noMesh' });
  } else {
    checkTriangles(inspection);
    checkPalette(inspection, gltf);
    checkLength(inspection, gltf, expectations);
  }
  checkAnimations(gltf, inspection.issues);
  return inspection.issues;
}

export function describeIssue(issue: ModelIssue): string {
  switch (issue.kind) {
    case 'unsupportedVersion':
      return `glTF version ${issue.version} is not 2.0`;
    case 'noScene':
      return 'the file has no scene';
    case 'brokenReference':
      return `a reference points to missing ${issue.what} #${String(issue.index)}`;
    case 'nodeCycle':
      return `node #${String(issue.node)} is reached twice (cycle or shared node)`;
    case 'noMesh':
      return 'the scene contains no mesh';
    case 'unsupportedPrimitiveMode':
      return `primitive mode ${String(issue.mode)} is not made of triangles`;
    case 'triangleBudget':
      return `${String(issue.count)} triangles, outside the budget of ${String(issue.min)} to ${String(issue.max)}`;
    case 'missingAnimation':
      return `mandatory animation "${issue.name}" is missing`;
    case 'paletteImageCount':
      return `expected exactly one palette texture, found ${String(issue.images)} image(s) and ${String(issue.textures)} texture(s)`;
    case 'unknownMaterial':
      return `material "${issue.name}" is not the shared palette material`;
    case 'primitiveWithoutMaterial':
      return 'a primitive has no material';
    case 'missingBounds':
      return 'a primitive has no POSITION bounds, its size cannot be checked';
    case 'scaledNode':
      return `node "${issue.node}" is scaled: models must be built at real size`;
    case 'lengthOutOfTolerance':
      return `model is ${issue.actualM.toFixed(2)} m long, the description says ${issue.expectedM.toFixed(2)} m (±${String(LENGTH_TOLERANCE * 100)} %)`;
  }
}
