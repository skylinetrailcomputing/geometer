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
      // `controller.getWorldDirection` (which would return world -Z
      // here because it reads the +Z column of the rotated matrix).
      const controller = new THREE.Group();
      controller.rotation.y = Math.PI;
      const pointer = new VRPointer(controller, 'vr-0');
      const target = new THREE.Vector3();
      pointer.getRayDirection(target);
      expect(target.x).toBeCloseTo(0);
      expect(target.y).toBeCloseTo(0);
      expect(target.z).toBeCloseTo(1);
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
