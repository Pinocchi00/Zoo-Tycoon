import { Scene, WebGLRenderTarget } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { qualitySettings } from '../quality/quality';
import { AFTERNOON, applyShadowQuality, createLighting } from './ambiance';

const REACH_M = 45;

function lightingWithMap(size: number): {
  lighting: ReturnType<typeof createLighting>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const lighting = createLighting(new Scene(), AFTERNOON, REACH_M);
  lighting.sun.shadow.mapSize.set(size, size);
  const map = new WebGLRenderTarget(size, size);
  const dispose = vi.fn();
  map.addEventListener('dispose', dispose);
  lighting.sun.shadow.map = map;
  return { lighting, dispose };
}

describe('createLighting', () => {
  it('adds the sun, its target and the sky light, with a shadow box covering the park', () => {
    const scene = new Scene();
    const { sun, sky } = createLighting(scene, AFTERNOON, REACH_M);
    expect(scene.children).toContain(sun);
    expect(scene.children).toContain(sun.target);
    expect(scene.children).toContain(sky);
    expect(sun.position.y).toBeGreaterThan(0);
    expect(sun.shadow.camera.right).toBe(REACH_M);
    expect(sun.shadow.camera.bottom).toBe(-REACH_M);
  });
});

describe('applyShadowQuality', () => {
  it('turns shadows off on low and frees the shadow map', () => {
    const { lighting, dispose } = lightingWithMap(2048);
    applyShadowQuality(lighting, qualitySettings('low'));
    expect(lighting.sun.castShadow).toBe(false);
    expect(lighting.sun.shadow.map).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('replaces a map of the wrong size', () => {
    const { lighting, dispose } = lightingWithMap(2048);
    applyShadowQuality(lighting, qualitySettings('medium'));
    expect(lighting.sun.castShadow).toBe(true);
    expect(lighting.sun.shadow.mapSize.x).toBe(qualitySettings('medium').shadowMapSize);
    expect(lighting.sun.shadow.radius).toBe(qualitySettings('medium').shadowRadius);
    expect(lighting.sun.shadow.map).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('keeps a map that already has the right size', () => {
    const high = qualitySettings('high');
    const { lighting, dispose } = lightingWithMap(high.shadowMapSize);
    const map = lighting.sun.shadow.map;
    applyShadowQuality(lighting, high);
    expect(lighting.sun.shadow.map).toBe(map);
    expect(lighting.sun.shadow.radius).toBe(high.shadowRadius);
    expect(dispose).not.toHaveBeenCalled();
  });
});
