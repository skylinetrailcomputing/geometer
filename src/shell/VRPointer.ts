import * as THREE from 'three';
import type { Pointer } from './Pointer';

// `XRTargetRaySpace` (the type returned by `renderer.xr.getController(i)`)
// is exported from three's webxr addon. Importing it adds no runtime
// surface — it's a class used only as a type in the constructor signature.
type XRTargetRaySpace = THREE.Group;

/**
 * Per-controller `userData.gamepad` shape attached by the shell's
 * `'connected'` listener. Mirrors the `ControllerWithGamepad` interfaces
 * currently inlined in `Slider.ts` / `TapButton.ts` / `AxisToggle.ts`,
 * which retire alongside the bundled UI migration in #191.
 */
interface ControllerWithGamepad extends THREE.Object3D {
  userData: {
    gamepad?: {
      hapticActuators?: ReadonlyArray<{
        pulse?: (intensity: number, durationMs: number) => void;
      }>;
    };
  };
}

/**
 * `Pointer` adapter wrapping an XR controller's `XRTargetRaySpace`.
 *
 * Goal (plan v3 §3.1 / G2): produce **the same ray** the pre-refactor
 * UI primitives compute, so #191's bundled migration is a pure
 * signature change rather than a behavior change.
 *
 * Pre-refactor code at `Slider.ts:299`, `TapButton.ts:220`, and
 * `AxisToggle.ts:161` reads ray direction as
 * `(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(...))` —
 * i.e. the controller's local **−Z** axis in world space, which is
 * the direction the visible aim-ray line points
 * (`shell.ts` builds that line from `(0,0,0)` to `(0,0,-1)`).
 *
 * **Why this differs from the issue's literal text.** Issue #190's
 * body and plan v3 §3.1 both say "delegate directly to
 * `controller.getWorldDirection(target)`" and call that bit-identical.
 * It isn't: `Object3D.getWorldDirection` returns the **+Z** axis
 * (`matrixWorld.elements[8..10]`, three.js r184 `Object3D.js:424`).
 * The `Camera` subclass overrides this to negate, but
 * `XRTargetRaySpace` (a plain `Group`) does not. Delegating would
 * flip the ray's sign and break hover / grab on every primitive once
 * #191 migrates them. We use the matching `(0,0,-1).applyQuaternion`
 * formula instead. The yaw-180° unit test in
 * `test/shell/VRPointer.test.ts` is the load-bearing regression
 * guard against a future refactor reintroducing the sign flip.
 */
export class VRPointer implements Pointer {
  readonly id: string;
  private readonly controller: XRTargetRaySpace;
  // Scratch quaternion reused per `getRayDirection` call. Allocated
  // once per `VRPointer` instance to avoid per-frame allocation on
  // the hover / grab hot path.
  private readonly scratchQuat = new THREE.Quaternion();

  constructor(controller: XRTargetRaySpace, id: string) {
    this.controller = controller;
    this.id = id;
  }

  getRayOrigin(target: THREE.Vector3): THREE.Vector3 {
    return this.controller.getWorldPosition(target);
  }

  getRayDirection(target: THREE.Vector3): THREE.Vector3 {
    this.controller.getWorldQuaternion(this.scratchQuat);
    return target.set(0, 0, -1).applyQuaternion(this.scratchQuat);
  }

  pulse(intensity: number, durationMs: number): void {
    const gamepad = (this.controller as ControllerWithGamepad).userData.gamepad;
    const actuator = gamepad?.hapticActuators?.[0];
    actuator?.pulse?.(intensity, durationMs);
  }
}
