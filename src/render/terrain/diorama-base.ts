import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { gridDepth, gridWidth, type GridSize } from '@/shared';

interface Layer {
  readonly color: number;
  readonly thickness: number;
  /** How far the layer is set back from the grass edge: lower layers recede like a cut cake. */
  readonly inset: number;
}

/** From top to bottom. The grass top sits exactly at y = 0, where things will be built. */
const LAYERS: readonly Layer[] = [
  { color: 0x8cbf5a, thickness: 0.6, inset: 0 },
  { color: 0x9a6b43, thickness: 2.6, inset: 0.15 },
  { color: 0x7a5235, thickness: 2, inset: 0.3 },
  { color: 0x8d8478, thickness: 1.6, inset: 0.5 },
];

/** Matte and slightly warm: the diorama should look painted, never plastic. */
const ROUGHNESS = 0.95;

/** The park's ground block, with its soil layers showing on the sides. */
export function createDioramaBase(grid: GridSize): Group {
  const base = new Group();
  base.name = 'diorama-base';
  let top = 0;
  for (const layer of LAYERS) {
    const geometry = new BoxGeometry(
      gridWidth(grid) - layer.inset * 2,
      layer.thickness,
      gridDepth(grid) - layer.inset * 2,
    );
    const material = new MeshStandardMaterial({
      color: layer.color,
      roughness: ROUGHNESS,
      metalness: 0,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.y = top - layer.thickness / 2;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    base.add(mesh);
    top -= layer.thickness;
  }
  return base;
}
