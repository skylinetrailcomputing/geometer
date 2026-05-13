import * as THREE from 'three';

/**
 * Abstract pointer for UI primitives — covers both VR controllers and
 * the pancake (desktop / mobile) mouse / touch-driven equivalent
 * landing in #191+ (parent #105).
 *
 * Step 2 of the pancake plan (#190): interface only, with a `VRPointer`
 * adapter wrapping `XRTargetRaySpace`. UI primitives still consume
 * `THREE.Object3D` until #191's bundled migration; for now `VRPointer`s
 * sit alongside the existing controller fields on `ExhibitContext`.
 *
 * `getWorldQuaternion` is deliberately absent. Per the plan v3 §3.1
 * filesystem read, the only pose-dependent slider math
 * (`Slider.controllerLocalX`) reads only the controller's world
 * *position*; every other ray-direction read on the UI primitives
 * reduces to `getRayDirection`. Forcing a `DesktopPointer` to stub a
 * meaningful roll would be a leak with no consumer.
 */
export interface Pointer {
  /**
   * Identity for diagnostics (logging, debug overlays). The grab /
   * release contract on UI primitives is reference-equality on the
   * `Pointer` instance — so `Pointer` instances must be constructed
   * exactly once at boot mode-detection time and reused per frame.
   */
  readonly id: string;

  /** World-space ray origin. Read fresh every frame. */
  getRayOrigin(target: THREE.Vector3): THREE.Vector3;

  /**
   * World-space ray direction (unit vector). Read fresh every frame.
   * Implementations must produce the *same* ray the pre-refactor
   * primitive code would have computed from the underlying controller
   * / mouse state — no convention change during the migration window.
   */
  getRayDirection(target: THREE.Vector3): THREE.Vector3;

  /** Haptic pulse on this pointer. Implementations may no-op. */
  pulse(intensity: number, durationMs: number): void;
}
