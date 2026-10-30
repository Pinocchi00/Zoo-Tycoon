import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  VectorKeyframeTrack,
  Quaternion,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  cloneAnimalSource,
  createAnimalModel,
  disposeAnimalSource,
  findSignatureClip,
  loadAnimalSource,
  parseAnimalSource,
  pickClip,
  walkClipScale,
  WALK_REFERENCE_SPEED_MPS,
  type AnimalLook,
  type AnimalSource,
} from './animal-model';

const SLIDE_X_M = 1;
const SLEEP_SCALE = 2;
const FADE_MS = 400;
const LOOK: AnimalLook = { startPhase: 0, timeScale: 1, seed: 1 };

/** A clip that slides the root 1 m along X in 1 s, easy to observe. */
function slideClip(name: string): AnimationClip {
  return new AnimationClip(name, 1, [
    new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, SLIDE_X_M, 0, 0]),
  ]);
}

/** A clip that scales the root from 1 to `SLEEP_SCALE` in 1 s: it never touches the position. */
function scaleClip(name: string): AnimationClip {
  return new AnimationClip(name, 1, [
    new VectorKeyframeTrack('.scale', [0, 1], [1, 1, 1, SLEEP_SCALE, SLEEP_SCALE, SLEEP_SCALE]),
  ]);
}

function fullClips(signature = 'swim'): AnimationClip[] {
  return [
    slideClip('idle'),
    slideClip('walk'),
    scaleClip('sleep'),
    scaleClip('eat'),
    scaleClip(signature),
  ];
}

function texturedScene(): { scene: Group; mesh: Mesh; material: MeshStandardMaterial } {
  const material = new MeshStandardMaterial({ map: new Texture() });
  const mesh = new Mesh(new BoxGeometry(), material);
  const scene = new Group();
  scene.add(mesh);
  return { scene, mesh, material };
}

function fullSource(signature = 'swim'): AnimalSource & {
  scene: Group;
  mesh: Mesh;
  material: MeshStandardMaterial;
} {
  return { ...texturedScene(), animations: fullClips(signature) };
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

describe('findSignatureClip', () => {
  const required = ['idle', 'walk', 'sleep', 'eat'].map((name) => new AnimationClip(name, 1, []));

  it('is the one clip that is not required', () => {
    const swim = new AnimationClip('swim', 1, []);
    expect(findSignatureClip([...required, swim])).toEqual({ ok: true, value: swim });
  });

  it('refuses a model without a signature', () => {
    expect(findSignatureClip(required)).toEqual({
      ok: false,
      error: { kind: 'badSignature', clips: [] },
    });
  });

  it('ignores clips it does not know, even several, next to the signature', () => {
    const swim = new AnimationClip('swim', 1, []);
    const unknown = ['scratch', 'shake'].map((name) => new AnimationClip(name, 1, []));
    expect(findSignatureClip([...required, unknown[0] ?? swim, swim, unknown[1] ?? swim])).toEqual({
      ok: true,
      value: swim,
    });
    // A single extra clip is taken for the signature whatever its name: new species come that way.
    const odd = new AnimationClip('wallow', 1, []);
    expect(findSignatureClip([...required, odd])).toEqual({ ok: true, value: odd });
  });

  it('refuses several unknown clips and no signature among them', () => {
    const unknown = ['scratch', 'shake'].map((name) => new AnimationClip(name, 1, []));
    expect(findSignatureClip([...required, ...unknown])).toEqual({
      ok: false,
      error: { kind: 'badSignature', clips: ['scratch', 'shake'] },
    });
  });

  it('refuses a model with two candidates', () => {
    const extra = [new AnimationClip('swim', 1, []), new AnimationClip('stretch', 1, [])];
    expect(findSignatureClip([...required, ...extra])).toEqual({
      ok: false,
      error: { kind: 'badSignature', clips: ['swim', 'stretch'] },
    });
  });
});

describe('createAnimalModel', () => {
  it('plays idle in a loop as time advances, from the given phase', () => {
    const source = fullSource();
    const created = createAnimalModel(source, { ...LOOK, startPhase: 0.25 });
    if (!created.ok) {
      throw new Error('expected a model');
    }
    expect(created.value.root).toBe(source.scene);
    expect(created.value.signatureName).toBe('swim');
    expect(source.mesh.castShadow).toBe(true);

    created.value.update(500);
    expect(source.scene.position.x).toBeCloseTo(0.75);
    // 0.75 s into a 1 s loop plus 0.5 s is 0.25 s into the second lap.
    created.value.update(500);
    expect(source.scene.position.x).toBeCloseTo(0.25);
  });

  it('plays faster or slower with the time scale, set at creation or later', () => {
    const source = fullSource();
    const created = createAnimalModel(source, { ...LOOK, timeScale: 0.5 });
    if (!created.ok) {
      throw new Error('expected a model');
    }
    created.value.update(500);
    expect(source.scene.position.x).toBeCloseTo(0.25);
    created.value.setTimeScale(1);
    created.value.update(500);
    expect(source.scene.position.x).toBeCloseTo(0.75);
  });

  it('fades to another clip, and stays on it, whatever point of its loop it starts at', () => {
    const source = fullSource();
    const created = createAnimalModel(source, LOOK);
    if (!created.ok) {
      throw new Error('expected a model');
    }
    created.value.play('sleep');
    created.value.update(FADE_MS * 2);
    // The scale clip goes from 1 to 2 over its loop: only the sleep clip is left playing.
    const first = source.scene.scale.x;
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(SLEEP_SCALE);

    created.value.play('sleep');
    created.value.update(100);
    // Asking again for the clip already playing does not restart it: it just goes on.
    const gained = (((source.scene.scale.x - first) % 1) + 1) % 1;
    expect(gained).toBeCloseTo(0.1);
  });

  it('starts each clip at a point of its loop of its own, different for each individual', () => {
    const starts = [1, 2, 3, 4, 5, 6].map((seed) => {
      const source = fullSource();
      const created = createAnimalModel(source, { ...LOOK, seed });
      if (!created.ok) {
        throw new Error('expected a model');
      }
      created.value.play('eat');
      created.value.update(FADE_MS * 2);
      return source.scene.scale.x.toFixed(3);
    });
    expect(new Set(starts).size).toBeGreaterThan(3);
  });

  it('can play the signature clip', () => {
    const source = fullSource('stretch');
    const created = createAnimalModel(source, LOOK);
    if (!created.ok) {
      throw new Error('expected a model');
    }
    created.value.play('signature');
    created.value.update(FADE_MS * 2);
    expect(source.scene.scale.x).toBeGreaterThanOrEqual(1);
    expect(source.scene.scale.x).toBeLessThanOrEqual(SLEEP_SCALE);
  });

  it.each(['idle', 'walk', 'sleep', 'eat'] as const)(
    'refuses a model without %s and frees its GPU resources',
    (missing) => {
      const { scene, mesh, material } = texturedScene();
      const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
      const mapDispose = vi.spyOn(material.map ?? new Texture(), 'dispose');
      const materialDispose = vi.spyOn(material, 'dispose');
      const animations = fullClips().filter((clip) => clip.name !== missing);

      expect(createAnimalModel({ scene, animations }, LOOK)).toEqual({
        ok: false,
        error: { kind: 'missingClip', name: missing },
      });
      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(mapDispose).toHaveBeenCalledOnce();
      expect(materialDispose).toHaveBeenCalledOnce();
    },
  );

  it('refuses a model without a signature', () => {
    const { scene } = texturedScene();
    const animations = fullClips().filter((clip) => clip.name !== 'swim');
    expect(createAnimalModel({ scene, animations }, LOOK)).toEqual({
      ok: false,
      error: { kind: 'badSignature', clips: [] },
    });
  });

  it('keeps shared resources when a clone is refused or disposed', () => {
    const refused = texturedScene();
    const refusedDispose = vi.spyOn(refused.material, 'dispose');
    const options = { sharedResources: true };
    expect(createAnimalModel({ scene: refused.scene, animations: [] }, LOOK, options).ok).toBe(
      false,
    );
    expect(refusedDispose).not.toHaveBeenCalled();

    const source = fullSource();
    const created = createAnimalModel(source, LOOK, options);
    if (!created.ok) {
      throw new Error('expected a model');
    }
    const materialDispose = vi.spyOn(source.material, 'dispose');
    created.value.dispose();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('dispose detaches the model, frees it and stops the animation', () => {
    const source = fullSource();
    const parent = new Group();
    parent.add(source.scene);
    const created = createAnimalModel(source, LOOK);
    if (!created.ok) {
      throw new Error('expected a model');
    }
    const materialDispose = vi.spyOn(source.material, 'dispose');
    created.value.dispose();
    expect(parent.children).toEqual([]);
    expect(materialDispose).toHaveBeenCalledOnce();

    created.value.update(500);
    expect(source.scene.position.x).toBe(0);
  });
});

describe('cloneAnimalSource', () => {
  it('gives each individual its own nodes but shares geometry, materials and clips', () => {
    const source = fullSource();
    const copy = cloneAnimalSource(source);
    expect(copy.scene).not.toBe(source.scene);
    expect(copy.animations).toBe(source.animations);
    const copiedMesh = copy.scene.children[0];
    expect(copiedMesh).toBeInstanceOf(Mesh);
    expect(copiedMesh).not.toBe(source.mesh);
    if (copiedMesh instanceof Mesh) {
      expect(copiedMesh.geometry).toBe(source.mesh.geometry);
    }

    const created = createAnimalModel(copy, LOOK, { sharedResources: true });
    if (!created.ok) {
      throw new Error('expected a model');
    }
    created.value.update(500);
    expect(copy.scene.position.x).toBeCloseTo(0.5);
    expect(source.scene.position.x).toBe(0);
  });

  it('disposeAnimalSource frees the shared geometry and material', () => {
    const source = fullSource();
    const geometryDispose = vi.spyOn(source.mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(source.material, 'dispose');
    disposeAnimalSource(source);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
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

/** Smallest .glb with one animation per name, all moving a node: translations (0,0,0) to (1,0,0). */
function animatedGlb(...names: string[]): ArrayBuffer {
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
    animations: names.map((name) => ({
      name,
      samplers: [{ input: 0, output: 1 }],
      channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
    })),
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

describe('parseAnimalSource', () => {
  it('decodes a .glb with its animations', async () => {
    const source = await parseAnimalSource(animatedGlb('idle', 'swim'));
    expect(source.animations.map((clip) => clip.name)).toEqual(['idle', 'swim']);
    expect(source.scene.getObjectByName('root')).toBeDefined();
  });
});

describe('loadAnimalSource', () => {
  it('downloads then decodes the model', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(animatedGlb('idle'))));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const loaded = await loadAnimalSource('/capybara.glb');
      expect(fetchMock).toHaveBeenCalledWith('/capybara.glb');
      expect(loaded.animations).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects when the download fails', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
    try {
      await expect(loadAnimalSource('/missing.glb')).rejects.toThrow('HTTP 404');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('walk clip speed', () => {
  it('follows the real speed of the animal, within limits', () => {
    expect(walkClipScale(WALK_REFERENCE_SPEED_MPS)).toBeCloseTo(1);
    expect(walkClipScale(0)).toBeGreaterThan(0);
    expect(walkClipScale(WALK_REFERENCE_SPEED_MPS / 2)).toBeLessThan(
      walkClipScale(WALK_REFERENCE_SPEED_MPS),
    );
    expect(walkClipScale(WALK_REFERENCE_SPEED_MPS * 10)).toBe(
      walkClipScale(WALK_REFERENCE_SPEED_MPS * 20),
    );
    let previous = 0;
    for (let speed = 0; speed < 2; speed += 0.05) {
      expect(walkClipScale(speed)).toBeGreaterThanOrEqual(previous);
      previous = walkClipScale(speed);
    }
  });

  it('plays the walk clip at the scale it is given, without touching the other clips', () => {
    const source = fullSource();
    const created = createAnimalModel(source, LOOK);
    if (!created.ok) {
      throw new Error('expected a model');
    }
    created.value.play('walk');
    created.value.update(FADE_MS * 2);
    const advance = (scale: number): number => {
      created.value.setWalkScale(scale);
      const before = source.scene.position.x;
      created.value.update(100);
      return (((source.scene.position.x - before) % 1) + 1) % 1;
    };
    expect(advance(1)).toBeCloseTo(0.1);
    expect(advance(0.5)).toBeCloseTo(0.05);
    expect(advance(1.6)).toBeCloseTo(0.16);
  });
});

describe('gestures on a real kind of skeleton', () => {
  function withBones(): {
    model: ReturnType<typeof createAnimalModel>;
    head: Bone;
    tail: Bone;
  } {
    const root = new Group();
    const head = new Bone();
    head.name = 'head';
    const tail = new Bone();
    tail.name = 'tail';
    root.add(head, tail);
    // Clips that never touch the bones, nor the chest and eyes: only the layer moves them.
    const names = ['idle', 'walk', 'sleep', 'eat', 'swim', 'scratch'];
    const animations = names.map((name) => new AnimationClip(name, 1, []));
    return { model: createAnimalModel({ scene: root, animations }, LOOK), head, tail };
  }

  it('moves the head and the tail, and ignores a clip it does not know', () => {
    const { model, head, tail } = withBones();
    if (!model.ok) {
      throw new Error('expected a model');
    }
    expect(model.value.signatureName).toBe('swim');
    let peak = 0;
    let tailPeak = 0;
    for (let frame = 0; frame < 60 * 120; frame += 1) {
      model.value.update(1000 / 60);
      peak = Math.max(peak, head.quaternion.angleTo(new Quaternion()));
      tailPeak = Math.max(tailPeak, tail.quaternion.angleTo(new Quaternion()));
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(tailPeak).toBeGreaterThan(0.05);
  });

  it('never drifts, whatever clips follow one another', () => {
    const { model, head } = withBones();
    if (!model.ok) {
      throw new Error('expected a model');
    }
    const sequence = ['walk', 'idle', 'eat', 'sleep', 'signature', 'idle'] as const;
    const MAX_HEAD_RAD = 0.95;
    for (let round = 0; round < 60; round += 1) {
      for (const name of sequence) {
        model.value.play(name);
        model.value.setAttention(round % 2);
        for (let frame = 0; frame < 120; frame += 1) {
          model.value.update(1000 / 60);
          expect(head.quaternion.angleTo(new Quaternion())).toBeLessThan(MAX_HEAD_RAD);
        }
      }
    }
  });

  it('keeps the head still while asleep', () => {
    const { model, head } = withBones();
    if (!model.ok) {
      throw new Error('expected a model');
    }
    model.value.play('sleep');
    for (let frame = 0; frame < 60 * 5; frame += 1) {
      model.value.update(1000 / 60);
    }
    for (let frame = 0; frame < 60 * 600; frame += 1) {
      model.value.update(1000 / 60);
      expect(head.quaternion.angleTo(new Quaternion())).toBeLessThan(0.02);
    }
  });
});
