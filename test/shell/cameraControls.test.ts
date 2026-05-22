import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createCameraControls,
  SURFACE_CENTER,
} from '@/shell/cameraControls';

// Config-validation coverage for the cluster's desktop camera-controls
// wrapper (#192, pancake plan v3 §3.3). The factory mutates the camera
// in place and returns an OrbitControls instance carrying the cluster
// envelope's bounds + damping. `domElement` is passed as null so the
// test exercises the wrapper without a real DOM — sufficient for
// config-validation, which is the issue's stated bar.

const makeCamera = (): THREE.PerspectiveCamera =>
  new THREE.PerspectiveCamera(75, 1, 0.1, 100);

describe('createCameraControls', () => {
  it('orients the camera at (0, 1.6, 3.7) before the controls take over', () => {
    const camera = makeCamera();
    camera.position.set(0, 1.6, 3.7); // simulate shell.ts's pre-XR default
    createCameraControls(camera, null);
    expect(camera.position.x).toBeCloseTo(0);
    expect(camera.position.y).toBeCloseTo(1.6);
    expect(camera.position.z).toBeCloseTo(3.7);
  });

  it('applies camera.lookAt(SURFACE_CENTER) before the first controls update', () => {
    // The camera sits at (0, 1.6, 3.7) and SURFACE_CENTER is (0, 1.5,
    // -4): forward unit vector is (0, -0.1/r, -7.7/r) for r =
    // sqrt(0.01 + 59.29), i.e., direction ≈ (0, -0.013, -0.9999). The
    // negative-z dominant component is what we care about — it
    // confirms lookAt ran (without it, an unrotated camera looks
    // toward +Z).
    const camera = makeCamera();
    createCameraControls(camera, null);
    // Read the camera's forward via its quaternion rather than
    // `getWorldDirection`, which depends on `matrixWorld` (only updated
    // at render time). The quaternion is mutated synchronously by
    // `lookAt` and is what render-time matrix construction would read
    // anyway.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.quaternion,
    );
    expect(forward.z).toBeLessThan(-0.99);
    expect(forward.y).toBeLessThan(0); // slight downward tilt
    expect(Math.abs(forward.x)).toBeLessThan(1e-6);
  });

  it('sets controls.target to SURFACE_CENTER', () => {
    const camera = makeCamera();
    const controls = createCameraControls(camera, null);
    expect(controls.target.x).toBeCloseTo(SURFACE_CENTER.x);
    expect(controls.target.y).toBeCloseTo(SURFACE_CENTER.y);
    expect(controls.target.z).toBeCloseTo(SURFACE_CENTER.z);
  });

  it('clamps distance to [1.5, 12] m around the cluster anchor', () => {
    const camera = makeCamera();
    const controls = createCameraControls(camera, null);
    expect(controls.minDistance).toBe(1.5);
    expect(controls.maxDistance).toBe(12);
  });

  it('clamps polar angle to [0.1π, 0.85π]', () => {
    const camera = makeCamera();
    const controls = createCameraControls(camera, null);
    expect(controls.minPolarAngle).toBeCloseTo(0.1 * Math.PI);
    expect(controls.maxPolarAngle).toBeCloseTo(0.85 * Math.PI);
  });

  it('enables damping with factor 0.05 (requires per-frame controls.update())', () => {
    const camera = makeCamera();
    const controls = createCameraControls(camera, null);
    expect(controls.enableDamping).toBe(true);
    expect(controls.dampingFactor).toBeCloseTo(0.05);
  });
});

describe('first render-frame stability', () => {
  // The next render-loop tick will call `controls.update()`. At that
  // point the spherical is re-derived from the actual (camera, target)
  // offset — so the orientation should be effectively unchanged from
  // the post-construction state. Verifies the construction-time
  // ordering closes the gap left by the OrbitControls constructor's
  // implicit `update()` against the default `target=(0,0,0)`.
  it('does not jump on the first controls.update() tick', () => {
    const camera = makeCamera();
    const controls = createCameraControls(camera, null);
    const positionBefore = camera.position.clone();
    const quaternionBefore = camera.quaternion.clone();
    controls.update();
    expect(camera.position.distanceTo(positionBefore)).toBeLessThan(1e-10);
    // Quaternion components compared individually — angleTo would
    // require both unit-length quaternions and we want a tight bound.
    expect(Math.abs(camera.quaternion.x - quaternionBefore.x)).toBeLessThan(
      1e-10,
    );
    expect(Math.abs(camera.quaternion.y - quaternionBefore.y)).toBeLessThan(
      1e-10,
    );
    expect(Math.abs(camera.quaternion.z - quaternionBefore.z)).toBeLessThan(
      1e-10,
    );
    expect(Math.abs(camera.quaternion.w - quaternionBefore.w)).toBeLessThan(
      1e-10,
    );
  });
});

describe('SURFACE_CENTER export', () => {
  it('matches the cluster anchor (0, 1.5, -4)', () => {
    // Independent declaration, but must coincide with the per-exhibit
    // SURFACE_CENTER constants the cluster scenes carry today
    // (e.g., exhibits/tangent-planes/index.ts:47).
    expect(SURFACE_CENTER.x).toBeCloseTo(0);
    expect(SURFACE_CENTER.y).toBeCloseTo(1.5);
    expect(SURFACE_CENTER.z).toBeCloseTo(-4);
  });
});
