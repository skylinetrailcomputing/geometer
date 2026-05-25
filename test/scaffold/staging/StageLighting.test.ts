import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createStageLighting,
  STAGE_LIGHTING_AMBIENT_INTENSITY_DEFAULT,
  STAGE_LIGHTING_DIRECTIONAL_INTENSITY_DEFAULT,
  STAGE_LIGHTING_DISTANCE_DEFAULT,
} from '../../../src/scaffold/staging/StageLighting.ts';

const DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();

describe('createStageLighting (#248 — cluster-wide lighting pair)', () => {
  it('builds an AmbientLight + DirectionalLight, both white, defaulted to the per-scene-duplication intensities', () => {
    const lighting = createStageLighting({ direction: DIR });
    expect(lighting.group.name).toBe('stage-lighting');
    expect(lighting.group.children).toContain(lighting.ambient);
    expect(lighting.group.children).toContain(lighting.directional);

    expect(lighting.ambient).toBeInstanceOf(THREE.AmbientLight);
    expect(lighting.directional).toBeInstanceOf(THREE.DirectionalLight);
    expect(lighting.ambient.color.getHex()).toBe(0xffffff);
    expect(lighting.directional.color.getHex()).toBe(0xffffff);
    expect(lighting.ambient.intensity).toBe(
      STAGE_LIGHTING_AMBIENT_INTENSITY_DEFAULT,
    );
    expect(lighting.directional.intensity).toBe(
      STAGE_LIGHTING_DIRECTIONAL_INTENSITY_DEFAULT,
    );
    lighting.dispose();
  });

  it('positions the DirectionalLight at `direction × STAGE_LIGHTING_DISTANCE_DEFAULT`', () => {
    const lighting = createStageLighting({ direction: DIR });
    const expected = DIR.clone().multiplyScalar(STAGE_LIGHTING_DISTANCE_DEFAULT);
    expect(lighting.directional.position.x).toBeCloseTo(expected.x, 6);
    expect(lighting.directional.position.y).toBeCloseTo(expected.y, 6);
    expect(lighting.directional.position.z).toBeCloseTo(expected.z, 6);
    lighting.dispose();
  });

  it('does not mutate the caller-owned direction vector', () => {
    // The caller's LIGHT_DIR also flows into the math-surface shader
    // as a uniform — mutation here would silently corrupt the shader.
    // The factory does `.copy(direction).multiplyScalar(d)` on the
    // light's own position, not on the caller's vector.
    const caller = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
    const snapshot = caller.clone();
    const lighting = createStageLighting({ direction: caller });
    expect(caller.x).toBe(snapshot.x);
    expect(caller.y).toBe(snapshot.y);
    expect(caller.z).toBe(snapshot.z);
    lighting.dispose();
  });

  it('respects custom intensities + distance', () => {
    const lighting = createStageLighting({
      direction: DIR,
      ambientIntensity: 0.7,
      directionalIntensity: 1.2,
      distance: 10,
    });
    expect(lighting.ambient.intensity).toBe(0.7);
    expect(lighting.directional.intensity).toBe(1.2);
    const expected = DIR.clone().multiplyScalar(10);
    expect(lighting.directional.position.x).toBeCloseTo(expected.x, 6);
    expect(lighting.directional.position.y).toBeCloseTo(expected.y, 6);
    expect(lighting.directional.position.z).toBeCloseTo(expected.z, 6);
    lighting.dispose();
  });

  it('dispose() is idempotent', () => {
    const lighting = createStageLighting({ direction: DIR });
    expect(() => {
      lighting.dispose();
      lighting.dispose();
    }).not.toThrow();
  });
});
