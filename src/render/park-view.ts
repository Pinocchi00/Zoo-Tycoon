import {
  BufferGeometry,
  Material,
  Mesh,
  NeutralToneMapping,
  PCFShadowMap,
  Scene,
  WebGLRenderer,
} from 'three';
import { createGridSize, gridDepth, gridWidth, logger } from '@/shared';
import capybaraUrl from '../../assets/models/capybara.glb?url';
import { loadAnimalModel, type AnimalModel } from './animals/animal-model';
import {
  createCameraRig,
  ISO_YAW_RAD,
  updateCameraRig,
  type CameraLimits,
  type CameraPose,
} from './camera/camera-rig';
import { attachCameraControls } from './camera/controls';
import { applyCameraPose, createIsoCamera } from './camera/iso-camera';
import { AFTERNOON, applyShadowQuality, createLighting } from './lighting/ambiance';
import { qualitySettings, type QualityLevel } from './quality/quality';
import { createDioramaBase } from './terrain/diorama-base';

/** Provisional size of the starting plot; it moves to src/data once plots can be bought. */
export const STARTING_PARK_GRID = createGridSize(64, 64);

/** Closest view: about one small enclosure (4 × 4 cells) with its surroundings. */
const MIN_VIEW_HEIGHT_M = 6;
/** Widest view: the whole starting plot with a margin of sky. */
const MAX_VIEW_HEIGHT_M = 72;
const START_VIEW_HEIGHT_M = 40;

export interface ParkView {
  /** Size of the drawing area in CSS pixels. */
  resize: (width: number, height: number) => void;
  setQuality: (level: QualityLevel) => void;
  quality: () => QualityLevel;
  /** Moves the camera by `elapsedMs` and draws one image. */
  frame: (elapsedMs: number) => void;
  dispose: () => void;
}

function cameraLimits(): CameraLimits {
  return {
    minViewHeight: MIN_VIEW_HEIGHT_M,
    maxViewHeight: MAX_VIEW_HEIGHT_M,
    halfWidth: gridWidth(STARTING_PARK_GRID) / 2,
    halfDepth: gridDepth(STARTING_PARK_GRID) / 2,
  };
}

/** Provisional: one resident shown at the park centre until the simulation places animals. */
const DEMO_ANIMAL = { url: capybaraUrl, x: 0, z: 0, yawRad: Math.PI / 2 } as const;

const START_POSE: Readonly<CameraPose> = {
  x: 0,
  z: 0,
  viewHeight: START_VIEW_HEIGHT_M,
  yaw: ISO_YAW_RAD,
};

function disposeScene(scene: Scene): void {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    const geometry: unknown = object.geometry;
    if (geometry instanceof BufferGeometry) {
      geometry.dispose();
    }
    const material: unknown = object.material;
    for (const entry of Array.isArray(material) ? material : [material]) {
      if (entry instanceof Material) {
        entry.dispose();
      }
    }
  });
}

/** The empty park in 3D, drawn into `canvas`. */
export function createParkView(canvas: HTMLCanvasElement, initialLevel: QualityLevel): ParkView {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.add(createDioramaBase(STARTING_PARK_GRID));
  const reach = Math.hypot(gridWidth(STARTING_PARK_GRID), gridDepth(STARTING_PARK_GRID)) / 2;
  const lighting = createLighting(scene, AFTERNOON, reach);

  const camera = createIsoCamera();
  const rig = createCameraRig(cameraLimits(), START_POSE);
  const viewport = { width: 1, height: 1 };
  const detachControls = attachCameraControls(canvas, rig, viewport);

  const animals: AnimalModel[] = [];
  let disposed = false;
  loadAnimalModel(DEMO_ANIMAL.url, 'idle')
    .then((loaded) => {
      if (!loaded.ok) {
        logger.warn(`Animal model has no "${loaded.error.name}" animation.`);
        return;
      }
      if (disposed) {
        loaded.value.dispose();
        return;
      }
      loaded.value.root.position.set(DEMO_ANIMAL.x, 0, DEMO_ANIMAL.z);
      loaded.value.root.rotation.y = DEMO_ANIMAL.yawRad;
      scene.add(loaded.value.root);
      animals.push(loaded.value);
    })
    .catch((error: unknown) => {
      logger.warn('Could not load the animal model.', error);
    });

  let level = initialLevel;

  const applySize = (): void => {
    const cap = qualitySettings(level).maxPixelRatio;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    renderer.setSize(viewport.width, viewport.height, false);
  };

  const setQuality = (next: QualityLevel): void => {
    level = next;
    const settings = qualitySettings(next);
    renderer.shadowMap.enabled = settings.shadows;
    applyShadowQuality(lighting, settings);
    applySize();
  };
  setQuality(initialLevel);

  return {
    resize: (width, height) => {
      viewport.width = Math.max(1, Math.floor(width));
      viewport.height = Math.max(1, Math.floor(height));
      applySize();
    },
    setQuality,
    quality: () => level,
    frame: (elapsedMs) => {
      updateCameraRig(rig, elapsedMs);
      for (const animal of animals) {
        animal.update(elapsedMs);
      }
      applyCameraPose(camera, rig.current, viewport.width / viewport.height);
      renderer.render(scene, camera);
    },
    dispose: () => {
      disposed = true;
      detachControls();
      for (const animal of animals.splice(0)) {
        animal.dispose();
      }
      disposeScene(scene);
      renderer.dispose();
    },
  };
}
