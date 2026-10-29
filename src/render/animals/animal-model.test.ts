import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  VectorKeyframeTrack,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createAnimalModel, loadAnimalModel, parseAnimalModel, pickClip } from './animal-model';

const SLIDE_X_M = 1;

/** A clip that slides the root 1 m along X in 1 s, easy to observe. */
function slideClip(name: string): AnimationClip {
  return new AnimationClip(name, 1, [
    new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, SLIDE_X_M, 0, 0]),
  ]);
}

function texturedScene(): { scene: Group; mesh: Mesh; material: MeshStandardMaterial } {
  const material = new MeshStandardMaterial({ map: new Texture() });
  const mesh = new Mesh(new BoxGeometry(), material);
  const scene = new Group();
  scene.add(mesh);
  return { scene, mesh, material };
}

describe('pickClip', () => {
  const idle = new AnimationClip('idle', 4, []);
  const walk = new AnimationClip('walk', 1, []);

  it('finds a clip by name', () => {
    expect(pickClip([walk, idle], 'idle')).toEqual({ ok: true, value: idle });
  });

  it('reports a missing clip instead of throwing', () => {
    expect(pickClip([walk], 'idle')).toEqual({
      ok: false,
      error: { kind: 'missingClip', name: 'idle' },
    });
    expect(pickClip([], 'walk').ok).toBe(false);
  });
});

describe('createAnimalModel', () => {
  it('plays the requested clip in a loop as time advances', () => {
    const { scene, mesh } = texturedScene();
    const created = createAnimalModel(
      { scene, animations: [slideClip('walk'), slideClip('idle')] },
      'idle',
    );
    if (!created.ok) {
      throw new Error('expected a model');
    }
    expect(created.value.root).toBe(scene);
    expect(mesh.castShadow).toBe(true);

    created.value.update(500);
    expect(scene.position.x).toBeCloseTo(SLIDE_X_M / 2);
    // 1.25 s into a 1 s loop is 0.25 s into the second lap.
    created.value.update(750);
    expect(scene.position.x).toBeCloseTo(SLIDE_X_M / 4);
  });

  it('refuses a model without the clip and frees its GPU resources', () => {
    const { scene, mesh, material } = texturedScene();
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const mapDispose = vi.spyOn(material.map ?? new Texture(), 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    expect(createAnimalModel({ scene, animations: [slideClip('walk')] }, 'idle')).toEqual({
      ok: false,
      error: { kind: 'missingClip', name: 'idle' },
    });
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(mapDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('dispose detaches the model, frees it and stops the animation', () => {
    const { scene, material } = texturedScene();
    const parent = new Group();
    parent.add(scene);
    const created = createAnimalModel({ scene, animations: [slideClip('idle')] }, 'idle');
    if (!created.ok) {
      throw new Error('expected a model');
    }
    const materialDispose = vi.spyOn(material, 'dispose');
    created.value.dispose();
    expect(parent.children).toEqual([]);
    expect(materialDispose).toHaveBeenCalledOnce();

    created.value.update(500);
    expect(scene.position.x).toBe(0);
  });
});

const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function padded(bytes: Uint8Array, filler: number): Uint8Array {
  const length = Math.ceil(bytes.byteLength / 4) * 4;
  const out = new Uint8Array(length).fill(filler);
  out.set(bytes);
  return out;
}

/** Smallest .glb with an animated node: times [0, 1], translations (0,0,0) then (1,0,0). */
function animatedGlb(animation: string): ArrayBuffer {
  const bin = new Uint8Array(new Float32Array([0, 1, 0, 0, 0, SLIDE_X_M, 0, 0]).buffer);
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'root' }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 24 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 1, componentType: 5126, count: 2, type: 'VEC3' },
    ],
    animations: [
      {
        name: animation,
        samplers: [{ input: 0, output: 1 }],
        channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
      },
    ],
  };
  const json = padded(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const body = padded(bin, 0);
  const total = GLB_HEADER_BYTES + 2 * CHUNK_HEADER_BYTES + json.byteLength + body.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  out.set(json, 20);
  const binStart = 20 + json.byteLength;
  view.setUint32(binStart, body.byteLength, true);
  view.setUint32(binStart + 4, BIN_CHUNK, true);
  out.set(body, binStart + CHUNK_HEADER_BYTES);
  return out.buffer;
}

describe('parseAnimalModel', () => {
  it('decodes a .glb and plays its idle animation', async () => {
    const parsed = await parseAnimalModel(animatedGlb('idle'), 'idle');
    if (!parsed.ok) {
      throw new Error('expected a model');
    }
    parsed.value.update(500);
    const node = parsed.value.root.getObjectByName('root');
    expect(node?.position.x).toBeCloseTo(SLIDE_X_M / 2);
  });

  it('reports a .glb without idle', async () => {
    expect(await parseAnimalModel(animatedGlb('sleep'), 'idle')).toEqual({
      ok: false,
      error: { kind: 'missingClip', name: 'idle' },
    });
  });
});

describe('loadAnimalModel', () => {
  it('downloads then decodes the model', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(animatedGlb('idle'))));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const loaded = await loadAnimalModel('/capybara.glb', 'idle');
      expect(fetchMock).toHaveBeenCalledWith('/capybara.glb');
      expect(loaded.ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects when the download fails', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
    try {
      await expect(loadAnimalModel('/missing.glb', 'idle')).rejects.toThrow('HTTP 404');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
