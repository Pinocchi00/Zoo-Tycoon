// Small in-memory models for the asset check tests.

const JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;
const PADDING_ALIGNMENT = 4;
const SPACE = 0x20;

/** Wraps a JSON value in a binary glTF container. */
export function makeGlb(json: unknown): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.byteLength / PADDING_ALIGNMENT) * PADDING_ALIGNMENT;
  const bytes = new Uint8Array(12 + 8 + padded).fill(SPACE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, JSON_CHUNK_TYPE, true);
  bytes.set(encoded, 20);
  return bytes;
}

export interface FixtureOptions {
  readonly triangles?: number;
  readonly animations?: readonly string[];
  readonly materials?: readonly string[];
  readonly images?: number;
  readonly lengthM?: number;
  readonly scale?: readonly [number, number, number];
}

/** A model that follows every rule unless an option breaks one. */
export function makeModelJson(options: FixtureOptions = {}): Record<string, unknown> {
  const lengthM = options.lengthM ?? 1.1;
  const images = options.images ?? 1;
  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [1] }],
    nodes: [
      { name: 'capybara', mesh: 0 },
      { name: 'skeleton', children: [0], ...(options.scale ? { scale: options.scale } : {}) },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [
      { count: 100, min: [-0.25, 0, -lengthM / 2], max: [0.25, 0.7, lengthM / 2] },
      { count: (options.triangles ?? 2000) * 3 },
    ],
    materials: (options.materials ?? ['palette']).map((name) => ({ name })),
    textures: Array.from({ length: images }, () => ({ source: 0 })),
    images: Array.from({ length: images }, () => ({ name: 'palette' })),
    animations: (options.animations ?? ['idle', 'walk', 'sleep', 'eat', 'swim']).map((name) => ({
      name,
    })),
  };
}

export const VALID_DESCRIPTION = {
  id: 'capybara',
  family: 'rodent',
  lengthM: 1.1,
  signatures: ['a', 'b', 'c'],
  signature: 'swim',
  bones: [{ name: 'root', head: [0, 0, 0], tail: [0, 0, 1] }],
  parts: [
    {
      name: 'body',
      kind: 'body',
      bone: 'root',
      color: 'fur',
      center: [0, 0.4, 0],
      radii: [0.2, 0.2, 0.4],
      segments: 8,
      rings: 6,
    },
  ],
  animations: {
    idle: {
      durationS: 4,
      breathsPerLoop: 2,
      breathScale: 0.03,
      blinkAtS: 2,
      earTwitchAtS: 1,
      earTwitchDeg: 20,
      headNodDeg: 2,
    },
    walk: { durationS: 1, legSwingDeg: 24, bodyBobM: 0.01, headNodDeg: 3 },
    sleep: {
      durationS: 6,
      breathsPerLoop: 2,
      breathScale: 0.02,
      bodyDropM: 0.1,
      headDropDeg: 20,
    },
    eat: { durationS: 3, headDipDeg: 40, chewCount: 4, chewDeg: 5 },
    swim: { durationS: 2, paddleDeg: 30, rollDeg: 4, undulationDeg: 4, tailSwayDeg: 10 },
  },
};
