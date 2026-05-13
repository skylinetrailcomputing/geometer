import * as THREE from 'three';
import type { Pointer } from './Pointer';

/**
 * `Pointer` adapter for desktop / pancake mode (#193, parent #105,
 * pancake plan v3 §3.3 / §3.6). Holds a camera reference + the most
 * recent mouse normalized-device-coordinate (NDC) and produces the
 * world-space ray a perspective camera would cast through that pixel.
 *
 * Per plan v3 §3.3 / S2: the `Pointer` interface stays ray-output-only.
 * The `setNDC` mutator is **non-interface** — only the shell holds a
 * `DesktopPointer`-typed reference (for per-event NDC updates), while
 * exhibits + UI primitives see the wider `Pointer` shape. Keeps the
 * abstraction free of leaks for the VR/mobile siblings.
 *
 * Ray math: `THREE.Raycaster.setFromCamera(ndc, camera)` is the same
 * formula every Three.js mouse-picking sample uses. The resulting
 * `ray.origin` is the camera world position and `ray.direction` is a
 * unit vector through the NDC point. We delegate to it (rather than
 * reimplementing NDC → unproject by hand) so any future Three.js
 * camera type — orthographic, ArrayCamera, custom — would Just Work
 * if we ever swap the desktop camera.
 *
 * `pulse` is a no-op — desktop has no haptic surface. UI primitives
 * call `pointer.pulse(...)` blind to which adapter is behind it.
 */
export class DesktopPointer implements Pointer {
  readonly id: string;
  private readonly camera: THREE.Camera;
  private readonly raycaster = new THREE.Raycaster();
  // Persisted NDC. (0, 0) is screen center, which is a safe pre-input
  // default — corresponds to a ray straight through the viewport
  // center, equal to `camera.getWorldDirection`. Hover dispatch before
  // the first `pointermove` therefore lands on whatever the camera is
  // staring at, not at a stale corner.
  private readonly ndc = new THREE.Vector2(0, 0);

  constructor(camera: THREE.Camera, id = 'desktop') {
    this.camera = camera;
    this.id = id;
  }

  /**
   * Update the persisted NDC. Caller (shell pointer-event handlers)
   * converts `MouseEvent.clientX/Y` into NDC space:
   *   x = (clientX / canvas.clientWidth)  * 2 − 1
   *   y = −(clientY / canvas.clientHeight) * 2 + 1
   * The Y flip is because clientY grows downward but NDC Y grows
   * upward.
   *
   * Non-interface (per S2). Shell holds a `DesktopPointer`-typed
   * reference and calls this; primitives see only the `Pointer` shape.
   */
  setNDC(x: number, y: number): void {
    this.ndc.set(x, y);
  }

  getRayOrigin(target: THREE.Vector3): THREE.Vector3 {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return target.copy(this.raycaster.ray.origin);
  }

  getRayDirection(target: THREE.Vector3): THREE.Vector3 {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return target.copy(this.raycaster.ray.direction);
  }

  pulse(intensity: number, durationMs: number): void {
    // No haptic surface on desktop. `void`-references silence the
    // unused-parameter lint while keeping the signature identical to
    // the `Pointer` interface declaration (so call sites that
    // statically know the concrete `DesktopPointer` type still
    // pass `(intensity, durationMs)`).
    void intensity;
    void durationMs;
  }
}
