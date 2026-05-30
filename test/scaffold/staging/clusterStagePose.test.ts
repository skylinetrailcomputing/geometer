import { describe, expect, it } from 'vitest';
import {
  PANCAKE_SPAWN_PADDING_Z_M_DEFAULT,
  PLINTH_BODY_BACK_CLEARANCE_DEFAULT,
  VR_SPAWN_PADDING_Z_M_DEFAULT,
  composeClusterStagePose,
} from '@/scaffold/staging/clusterStagePose';

// Pure-helper coverage for the per-scene plinth-anchor + spawn-pose
// derivation (#263). The four scene-specific cases hit the actual
// cluster's cutout descriptors so a regression in the helper
// (changed defaults, busted arithmetic) flips them immediately.
//
// Quadrics is the calibration case: the pre-#263 cluster-uniform
// literals `[0, 0, 0.05]` / `[0, 1.6, 3.7]` / `[0, 0, 1.5]` are
// exact-equal expected outputs (`roundToMm` ensures strict equality,
// not just `toBeCloseTo`).

describe('composeClusterStagePose — quadrics calibration', () => {
  // Quadrics: rect cutout, halfExtentZ = BOUND × CUTOUT_VISUAL_MARGIN
  // = 3.5 × 1.05 = 3.675, centered at world (0, -4).
  const QUADRICS_CUTOUT = {
    kind: 'rect' as const,
    centerXZ: [0, -4] as const,
    halfExtentX: 3.675,
    halfExtentZ: 3.675,
  };

  it('returns the calibrated plinth anchor [0, 0, 0.05] under strict equality', () => {
    const pose = composeClusterStagePose({ cutout: QUADRICS_CUTOUT });
    expect(pose.plinthAnchorWorldXYZ).toStrictEqual([0, 0, 0.05]);
  });

  it('returns the calibrated pancake spawn [0, 1.6, 3.7]', () => {
    const pose = composeClusterStagePose({ cutout: QUADRICS_CUTOUT });
    expect(pose.pancakeSpawnWorldXYZ).toStrictEqual([0, 1.6, 3.7]);
  });

  it('returns the calibrated VR offset [0, 0, 1.5]', () => {
    const pose = composeClusterStagePose({ cutout: QUADRICS_CUTOUT });
    expect(pose.vrSpawnOffsetWorldXYZ).toStrictEqual([0, 0, 1.5]);
  });
});

describe('composeClusterStagePose — per-scene cases', () => {
  it('tangent-planes (circle, radius 1.5) → anchor [0, 0, -2.125]', () => {
    const pose = composeClusterStagePose({
      cutout: {
        kind: 'circle' as const,
        centerXZ: [0, -4] as const,
        radius: 1.5,
      },
    });
    expect(pose.plinthAnchorWorldXYZ).toStrictEqual([0, 0, -2.125]);
    expect(pose.pancakeSpawnWorldXYZ).toStrictEqual([0, 1.6, 1.525]);
    expect(pose.vrSpawnOffsetWorldXYZ).toStrictEqual([0, 0, -0.675]);
  });

  it('gradient-levels (rect, halfExtentZ 3.0) → anchor [0, 0, -0.625]', () => {
    const pose = composeClusterStagePose({
      cutout: {
        kind: 'rect' as const,
        centerXZ: [0, -4] as const,
        halfExtentX: 3.0,
        halfExtentZ: 3.0,
      },
    });
    expect(pose.plinthAnchorWorldXYZ).toStrictEqual([0, 0, -0.625]);
    expect(pose.pancakeSpawnWorldXYZ).toStrictEqual([0, 1.6, 3.025]);
    expect(pose.vrSpawnOffsetWorldXYZ).toStrictEqual([0, 0, 0.825]);
  });

  it('saddle-extrema (rect, halfExtentZ 1.575) → anchor [0, 0, -2.05]', () => {
    const pose = composeClusterStagePose({
      cutout: {
        kind: 'rect' as const,
        centerXZ: [0, -4] as const,
        halfExtentX: 1.575,
        halfExtentZ: 1.575,
      },
    });
    expect(pose.plinthAnchorWorldXYZ).toStrictEqual([0, 0, -2.05]);
    expect(pose.pancakeSpawnWorldXYZ).toStrictEqual([0, 1.6, 1.6]);
    expect(pose.vrSpawnOffsetWorldXYZ).toStrictEqual([0, 0, -0.6]);
  });
});

describe('composeClusterStagePose — derives from cutout, not surfaceCenter', () => {
  // GPT #5 + DeepSeek #2 convergent finding from v1 roundtable: the
  // helper must source the railing-front-Z from `cutout.centerXZ[1]`
  // (not a hardcoded `SURFACE_CENTER.z`). Today every cluster scene's
  // cutout coincides with SURFACE_CENTER.xz; this guard catches a
  // future scene that shifts the cutout center.
  it('shifts anchor when cutout center moves', () => {
    const baseline = composeClusterStagePose({
      cutout: {
        kind: 'rect' as const,
        centerXZ: [0, -4] as const,
        halfExtentX: 3.675,
        halfExtentZ: 3.675,
      },
    });
    const shifted = composeClusterStagePose({
      cutout: {
        kind: 'rect' as const,
        centerXZ: [0, -3.5] as const, // 0.5 m closer in +Z
        halfExtentX: 3.675,
        halfExtentZ: 3.675,
      },
    });
    // Shifting centerXZ[1] by +0.5 m must shift anchor.z by +0.5 m.
    expect(shifted.plinthAnchorWorldXYZ[2]).toBeCloseTo(
      baseline.plinthAnchorWorldXYZ[2] + 0.5,
    );
  });

  it('uses cutout.centerXZ[0] for anchor X', () => {
    const offCenter = composeClusterStagePose({
      cutout: {
        kind: 'rect' as const,
        centerXZ: [1.25, -4] as const,
        halfExtentX: 3.675,
        halfExtentZ: 3.675,
      },
    });
    expect(offCenter.plinthAnchorWorldXYZ[0]).toBeCloseTo(1.25);
    expect(offCenter.pancakeSpawnWorldXYZ[0]).toBeCloseTo(1.25);
    expect(offCenter.vrSpawnOffsetWorldXYZ[0]).toBeCloseTo(1.25);
  });
});

describe('composeClusterStagePose — option overrides', () => {
  // Brackets per the helper's doc comments — smoke-tunable.
  const BASE_CUTOUT = {
    kind: 'rect' as const,
    centerXZ: [0, -4] as const,
    halfExtentX: 3.675,
    halfExtentZ: 3.675,
  };

  it('honors plinthBodyBackClearance override', () => {
    const tighter = composeClusterStagePose({
      cutout: BASE_CUTOUT,
      plinthBodyBackClearance: 0.03,
    });
    // Anchor.z shifts by (0.045 default − 0.03 override) = -0.015.
    expect(tighter.plinthAnchorWorldXYZ[2]).toBeCloseTo(0.05 - 0.015);
  });

  it('honors pancakeSpawnPaddingZ override', () => {
    const closer = composeClusterStagePose({
      cutout: BASE_CUTOUT,
      pancakeSpawnPaddingZ: 3.0,
    });
    expect(closer.pancakeSpawnWorldXYZ[2]).toBeCloseTo(0.05 + 3.0);
  });

  it('honors vrSpawnPaddingZ override', () => {
    const farther = composeClusterStagePose({
      cutout: BASE_CUTOUT,
      vrSpawnPaddingZ: 1.7,
    });
    expect(farther.vrSpawnOffsetWorldXYZ[2]).toBeCloseTo(0.05 + 1.7);
  });

  it('exports the bracket-baked default constants', () => {
    expect(PLINTH_BODY_BACK_CLEARANCE_DEFAULT).toBeCloseTo(0.045);
    expect(PANCAKE_SPAWN_PADDING_Z_M_DEFAULT).toBeCloseTo(3.65);
    expect(VR_SPAWN_PADDING_Z_M_DEFAULT).toBeCloseTo(1.45);
  });
});
