import {
  BufferGeometry,
  Material,
  Mesh,
  NeutralToneMapping,
  PCFShadowMap,
  Scene,
  WebGLRenderer,
} from 'three';
import { gridDepth, gridWidth, type GridSize, type SpeciesId } from '@/shared';
import type { FocusArea, GameEvent } from '@/sim';
import { createAnimalHerd, type HerdWorld, type SpeciesLook } from './animals/animal-herd';
import { loadSpeciesModel } from './animals/model-urls';
import {
  createCameraRig,
  ISO_YAW_RAD,
  updateCameraRig,
  type CameraLimits,
  type CameraPose,
} from './camera/camera-rig';
import { attachCameraControls } from './camera/controls';
import { writeFocusArea } from './camera/focus-area';
import { applyCameraPose, createIsoCamera } from './camera/iso-camera';
import { AFTERNOON, applyShadowQuality, createLighting } from './lighting/ambiance';
import { qualitySettings, type QualityLevel } from './quality/quality';
import { createDioramaBase } from './terrain/diorama-base';

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
  /** Fills `out` with the cells the camera may show, without allocating. */
  writeFocusArea: (out: FocusArea) => void;
  /** Puts the animals of the state in their enclosures, e.g. after loading a save. */
  syncAnimals: (world: HerdWorld) => void;
  /** Updates the animals of the enclosures the events talk about. */
  handleEvents: (events: readonly GameEvent[], world: HerdWorld) => void;
  dispose: () => void;
}

/** Where the camera looks when the game starts, in metres on the ground plane. */
export interface ViewFocus {
  readonly x: number;
  readonly z: number;
}

function cameraLimits(grid: GridSize): CameraLimits {
  return {
    minViewHeight: MIN_VIEW_HEIGHT_M,
    maxViewHeight: MAX_VIEW_HEIGHT_M,
    halfWidth: gridWidth(grid) / 2,
    halfDepth: gridDepth(grid) / 2,
  };
}

function startPose(focus: ViewFocus): CameraPose {
  return { x: focus.x, z: focus.z, viewHeight: START_VIEW_HEIGHT_M, yaw: ISO_YAW_RAD };
}

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

/** The park in 3D, drawn into `canvas`. */
export function createParkView(
  canvas: HTMLCanvasElement,
  initialLevel: QualityLevel,
  grid: GridSize,
  focus: ViewFocus,
  lookupSpecies: (id: SpeciesId) => SpeciesLook | undefined,
): ParkView {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.add(createDioramaBase(grid));
  const reach = Math.hypot(gridWidth(grid), gridDepth(grid)) / 2;
  const lighting = createLighting(scene, AFTERNOON, reach);

  const camera = createIsoCamera();
  const rig = createCameraRig(cameraLimits(grid), startPose(focus));
  const viewport = { width: 1, height: 1 };
  const detachControls = attachCameraControls(canvas, rig, viewport);

  const herd = createAnimalHerd({
    parent: scene,
    grid,
    lookupSpecies,
    loadSource: loadSpeciesModel,
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
      herd.update(elapsedMs, rig.current.x, rig.current.z, rig.current.viewHeight);
      applyCameraPose(camera, rig.current, viewport.width / viewport.height);
      renderer.render(scene, camera);
    },
    writeFocusArea: (out) => {
      writeFocusArea(rig.current, viewport.width / viewport.height, grid, out);
    },
    syncAnimals: herd.syncAll,
    handleEvents: herd.handleEvents,
    dispose: () => {
      detachControls();
      herd.dispose();
      disposeScene(scene);
      renderer.dispose();
    },
  };
}
