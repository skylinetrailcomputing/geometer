import {
  PLINTH_BODY_DEPTH,
} from '@/scaffold/staging/Plinth';
import { STAGE_RAILING_TUBE_RADIUS } from '@/scaffold/staging/StageRailing';
import type { StageCutoutDescriptor } from '@/scaffold/staging/StageFloor';

// Cluster-uniform staging pose composition for the v1.0 staged-exhibit
// vocabulary (#263). Replaces the cluster-uniform
// `PLINTH_ANCHOR_WORLD_XYZ = [0, 0, 0.05]` literal duplicated in every
// cluster scene + the cluster-uniform pancake spawn `(0, 1.6, 3.7)` and
// VR offset `+1.5 m` with per-scene-derived values:
//
//   - Plinth anchor: derived from the cutout's `centerXZ[1] + halfZ` so
//     the plinth body's back face sits at uniform clearance from the
//     inner railing's user-facing tube edge regardless of math envelope.
//   - Pancake + VR spawn poses: derived from the anchor + per-mode
//     arm's-length padding (3.65 m pancake, 1.45 m VR) so user-to-plinth
//     distance is invariant across scenes within each mode.
//
// The math object (`SURFACE_CENTER = (0, 1.5, -4)`) stays put. The floor
// outer extent stays put. The back railing stays put. Quadrics is the
// calibration case: anchor `[0, 0, 0.05]`, pancake spawn `[0, 1.6, 3.7]`,
// VR offset `[0, 0, 1.5]` are bit-identical to today's cluster-uniform
// values to within ±0.5 mm (`roundToMm` ensures strict equality).
//
// See `_private/plans/263-per-scene-plinth-and-spawn.md` §3.1 for the
// derivation rule + per-scene results table.

/** Plinth body back ↔ railing tube +Z edge clearance, meters. Bracket
 *  [0.03, 0.06]; smoke-tunable. Calibrated by Brad 2026-05-22 smoke
 *  during #225 PR1: 45 mm "an order of magnitude more visual margin
 *  than v1 had" (quadrics/index.ts:84–88). */
export const PLINTH_BODY_BACK_CLEARANCE_DEFAULT = 0.045;

/** Arm's-length padding from plinth front face to pancake spawn,
 *  meters. Bracket [3.0, 4.0]; matches #240's post-smoke calibration
 *  of 3.65 m (anchor 0.05 + 3.65 = 3.70 — the current cluster-uniform
 *  pancake spawn-Z for quadrics, post-#225-PR1 smoke nudge from 3.0
 *  to 3.7). Pancake's larger padding vs VR reflects that pancake
 *  spawn is "where the math object best frames against the cutout
 *  foreground," not "where the user stands at HMD-takeover." */
export const PANCAKE_SPAWN_PADDING_Z_M_DEFAULT = 3.65;

/** Arm's-length padding from plinth front face to VR spawn, meters.
 *  Bracket [1.2, 1.7]; matches today's #262 cluster-uniform 1.45 m
 *  (= 1.5 cluster-uniform offset − 0.05 cluster-uniform anchor.z).
 *  Validated by Brad in #262 smoke as "clear of the plinth volume
 *  with arm's-length reach." Memory: [feedback_vr_spawn_arm_length_
 *  from_interactable] — leave a deliberate ~1–1.5 m gap so the user
 *  is cued to step forward to engage. */
export const VR_SPAWN_PADDING_Z_M_DEFAULT = 1.45;

export interface ClusterStagePose {
  /** Plinth ctor input. Floor-footprint center; body extends back
   *  from this Z by `PLINTH_BODY_DEPTH` (0.3). */
  readonly plinthAnchorWorldXYZ: readonly [number, number, number];
  /** Pancake camera initial position. Y = 1.6 (WebXR eye-height
   *  convention). */
  readonly pancakeSpawnWorldXYZ: readonly [number, number, number];
  /** VR `local-floor` reference-space offset: applied as
   *  `XRRigidTransform({-x, -y, -z}, identity)` in `shell.ts`'s
   *  session-start handler. Y = 0 (HMD pose drives user Y). */
  readonly vrSpawnOffsetWorldXYZ: readonly [number, number, number];
}

export interface ClusterStagePoseOptions {
  /** Same descriptor the scene passes to `createStageFloor` /
   *  `createStageInnerRailing` / `createContrastPit`. The
   *  `centerXZ[1]` + `halfExtentZ` (or `radius`) drives anchor Z. */
  readonly cutout: StageCutoutDescriptor;
  /** Default `PLINTH_BODY_BACK_CLEARANCE_DEFAULT`. Smoke-tunable. */
  readonly plinthBodyBackClearance?: number;
  /** Default `PANCAKE_SPAWN_PADDING_Z_M_DEFAULT`. */
  readonly pancakeSpawnPaddingZ?: number;
  /** Default `VR_SPAWN_PADDING_Z_M_DEFAULT`. */
  readonly vrSpawnPaddingZ?: number;
}

/**
 * Compose the cluster's per-scene plinth anchor + pancake spawn + VR
 * spawn offset from a stage-floor cutout descriptor. Pure function;
 * call once per scene at module-load time.
 *
 * Derivation (anchor Z):
 *   anchorZ = cutout.centerXZ[1]               // railing-center-Z
 *           + halfExtentZ_or_radius            // railing front face
 *           + STAGE_RAILING_TUBE_RADIUS        // tube +Z edge
 *           + plinthBodyBackClearance          // visual margin
 *           + PLINTH_BODY_DEPTH                // body front face = anchor
 *
 * Derivation (spawn Z): anchorZ + per-mode padding.
 *
 * Output rounded to mm so the helper's quadrics calibration case
 * (cutout halfExtentZ 3.675 at centerXZ.y = -4) returns
 * `[0, 0, 0.05]` under strict equality, not `[0, 0, 0.04999...]`.
 * Sub-mm is below smoke-tunable resolution; rounding makes tests
 * + back-compat literals work without `toBeCloseTo` everywhere.
 */
export function composeClusterStagePose(
  opts: ClusterStagePoseOptions,
): ClusterStagePose {
  const [cx, cz] = opts.cutout.centerXZ;
  const halfZ =
    opts.cutout.kind === 'rect' ? opts.cutout.halfExtentZ : opts.cutout.radius;
  const clearance =
    opts.plinthBodyBackClearance ?? PLINTH_BODY_BACK_CLEARANCE_DEFAULT;
  const pancakePad =
    opts.pancakeSpawnPaddingZ ?? PANCAKE_SPAWN_PADDING_Z_M_DEFAULT;
  const vrPad = opts.vrSpawnPaddingZ ?? VR_SPAWN_PADDING_Z_M_DEFAULT;

  const anchorZ = roundToMm(
    cz + halfZ + STAGE_RAILING_TUBE_RADIUS + clearance + PLINTH_BODY_DEPTH,
  );
  const anchorX = roundToMm(cx);

  return {
    plinthAnchorWorldXYZ: [anchorX, 0, anchorZ] as const,
    pancakeSpawnWorldXYZ: [anchorX, 1.6, roundToMm(anchorZ + pancakePad)] as const,
    vrSpawnOffsetWorldXYZ: [anchorX, 0, roundToMm(anchorZ + vrPad)] as const,
  };
}

function roundToMm(x: number): number {
  return Math.round(x * 1000) / 1000;
}
