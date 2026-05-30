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
 * Per-scene spawn pose as of #263. `spawnWorldXYZ` is the initial
 * camera position — derived per-scene from the cluster stage-pose
 * helper (`scaffold/staging/clusterStagePose.ts`), or the cluster-
 * uniform fallback `(0, 1.6, 3.7)` for non-cluster exhibits.
 *
 * Mutations applied at construction time:
 *
 * 1. `controls.target` set to `SURFACE_CENTER` so user-driven orbit
 *    rotates around the cluster anchor (cluster-uniform; the math
 *    object stays put across scene-hops per #263 §1).
 * 2. `camera.position` set to the boot exhibit's `spawnWorldXYZ`.
 *    XR renders via an `ArrayCamera` driven by HMD pose, not this
 *    `PerspectiveCamera` (pancake plan v3 §3.3, S5 / G10) — the
 *    `spawnWorldXYZ` parameter is pancake-mode only.
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
  domElement: HTMLElement | null,
  spawnWorldXYZ: readonly [number, number, number],
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
  camera.position.set(spawnWorldXYZ[0], spawnWorldXYZ[1], spawnWorldXYZ[2]);
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
  // `applyPancakeSpawnForExhibit` re-snapshots after every scene-hop
  // so reset goes back to the current scene's pose, not the boot pose.
  controls.saveState();

  return controls;
}

/**
 * Reposition the pancake camera + refresh OrbitControls reset
 * baseline for a newly-mounted exhibit (#263 §3.3). Called from
 * `switchExhibitNow` in `shell.ts` after `target.mount(ctx)` when
 * `cameraControls !== null` (pancake-mode guard).
 *
 * Keeps `target` at `SURFACE_CENTER` defensively — the math object
 * stays put across scene-hops, so the orbit pivot is invariant.
 * `controls.saveState()` snapshots the new pose so `reset()` goes
 * back to the current scene's spawn, not the boot scene's.
 */
export function applyPancakeSpawnForExhibit(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  spawnWorldXYZ: readonly [number, number, number],
): void {
  camera.position.set(spawnWorldXYZ[0], spawnWorldXYZ[1], spawnWorldXYZ[2]);
  camera.lookAt(SURFACE_CENTER);
  controls.target.copy(SURFACE_CENTER);
  controls.update();
  controls.saveState();
}

export { SURFACE_CENTER };
