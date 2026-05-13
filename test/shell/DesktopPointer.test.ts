import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DesktopPointer } from '@/shell/DesktopPointer';

// Vitest coverage for the desktop `Pointer` adapter (#193, pancake
// plan v3 §3.3 / §3.6). The math under the hood is
// `THREE.Raycaster.setFromCamera`, but the tests pin the *contract* so
// a future swap to a different camera type or hand-rolled NDC math
// can't silently regress the ray.

const makeCamera = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  // World-aligned: at world origin, looking down -Z (the unrotated
  // perspective camera default). Forward = world (0, 0, -1).
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld(true);
  return camera;
};

describe('DesktopPointer', () => {
  it('preserves the id from the constructor', () => {
    const pointer = new DesktopPointer(makeCamera(), 'desk-0');
    expect(pointer.id).toBe('desk-0');
  });

  it('defaults the id to "desktop" when not provided', () => {
    const pointer = new DesktopPointer(makeCamera());
    expect(pointer.id).toBe('desktop');
  });

  describe('getRayOrigin', () => {
    it('returns the camera world position regardless of NDC', () => {
      const camera = makeCamera();
      camera.position.set(1, 2, 3);
      camera.updateMatrixWorld(true);
      const pointer = new DesktopPointer(camera);
      const target = new THREE.Vector3();

      pointer.setNDC(0, 0);
      pointer.getRayOrigin(target);
      expect(target.x).toBeCloseTo(1);
      expect(target.y).toBeCloseTo(2);
      expect(target.z).toBeCloseTo(3);

      // Off-center NDC reads the same origin (perspective camera —
      // all rays emanate from the camera position).
      pointer.setNDC(0.5, -0.25);
      pointer.getRayOrigin(target);
      expect(target.x).toBeCloseTo(1);
      expect(target.y).toBeCloseTo(2);
      expect(target.z).toBeCloseTo(3);
    });

    it('returns the same Vector3 instance the caller passed in', () => {
      const pointer = new DesktopPointer(makeCamera());
      const target = new THREE.Vector3();
      const result = pointer.getRayOrigin(target);
      expect(result).toBe(target);
    });
  });

  describe('getRayDirection', () => {
    it('returns the camera forward direction at NDC (0, 0)', () => {
      // Center of viewport — ray points straight along camera -Z.
      const camera = makeCamera();
      const pointer = new DesktopPointer(camera);
      pointer.setNDC(0, 0);
      const target = new THREE.Vector3();
      pointer.getRayDirection(target);
      expect(target.x).toBeCloseTo(0);
      expect(target.y).toBeCloseTo(0);
      expect(target.z).toBeCloseTo(-1);
      expect(target.length()).toBeCloseTo(1);
    });

    it('tilts toward +X when NDC X is positive', () => {
      // Right side of viewport — ray points toward world +X (and
      // still negative Z, because the camera looks down -Z).
      const camera = makeCamera();
      const pointer = new DesktopPointer(camera);
      pointer.setNDC(0.5, 0);
      const target = new THREE.Vector3();
      pointer.getRayDirection(target);
      expect(target.x).toBeGreaterThan(0);
      expect(target.z).toBeLessThan(0);
      expect(target.length()).toBeCloseTo(1);
    });

    it('tilts toward +Y when NDC Y is positive (world Y, not screen Y)', () => {
      // NDC Y is the screen-flipped axis; +1 corresponds to top of
      // viewport. With an unrotated camera looking down -Z, top of
      // screen = world +Y.
      const camera = makeCamera();
      const pointer = new DesktopPointer(camera);
      pointer.setNDC(0, 0.5);
      const target = new THREE.Vector3();
      pointer.getRayDirection(target);
      expect(target.y).toBeGreaterThan(0);
      expect(target.z).toBeLessThan(0);
      expect(target.length()).toBeCloseTo(1);
    });

    it('rotates with the camera (yaw 180° → forward = world +Z)', () => {
      // Yaw 180° around world Y: camera now looks down +Z. NDC (0,0)
      // ray should point along world +Z. Sister regression-guard to
      // VRPointer.test.ts's same assertion — same 180° yaw, same
      // expectation, different adapter.
      const camera = makeCamera();
      camera.rotation.y = Math.PI;
      camera.updateMatrixWorld(true);
      const pointer = new DesktopPointer(camera);
      pointer.setNDC(0, 0);
      const target = new THREE.Vector3();
      pointer.getRayDirection(target);
      expect(target.x).toBeCloseTo(0);
      expect(target.y).toBeCloseTo(0);
      expect(target.z).toBeCloseTo(1);
    });

    it('returns the same Vector3 instance the caller passed in', () => {
      const pointer = new DesktopPointer(makeCamera());
      const target = new THREE.Vector3();
      const result = pointer.getRayDirection(target);
      expect(result).toBe(target);
    });
  });

  describe('setNDC', () => {
    it('persists the most recent value across reads', () => {
      const pointer = new DesktopPointer(makeCamera());
      const target = new THREE.Vector3();

      pointer.setNDC(0.3, 0);
      pointer.getRayDirection(target);
      const xAfterFirst = target.x;

      pointer.setNDC(-0.3, 0);
      pointer.getRayDirection(target);
      const xAfterSecond = target.x;

      // First read tilts +X; second read tilts -X. Asserts the
      // adapter actually reads `this.ndc` per call rather than
      // caching a derived ray.
      expect(xAfterFirst).toBeGreaterThan(0);
      expect(xAfterSecond).toBeLessThan(0);
    });

    it('defaults to NDC (0, 0) before the first setNDC call', () => {
      // Pre-input default — hover dispatch before the first
      // `pointermove` lands on viewport center, not at a stale
      // corner. Verifies the constructor's NDC seed.
      const pointer = new DesktopPointer(makeCamera());
      const target = new THREE.Vector3();
      pointer.getRayDirection(target);
      expect(target.x).toBeCloseTo(0);
      expect(target.y).toBeCloseTo(0);
      expect(target.z).toBeCloseTo(-1);
    });
  });

  describe('pulse', () => {
    it('is a no-op (desktop has no haptic surface)', () => {
      const pointer = new DesktopPointer(makeCamera());
      expect(() => pointer.pulse(0.4, 25)).not.toThrow();
    });
  });

  describe('ray cache', () => {
    // Per-frame perf: hit-test call sites read both `getRayOrigin` and
    // `getRayDirection` for every primitive. Without a cache, each
    // primitive pays two `Raycaster.setFromCamera` calls (each does
    // an unproject + matrix multiply). Cache invariants pinned here so
    // a future tweak can't silently re-introduce the cost.

    it('reuses the cached ray when NDC and camera are unchanged', () => {
      // Two same-NDC reads should hit the cache. Verify by mutating
      // the camera position AFTER the first read (without invalidating)
      // — if the cache works, the second read returns the stale origin.
      const camera = makeCamera();
      camera.position.set(0, 0, 0);
      camera.updateMatrixWorld(true);
      const pointer = new DesktopPointer(camera);
      pointer.setNDC(0.5, 0.25);

      const target = new THREE.Vector3();
      pointer.getRayOrigin(target);
      const firstX = target.x;

      // Move the camera silently — no NDC change, no invalidate().
      // The cache should serve the same origin as the first read.
      camera.position.set(10, 0, 0);
      camera.updateMatrixWorld(true);
      pointer.getRayOrigin(target);
      expect(target.x).toBeCloseTo(firstX);
    });

    it('refreshes the ray when invalidate() is called between reads', () => {
      // Same setup, but with invalidate() between camera moves. The
      // shell's per-frame loop calls invalidate() after cameraControls
      // damping, so the next read sees the new matrices.
      const camera = makeCamera();
      camera.position.set(0, 0, 0);
      camera.updateMatrixWorld(true);
      const pointer = new DesktopPointer(camera);
      pointer.setNDC(0.5, 0.25);

      const target = new THREE.Vector3();
      pointer.getRayOrigin(target);
      const firstX = target.x;

      camera.position.set(10, 0, 0);
      camera.updateMatrixWorld(true);
      pointer.invalidate();
      pointer.getRayOrigin(target);
      expect(target.x).toBeCloseTo(firstX + 10);
    });

    it('refreshes the ray when setNDC changes the value', () => {
      // setNDC invalidates the cache when the value actually changes.
      const camera = makeCamera();
      const pointer = new DesktopPointer(camera);
      const target = new THREE.Vector3();

      pointer.setNDC(0.5, 0);
      pointer.getRayDirection(target);
      const firstX = target.x;

      pointer.setNDC(-0.5, 0);
      pointer.getRayDirection(target);
      expect(target.x).not.toBeCloseTo(firstX);
      expect(Math.sign(target.x)).toBe(-Math.sign(firstX));
    });

    it('does not invalidate when setNDC is called with the same value', () => {
      // No-op setNDC keeps the cache. Same trick as the first cache
      // test: move the camera silently, call setNDC with unchanged
      // NDC, and verify the read returns the stale origin.
      const camera = makeCamera();
      camera.position.set(0, 0, 0);
      camera.updateMatrixWorld(true);
      const pointer = new DesktopPointer(camera);
      pointer.setNDC(0.3, -0.1);

      const target = new THREE.Vector3();
      pointer.getRayOrigin(target);
      const firstX = target.x;

      camera.position.set(7, 0, 0);
      camera.updateMatrixWorld(true);
      pointer.setNDC(0.3, -0.1); // same value — should NOT invalidate
      pointer.getRayOrigin(target);
      expect(target.x).toBeCloseTo(firstX);
    });
  });
});
