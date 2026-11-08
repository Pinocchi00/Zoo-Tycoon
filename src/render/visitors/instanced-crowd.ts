import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  type Material,
  type Object3D,
  type Raycaster,
  type Intersection,
} from 'three';
import type { VisitorId } from '@/shared';
import { randomFloat } from '@/sim/rng';
import type { QualityLevel } from '../quality/quality';
import { isShadowCastingPiece } from './model-source';
import type { VisitorSource, VisitorTint } from './types';
import { tintColor, visualRng } from './visual-seed';

interface SlotPart {
  readonly mesh: InstancedMesh;
  readonly instance: number;
  readonly node: number;
}
export interface PersonSlot {
  readonly visitorId: VisitorId;
  readonly personIndex: number;
  readonly source: VisitorSource;
  readonly width: number;
  readonly height: number;
  readonly colors: Readonly<Record<VisitorTint, Color>>;
  readonly parts: SlotPart[];
}
export interface GroupRenderData {
  readonly id: VisitorId;
  readonly archetypeId: string;
  readonly groupSize: number;
}
interface MeshPool {
  readonly majorBodyPart: boolean;
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  readonly instanceToGroup: VisitorId[];
}
export interface InstancedCrowd {
  setQuality(level: QualityLevel): void;
  readonly slots: readonly PersonSlot[];
  sync(groups: readonly GroupRenderData[], sources: ReadonlyMap<string, VisitorSource>): void;
  writeSlot(slot: PersonSlot, pose: readonly Matrix4[], group: Matrix4): void;
  markMatricesUpdated(): void;
  pick(raycaster: Raycaster, out: { id: VisitorId | null; distance: number }): void;
  hasGroup(id: VisitorId): boolean;
  stats(): { people: number; groups: number; drawCalls: number };
  dispose(): void;
}

export function createInstancedCrowd(
  parent: Object3D,
  material: Material,
  initialQuality: QualityLevel = 'low',
): InstancedCrowd {
  const pools = new Map<string, MeshPool>();
  const poolList: MeshPool[] = [];
  const hits: Intersection[] = [];
  let quality = initialQuality;
  const identities = new Map<VisitorId, Map<number, PersonSlot>>();
  const slots: PersonSlot[] = [];
  const groups = new Set<VisitorId>();
  const matrix = new Matrix4();

  function applyShadow(pool: MeshPool): void {
    pool.mesh.castShadow = quality === 'high' || (quality === 'medium' && pool.majorBodyPart);
  }

  function release(): void {
    for (const pool of pools.values()) {
      pool.mesh.removeFromParent();
      pool.mesh.dispose();
    }
    pools.clear();
    poolList.length = 0;
    hits.length = 0;
    slots.length = 0;
    identities.clear();
    groups.clear();
  }
  return {
    slots,
    setQuality(level) {
      quality = level;
      let index = 0;
      while (index < poolList.length) {
        const pool = poolList[index];
        index += 1;
        if (pool !== undefined) applyShadow(pool);
      }
    },
    sync(data, sources) {
      slots.length = 0;
      groups.clear();
      for (const pool of pools.values()) {
        pool.mesh.count = 0;
        pool.instanceToGroup.length = 0;
      }
      for (const group of data) {
        const source = sources.get(group.archetypeId);
        if (source === undefined) continue;
        const count = Math.max(0, Math.min(group.groupSize, source.memberCount));
        if (count === 0) continue;
        groups.add(group.id);
        const groupRng = visualRng(group.id);
        const width = 0.94 + randomFloat(groupRng) * 0.12;
        const height = 0.95 + randomFloat(groupRng) * 0.1;
        let members = identities.get(group.id);
        if (members === undefined) {
          members = new Map();
          identities.set(group.id, members);
        }
        for (let person = 0; person < count; person += 1) {
          let slot = members.get(person);
          if (slot?.source !== source) {
            const rng = visualRng(`${group.id}:${String(person)}`);
            slot = {
              visitorId: group.id,
              personIndex: person,
              source,
              width,
              height,
              colors: {
                skin: new Color(tintColor(rng, 'skin')),
                hair: new Color(tintColor(rng, 'hair')),
                shirt: new Color(tintColor(rng, 'shirt')),
                pants: new Color(tintColor(rng, 'pants')),
                none: new Color(0xffffff),
              },
              parts: [],
            };
            members.set(person, slot);
          }
          slot.parts.length = 0;
          slots.push(slot);
        }
      }
      for (const id of identities.keys()) if (!groups.has(id)) identities.delete(id);
      for (const source of sources.values()) {
        for (const part of source.parts) {
          const visible = slots.filter(
            (slot) => slot.source === source && slot.personIndex === part.personIndex,
          );
          if (visible.length === 0) continue;
          const key = `${source.archetypeId}:${part.name}`;
          let pool = pools.get(key);
          if (pool === undefined || pool.capacity < visible.length) {
            const previousIndex = pool === undefined ? -1 : poolList.indexOf(pool);
            pool?.mesh.removeFromParent();
            pool?.mesh.dispose();
            const capacity = 2 ** Math.ceil(Math.log2(visible.length));
            const mesh = new InstancedMesh(part.mesh.geometry, material, capacity);
            mesh.name = key;
            mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            mesh.receiveShadow = true;
            // Bounds change with every group; avoid stale bounds hiding or rejecting instances.
            mesh.frustumCulled = false;
            pool = {
              mesh,
              capacity,
              instanceToGroup: [],
              majorBodyPart: isShadowCastingPiece(part.name),
            };
            applyShadow(pool);
            pools.set(key, pool);
            if (previousIndex < 0) poolList.push(pool);
            else poolList[previousIndex] = pool;
            parent.add(mesh);
          }
          pool.mesh.count = visible.length;
          for (let instance = 0; instance < visible.length; instance += 1) {
            const slot = visible[instance];
            if (slot === undefined) continue;
            pool.instanceToGroup[instance] = slot.visitorId;
            pool.mesh.setColorAt(instance, slot.colors[part.tint]);
            slot.parts.push({ mesh: pool.mesh, instance, node: part.meshNodeIndex });
          }
          if (pool.mesh.instanceColor !== null) pool.mesh.instanceColor.needsUpdate = true;
        }
      }
    },
    writeSlot(slot, pose, group) {
      let index = 0;
      while (index < slot.parts.length) {
        const part = slot.parts[index];
        index += 1;
        if (part === undefined) continue;
        const node = pose[part.node];
        if (node === undefined) throw new Error('Missing preallocated visitor pose.');
        matrix.multiplyMatrices(group, node);
        part.mesh.setMatrixAt(part.instance, matrix);
      }
    },
    markMatricesUpdated() {
      let index = 0;
      while (index < poolList.length) {
        const pool = poolList[index];
        index += 1;
        if (pool !== undefined && pool.mesh.count > 0) {
          pool.mesh.instanceMatrix.needsUpdate = true;
          pool.mesh.boundingSphere = null;
          pool.mesh.boundingBox = null;
        }
      }
    },
    pick(raycaster, out) {
      out.id = null;
      out.distance = Number.POSITIVE_INFINITY;
      parent.updateWorldMatrix(true, true);
      let index = 0;
      while (index < poolList.length) {
        const pool = poolList[index];
        index += 1;
        if (pool === undefined) continue;
        if (!pool.mesh.visible || pool.mesh.count === 0) continue;
        let ancestor: Object3D | null = pool.mesh.parent;
        let visible = true;
        while (ancestor !== null) {
          if (!ancestor.visible) visible = false;
          ancestor = ancestor.parent;
        }
        if (!visible) continue;
        hits.length = 0;
        raycaster.intersectObject(pool.mesh, false, hits);
        let hitIndex = 0;
        while (hitIndex < hits.length) {
          const hit = hits[hitIndex];
          hitIndex += 1;
          if (hit === undefined) continue;
          if (hit.instanceId !== undefined && hit.distance < out.distance) {
            const id = pool.instanceToGroup[hit.instanceId];
            if (id !== undefined && groups.has(id)) {
              out.id = id;
              out.distance = hit.distance;
            }
          }
        }
      }
      hits.length = 0;
    },
    hasGroup(id) {
      return groups.has(id);
    },
    stats() {
      let drawCalls = 0;
      for (const pool of pools.values())
        if (pool.mesh.count > 0 && pool.mesh.visible) drawCalls += pool.mesh.castShadow ? 2 : 1;
      return { people: slots.length, groups: groups.size, drawCalls };
    },
    dispose: release,
  };
}
