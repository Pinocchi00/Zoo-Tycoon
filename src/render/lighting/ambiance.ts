import { Color, DirectionalLight, HemisphereLight, type Scene } from 'three';
import type { QualitySettings } from '../quality/quality';

/** A mood of the day: the GDD plans six, the afternoon is the default one. */
export interface Ambiance {
  /** Direction towards the sun, not normalised. */
  readonly sunDirection: { readonly x: number; readonly y: number; readonly z: number };
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly skyColor: number;
  readonly groundColor: number;
  readonly skyIntensity: number;
  readonly backgroundColor: number;
}

/** Golden afternoon: low warm sun from the side, cool sky to keep shadows blue rather than black. */
export const AFTERNOON: Ambiance = {
  sunDirection: { x: -0.55, y: 0.6, z: 0.35 },
  sunColor: 0xffd6a0,
  sunIntensity: 2.8,
  skyColor: 0xc4dcff,
  groundColor: 0x9a7a55,
  skyIntensity: 1.15,
  backgroundColor: 0xf3e2c7,
};

/** Distance of the sun from the park centre: far enough to see the whole park. */
const SUN_DISTANCE_M = 80;
/** Pushes shadows slightly off surfaces so that flat ground does not shade itself in stripes. */
const SHADOW_NORMAL_BIAS = 0.03;
const SHADOW_BIAS = -0.0004;

export interface ParkLighting {
  readonly sun: DirectionalLight;
  readonly sky: HemisphereLight;
}

/**
 * Adds the sun and the sky light to `scene`. `reachM` is the half-diagonal of the park:
 * the sun's shadow box covers it whole.
 */
export function createLighting(scene: Scene, ambiance: Ambiance, reachM: number): ParkLighting {
  scene.background = new Color(ambiance.backgroundColor);

  const sky = new HemisphereLight(ambiance.skyColor, ambiance.groundColor, ambiance.skyIntensity);
  scene.add(sky);

  const sun = new DirectionalLight(ambiance.sunColor, ambiance.sunIntensity);
  const { x, y, z } = ambiance.sunDirection;
  sun.position.set(x, y, z).normalize().multiplyScalar(SUN_DISTANCE_M);
  sun.target.position.set(0, 0, 0);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -reachM;
  shadowCamera.right = reachM;
  shadowCamera.top = reachM;
  shadowCamera.bottom = -reachM;
  shadowCamera.near = 1;
  shadowCamera.far = SUN_DISTANCE_M * 2;
  shadowCamera.updateProjectionMatrix();
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
  scene.add(sun, sun.target);

  return { sun, sky };
}

/** Resizes the sun's shadow to the quality level. Called on a level change, never per frame. */
export function applyShadowQuality(lighting: ParkLighting, settings: QualitySettings): void {
  const { sun } = lighting;
  sun.castShadow = settings.shadows;
  if (!settings.shadows) {
    return;
  }
  sun.shadow.radius = settings.shadowRadius;
  if (sun.shadow.mapSize.x !== settings.shadowMapSize) {
    sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    // The old map has the wrong size: dropping it makes Three.js allocate a new one.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
}
