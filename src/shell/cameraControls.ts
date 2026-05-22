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
 *    `(0, 1.6, 3)` set at `shell.ts:94`. Desktop mode is the first
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
  // Pancake spawn pose (#240; v2 #225 PR1). Z = 3.7 places the
  // camera ~7.7 m from `SURFACE_CENTER`, leaving ~2.2 m of foreground
  // floor visible between the user and quadrics' cutout near-edge
  // (the tightest of the four cluster scenes' StageFloor cutouts at
  // z = -0.5). Original #240 pose was Z = 3 (~1.5 m foreground);
  // shifted +0.7 m in +world-Z alongside the plinth lift (#225 PR1
  // first-smoke maintainer feedback) so the user spawns on the same
  // side of the inner railing as the plinth's interactables rather
  // than orbiting in from "behind" the controls. Earlier #240 pose
  // `(0, 1.6, 0)` placed the camera right at the front of every
  // cutout — no foreground floor on first paint. Z values that
  // expose foreground depend on the shell's vertical FOV = 75°
  // (`shell.ts:86`); the math derivation is in
  // `_private/plans/240-pancake-default-camera.md` §3.
  camera.position.set(0, 1.6, 3.7);
  camera.lookAt(SURFACE_CENTER);

  // Re-seed OrbitControls' internal `_lastPosition` from the corrected
  // post-init position. Without this, the first render-loop update()
  // sees `_lastPosition ≠ currentPosition` and fires a spurious
  // `change` event on frame 1 — harmless under the unconditional
  // `setAnimationLoop` render today, but a latent oddity if #193 ever
  // wires a change-event listener. Idempotent for position because
  // sphericalDelta + panOffset + scale are all at identity here.
  controls.update();

  // Snapshot the configured pose as the `reset()` baseline. Without
  // this, `position0` / `target0` carry the constructor-time pre-
  // overwrite values (default target = origin, pre-init camera
  // position) and `controls.reset()` would teleport to the wrong pose.
  controls.saveState();

  return controls;
}

export { SURFACE_CENTER };
