import type { Exhibit } from './Exhibit';

// Pure shell-side resolver for per-scene spawn poses (#263). Owns the
// cluster-uniform fallback constants used when an exhibit doesn't
// declare its own `stage` metadata (today: `hello`, and historically
// any pre-#263-style exhibit).
//
// Pure module: no Three.js, no DOM, no renderer side effects. Vitest
// imports cleanly. The shell calls `resolveStagePose(exhibit)` at boot
// (to drive `createCameraControls`'s initial spawn and the
// `onXrSessionStart` offset) and on every successful mount swap (to
// drive `applyPancakeSpawnForExhibit`).

/**
 * Cluster-uniform fallback for pancake camera spawn. Matches today's
 * pre-#263 cluster-uniform pose (`shell.ts:142` and
 * `cameraControls.ts:87`). For cluster scenes the composed value from
 * `composeClusterStagePose` is used instead; this constant only
 * applies to exhibits that leave `stage` unset.
 */
export const CLUSTER_FALLBACK_PANCAKE_SPAWN_WORLD_XYZ = [
  0, 1.6, 3.7,
] as const;

/**
 * Cluster-uniform fallback for VR `local-floor` reference-space
 * offset. Matches today's #262 stopgap (`shell.ts:68` had
 * `VR_SPAWN_FORWARD_Z_M = 1.5`).
 */
export const CLUSTER_FALLBACK_VR_SPAWN_OFFSET_WORLD_XYZ = [
  0, 0, 1.5,
] as const;

/**
 * Cluster-uniform fallback for the SceneRack world-space anchor.
 * Matches the pre-#263 quadrics plinth anchor `(0, 0, 0.05)` —
 * `SceneRack` originally baked `SCENE_RACK_Z = 0.05` into tab-local
 * positions; the per-scene wire-up moved that knob to the
 * `rack.group.position` so the rack tracks the per-scene plinth
 * anchor. Non-cluster exhibits land here so direct dev imports of
 * e.g. `hello` render the rack at the original world Z.
 */
export const CLUSTER_FALLBACK_RACK_ANCHOR_WORLD_XYZ = [
  0, 0, 0.05,
] as const;

export interface ResolvedStagePose {
  readonly pancakeSpawnWorldXYZ: readonly [number, number, number];
  readonly vrSpawnOffsetWorldXYZ: readonly [number, number, number];
  readonly rackAnchorWorldXYZ: readonly [number, number, number];
}

export function resolveStagePose(exhibit: Exhibit): ResolvedStagePose {
  return {
    pancakeSpawnWorldXYZ:
      exhibit.stage?.pancakeSpawnWorldXYZ
      ?? CLUSTER_FALLBACK_PANCAKE_SPAWN_WORLD_XYZ,
    vrSpawnOffsetWorldXYZ:
      exhibit.stage?.vrSpawnOffsetWorldXYZ
      ?? CLUSTER_FALLBACK_VR_SPAWN_OFFSET_WORLD_XYZ,
    rackAnchorWorldXYZ:
      exhibit.stage?.rackAnchorWorldXYZ
      ?? CLUSTER_FALLBACK_RACK_ANCHOR_WORLD_XYZ,
  };
}
