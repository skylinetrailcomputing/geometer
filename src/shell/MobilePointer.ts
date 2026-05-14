import type * as THREE from 'three';
import { DesktopPointer } from './DesktopPointer';

/**
 * `Pointer` adapter for the mobile / touch pancake mode (#196, parent
 * #105, pancake plan v3 §3.4). Same camera-NDC ray math as
 * `DesktopPointer` — both adapters cast a perspective-camera ray
 * through a screen-space coordinate, regardless of whether the
 * coordinate came from a mouse pointermove or a touch.
 *
 * Modeled as a subclass solely to:
 *   1. Distinguish the two adapters in diagnostics (`pointer.id`).
 *   2. Give a future divergence (e.g., `navigator.vibrate` on `pulse`)
 *      a natural home — mobile devices have a haptic surface desktop
 *      doesn't, but wiring it up here would burn the v0.9 stretch
 *      budget on a feature without a smoke artifact. Deferred.
 *
 * Touch input reaches `setNDC` via pointer events with
 * `pointerType === 'touch'` — modern browsers synthesize them from
 * the underlying touch events, and `OrbitControls` handles
 * single-touch rotation + pinch-zoom natively against the same
 * `domElement` (see `cameraControls.ts`). The shell therefore
 * registers one set of `pointer{down,move,up,cancel}` listeners that
 * cover both desktop and mobile pancake modes.
 *
 * Per the issue's "single-pointer only" constraint, multi-touch
 * gestures are reserved for OrbitControls' pinch-zoom — the second
 * finger is not a second `Pointer`. The shell's `activePointerId`
 * gate enforces this at dispatch time.
 */
export class MobilePointer extends DesktopPointer {
  constructor(camera: THREE.Camera) {
    super(camera, 'mobile');
  }
}
