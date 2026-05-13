import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { VRPointer } from '@/shell/VRPointer';

// Vitest coverage for the `VRPointer` adapter (#190). The interface
// is exercised directly against synthetic `THREE.Group`s standing in
// for `XRTargetRaySpace` (which is a `Group` at runtime, per
// `node_modules/three/src/renderers/webxr/WebXRController.js:82`).

describe('VRPointer', () => {
  it('preserves the id from the constructor', () => {
    const controller = new THREE.Group();
    const pointer = new VRPointer(controller, 'vr-0');
    expect(pointer.id).toBe('vr-0');
  });

  describe('getRayOrigin', () => {
    it('returns the controller world position into the target', () => {
      const controller = new THREE.Group();
      controller.position.set(1, 2, 3);
      const pointer = new VRPointer(controller, 'vr-0');
      const target = new THREE.Vector3();
      const result = pointer.getRayOrigin(target);
      expect(result).toBe(target); // returns the same Vector3 instance
      expect(target.x).toBeCloseTo(1);
      expect(target.y).toBeCloseTo(2);
      expect(target.z).toBeCloseTo(3);
    });
  });

  describe('getRayDirection', () => {
    it('returns world (0,0,-1) for an unrotated controller at the origin', () => {
      // Controller at world origin, identity rotation — local -Z points
      // along world -Z, matching the visible aim ray that shell.ts
      // builds from (0,0,0) to (0,0,-1).
      const controller = new THREE.Group();
      const pointer = new VRPointer(controller, 'vr-0');
      const target = new THREE.Vector3();
      const result = pointer.getRayDirection(target);
      expect(result).toBe(target);
      expect(target.x).toBeCloseTo(0);
      expect(target.y).toBeCloseTo(0);
      expect(target.z).toBeCloseTo(-1);
      expect(target.length()).toBeCloseTo(1);
    });

    it('rotates with the controller (yaw 180° → world +Z)', () => {
      // Yaw 180° around world Y: local -Z → world +Z. This is the
      // sign-flip case that catches a regression to
      // `controller.getWorldDirection` (which would still return -Z
      // here because it reads the +Z column).
      const controller = new THREE.Group();
      controller.rotation.y = Math.PI;
      const pointer = new VRPointer(controller, 'vr-0');
      const target = new THREE.Vector3();
      pointer.getRayDirection(target);
      expect(target.x).toBeCloseTo(0);
      expect(target.y).toBeCloseTo(0);
      expect(target.z).toBeCloseTo(1);
    });

    it('matches the pre-refactor (0,0,-1).applyQuaternion formula exactly', () => {
      // Equivalence check against the formula at Slider.ts:299 /
      // TapButton.ts:220 / AxisToggle.ts:161 — same one the
      // shell.ts regression assertion guards every frame in #191's
      // migration window. Any sign flip or axis swap in
      // `VRPointer.getRayDirection` would fail this.
      const controller = new THREE.Group();
      controller.position.set(0.4, 1.7, -1.2);
      controller.rotation.set(0.3, -0.7, 0.15);
      controller.updateMatrixWorld();

      const pointer = new VRPointer(controller, 'vr-0');
      const fromAdapter = pointer.getRayDirection(new THREE.Vector3());

      const fromOldFormula = new THREE.Vector3(0, 0, -1).applyQuaternion(
        controller.getWorldQuaternion(new THREE.Quaternion()),
      );

      expect(fromAdapter.x).toBeCloseTo(fromOldFormula.x, 10);
      expect(fromAdapter.y).toBeCloseTo(fromOldFormula.y, 10);
      expect(fromAdapter.z).toBeCloseTo(fromOldFormula.z, 10);
    });
  });

  describe('pulse', () => {
    it('forwards intensity and duration to the first haptic actuator', () => {
      const controller = new THREE.Group();
      const actuatorPulse = vi.fn();
      controller.userData.gamepad = {
        hapticActuators: [{ pulse: actuatorPulse }],
      };
      const pointer = new VRPointer(controller, 'vr-0');
      pointer.pulse(0.4, 25);
      expect(actuatorPulse).toHaveBeenCalledWith(0.4, 25);
    });

    it('is a no-op when no gamepad is attached (pre-connected XR session)', () => {
      const controller = new THREE.Group();
      const pointer = new VRPointer(controller, 'vr-0');
      expect(() => pointer.pulse(0.4, 25)).not.toThrow();
    });

    it('is a no-op when the gamepad has no haptic actuators', () => {
      const controller = new THREE.Group();
      controller.userData.gamepad = { hapticActuators: [] };
      const pointer = new VRPointer(controller, 'vr-0');
      expect(() => pointer.pulse(0.4, 25)).not.toThrow();
    });
  });
});
