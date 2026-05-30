import { describe, expect, it } from 'vitest';
import { composeClusterStagePose } from '@/scaffold/staging/clusterStagePose';
import quadrics from '@/exhibits/quadrics';
import tangentPlanes from '@/exhibits/tangent-planes';
import gradientLevels from '@/exhibits/gradient-levels';
import saddleExtrema from '@/exhibits/saddle-extrema';

// Per-scene `Exhibit.stage` registration regression guard (#263 §4.2).
// Catches a scene editor who changes the cutout half-extent (or any
// other helper input) without re-checking the spawn-pose registration.
//
// Per the v2 → v3 plan revision (Sonnet v2 #2): the test compares
// spawn-pose fields (`pancakeSpawnWorldXYZ` / `vrSpawnOffsetWorldXYZ`)
// against the helper output, NOT `plinthAnchorWorldXYZ`. The plinth-
// anchor field lives on `ClusterStagePose` (scaffold helper) but is
// deliberately absent from `ExhibitStageMetadata` (`shell/Exhibit.ts`)
// per the §3.2 shell-consumer-only invariant. Comparing spawn poses
// gives equivalent regression coverage (both derive from the same
// anchor arithmetic) without breaking the type invariant.

describe('quadrics', () => {
  const expected = composeClusterStagePose({
    cutout: {
      kind: 'rect' as const,
      centerXZ: [0, -4] as const,
      halfExtentX: 3.675,
      halfExtentZ: 3.675,
    },
  });
  it('registers the cutout-derived pancake spawn', () => {
    expect(quadrics.stage?.pancakeSpawnWorldXYZ).toStrictEqual(
      expected.pancakeSpawnWorldXYZ,
    );
  });
  it('registers the cutout-derived VR spawn offset', () => {
    expect(quadrics.stage?.vrSpawnOffsetWorldXYZ).toStrictEqual(
      expected.vrSpawnOffsetWorldXYZ,
    );
  });
});

describe('tangent-planes', () => {
  const expected = composeClusterStagePose({
    cutout: {
      kind: 'circle' as const,
      centerXZ: [0, -4] as const,
      radius: 1.5,
    },
  });
  it('registers the cutout-derived pancake spawn', () => {
    expect(tangentPlanes.stage?.pancakeSpawnWorldXYZ).toStrictEqual(
      expected.pancakeSpawnWorldXYZ,
    );
  });
  it('registers the cutout-derived VR spawn offset', () => {
    expect(tangentPlanes.stage?.vrSpawnOffsetWorldXYZ).toStrictEqual(
      expected.vrSpawnOffsetWorldXYZ,
    );
  });
});

describe('gradient-levels', () => {
  const expected = composeClusterStagePose({
    cutout: {
      kind: 'rect' as const,
      centerXZ: [0, -4] as const,
      halfExtentX: 3.0,
      halfExtentZ: 3.0,
    },
  });
  it('registers the cutout-derived pancake spawn', () => {
    expect(gradientLevels.stage?.pancakeSpawnWorldXYZ).toStrictEqual(
      expected.pancakeSpawnWorldXYZ,
    );
  });
  it('registers the cutout-derived VR spawn offset', () => {
    expect(gradientLevels.stage?.vrSpawnOffsetWorldXYZ).toStrictEqual(
      expected.vrSpawnOffsetWorldXYZ,
    );
  });
});

describe('saddle-extrema', () => {
  const expected = composeClusterStagePose({
    cutout: {
      kind: 'rect' as const,
      centerXZ: [0, -4] as const,
      halfExtentX: 1.575,
      halfExtentZ: 1.575,
    },
  });
  it('registers the cutout-derived pancake spawn', () => {
    expect(saddleExtrema.stage?.pancakeSpawnWorldXYZ).toStrictEqual(
      expected.pancakeSpawnWorldXYZ,
    );
  });
  it('registers the cutout-derived VR spawn offset', () => {
    expect(saddleExtrema.stage?.vrSpawnOffsetWorldXYZ).toStrictEqual(
      expected.vrSpawnOffsetWorldXYZ,
    );
  });
});
