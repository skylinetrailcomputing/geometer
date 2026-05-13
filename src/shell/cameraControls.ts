import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Cluster-anchor world-space point. Matches the per-exhibit
 * `SURFACE_CENTER` value used across the cluster scenes
 * (`exhibits/tangent-planes/index.ts:47`,
 * `exhibits/gradient-levels/index.ts`,
 * `exhibits/saddle-extrema/index.ts`,
 * `exhibits/quadrics/index.ts`) — the visible volume the desktop
 * orbit camera should rotate around.
 *
 * Kept module-local rather than imported from one exhibit: the shell
 * stays free of cross-cluster scene imports, and the four scenes'
 * `SURFACE_CENTER` constants are already independent declarations that
 * happen to coincide.
 */
const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);

/**
 * `OrbitControls` wrapper configured for the cluster's spatial
 * envelope (pancake plan v3 §3.3, parent #105, this issue #192).
 *
 * Leaf module — not yet consumed. #193 wires this into `bootShell()`
 * behind the desktop boot path. Until then, this module is
 * purely additive.
 *
 * Mutations applied at construction time:
 *
 * 1. `controls.target` set to `SURFACE_CENTER` so user-driven orbit
 *    rotates around the cluster anchor.
 * 2. `camera.position` overrides the unused-in-XR pre-session
 *    `(0, 1.6, 3)` set at `shell.ts:34`. Desktop mode is the first
 *    time the `PerspectiveCamera`'s position matters at render time
 *    — XR renders via an `ArrayCamera` driven by HMD pose, not this
 *    `PerspectiveCamera` (pancake plan v3 §3.3, S5 / G10).
 * 3. `camera.lookAt(SURFACE_CENTER)` runs **after** the OrbitControls
 *    constructor (which itself calls `update()` against the default
 *    `target = (0,0,0)` and would re-orient + reposition the camera).
 *    Setting target + position + lookAt last makes the first-frame
 *    state deterministic — the next render-loop `controls.update()`
 *    re-derives spherical from the (camera, target) pair directly,
 *    with negligible drift (pancake plan v3 §3.3, G10).
 *
 * Damping is enabled, so callers must invoke `controls.update()`
 * once per frame (per the desktop per-frame order in plan v3 §3.6).
 *
 * `domElement` is optional. When non-null, OrbitControls attaches
 * its pointer / wheel / touch listeners to the element immediately.
 * When `null` / omitted (e.g., the standalone config-validation
 * tests), the controls instance carries the full config but stays
 * detached — `controls.connect(el)` would attach later if needed.
 */
export function createCameraControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement | null = null,
): OrbitControls {
  const controls = new OrbitControls(camera, domElement);

  controls.minDistance = 1.5;
  controls.maxDistance = 12;
  controls.minPolarAngle = 0.1 * Math.PI;
  controls.maxPolarAngle = 0.85 * Math.PI;

  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Reset target + camera state AFTER the OrbitControls constructor's
  // implicit `update()` so first-frame state is the cluster-anchor
  // configuration, not whatever spherical the constructor derived
  // against the default `target = (0, 0, 0)`.
  controls.target.copy(SURFACE_CENTER);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(SURFACE_CENTER);

  return controls;
}

export { SURFACE_CENTER };
