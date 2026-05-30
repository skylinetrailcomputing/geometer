import { describe, expect, it } from 'vitest';
import type { Exhibit } from '@/shell/Exhibit';
import {
  CLUSTER_FALLBACK_PANCAKE_SPAWN_WORLD_XYZ,
  CLUSTER_FALLBACK_RACK_ANCHOR_WORLD_XYZ,
  CLUSTER_FALLBACK_VR_SPAWN_OFFSET_WORLD_XYZ,
  resolveStagePose,
} from '@/shell/stagePose';

// Pure-shell coverage for the #263 `Exhibit.stage` resolver. The
// resolver substitutes cluster-uniform fallback constants when an
// exhibit (e.g. `hello`) doesn't expose `stage` metadata. Cluster
// scenes always do — see `test/exhibits/cluster-stage-pose.test.ts`.

// Build a minimal `Exhibit`-shape stub. The resolver only reads
// `exhibit.stage`, so the other fields are present only to satisfy
// TypeScript's structural shape check.
const stubExhibit = (
  stage: Exhibit['stage'] | undefined = undefined,
): Exhibit => ({
  id: 'stub',
  title: 'Stub',
  stage,
  mount() {},
  update() {},
  unmount() {},
  onSelectStart() { return false; },
  onSelectEnd() {},
});

describe('resolveStagePose', () => {
  it('returns the cluster-uniform fallback when exhibit.stage is unset', () => {
    const pose = resolveStagePose(stubExhibit(undefined));
    expect(pose.pancakeSpawnWorldXYZ).toBe(
      CLUSTER_FALLBACK_PANCAKE_SPAWN_WORLD_XYZ,
    );
    expect(pose.vrSpawnOffsetWorldXYZ).toBe(
      CLUSTER_FALLBACK_VR_SPAWN_OFFSET_WORLD_XYZ,
    );
    expect(pose.rackAnchorWorldXYZ).toBe(
      CLUSTER_FALLBACK_RACK_ANCHOR_WORLD_XYZ,
    );
  });

  it('returns the exhibit-provided poses when stage is present', () => {
    const pancake = [0, 1.6, 1.525] as const;
    const vrOffset = [0, 0, -0.675] as const;
    const rackAnchor = [0, 0, -2.125] as const;
    const pose = resolveStagePose(
      stubExhibit({
        pancakeSpawnWorldXYZ: pancake,
        vrSpawnOffsetWorldXYZ: vrOffset,
        rackAnchorWorldXYZ: rackAnchor,
      }),
    );
    expect(pose.pancakeSpawnWorldXYZ).toBe(pancake);
    expect(pose.vrSpawnOffsetWorldXYZ).toBe(vrOffset);
    expect(pose.rackAnchorWorldXYZ).toBe(rackAnchor);
  });
});

describe('cluster-uniform fallback constants', () => {
  // Pre-#263 pancake spawn (`(0, 1.6, 3.7)` — see `_private/plans/
  // 240-pancake-default-camera.md`) and #262 VR offset (`+1.5 m`)
  // were the cluster-uniform behavior the fallback preserves for
  // non-cluster exhibits.
  it('pancake fallback matches the pre-#263 cluster-uniform spawn', () => {
    expect(CLUSTER_FALLBACK_PANCAKE_SPAWN_WORLD_XYZ).toStrictEqual([0, 1.6, 3.7]);
  });

  it('VR fallback matches the #262 cluster-uniform offset', () => {
    expect(CLUSTER_FALLBACK_VR_SPAWN_OFFSET_WORLD_XYZ).toStrictEqual([0, 0, 1.5]);
  });

  it('rack-anchor fallback matches the pre-#263 SCENE_RACK_Z baseline', () => {
    expect(CLUSTER_FALLBACK_RACK_ANCHOR_WORLD_XYZ).toStrictEqual([0, 0, 0.05]);
  });
});
