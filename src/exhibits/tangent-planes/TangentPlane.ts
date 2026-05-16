import * as THREE from 'three';
import { createTranslucentRect } from '@/scaffold/render/TranslucentRect';
import {
  LOCKED_113_BODY_ALPHA,
  LOCKED_113_RIM_ALPHA,
  LOCKED_113_RIM_WIDTH_DEFAULT,
  createLocked113BodyColor,
  createLocked113RimColor,
} from '@/scaffold/render/translucentRectTokens';
import type { MathVec3 } from '@/scaffold/math/frames';
import { poseTangentPlaneMesh } from './poseTangentPlaneMesh';

// Tangent-plane mesh for the tangent-planes scene (#148). A single
// translucent rectangle anchored at the user-selected surface point,
// oriented so its normal matches ∇f at that point. Visual treatment
// mirrors the cross-section slicing-plane recipe locked in #113;
// visual constants imported from `scaffold/render/translucentRectTokens.ts`
// (#201 PR 1).
//
// Coordinate convention (locked): this wrapper's `group.position` stays
// at (0, 0, 0). The full world-space transform —
// `writeMathToWorld(pointMath) + surfaceCenter` — happens inside
// `poseTangentPlaneMesh` and writes into the inner mesh's position.
// Matches the indicator-positioning pattern in
// `tangent-planes/index.ts:271`. Setting `group.position.copy(surfaceCenter)`
// would double-offset to `point + 2 × surfaceCenter`.
//
// The wrapper constructs with `group.visible = false` so the renderer
// can't paint a stale construction-time pose between mount and the
// first update tick. The consumer flips visibility on the first hit
// frame after calling `setPose`.

export interface TangentPlaneOptions {
  /**
   * World-space center of the surface. Passed through to
   * poseTangentPlaneMesh on every setPose call so the helper can do
   * the full math→world + surfaceCenter offset in one place. The
   * wrapper group itself stays at the exhibit-local origin.
   */
  surfaceCenter: THREE.Vector3;
  /** Half-width / half-height of the plane, in meters. */
  halfExtent: number;
}

export interface TangentPlaneHandles {
  /**
   * Group containing the plane mesh. Caller adds it to the scene; the
   * inner mesh is positioned + oriented by setPose. The group stays
   * at (0, 0, 0); the inner mesh holds the world position.
   *
   * Initially `group.visible = false` — the first frame's setPose +
   * setVisible(true) from the consumer's update path uncloaks it,
   * preventing a one-frame flash at stale pose.
   */
  group: THREE.Group;
  /**
   * Drive the plane's pose from the raymarch result. `pointMath` and
   * `normalMath` are surface-local math-frame; the math→world routing
   * + the surfaceCenter translation happen inside this call so the
   * caller passes raw raymarch output.
   */
  setPose(pointMath: MathVec3, normalMath: MathVec3): void;
  /** Toggles `group.visible`, gating the rect (and any future
   * descendants) together. */
  setVisible(visible: boolean): void;
  dispose(): void;
}

/**
 * Build the tangent-plane mesh + group wrapper.
 *
 * Caller `group.add(handles.group)` to mount; call `setPose` then
 * `setVisible(true)` on every hit frame; call `setVisible(false)` on
 * miss frames; `dispose()` from unmount.
 */
export function createTangentPlane(
  opts: TangentPlaneOptions,
): TangentPlaneHandles {
  const rectHandle = createTranslucentRect({
    halfExtent: opts.halfExtent,
    bodyColor: createLocked113BodyColor(),
    bodyAlpha: LOCKED_113_BODY_ALPHA,
    rimColor: createLocked113RimColor(),
    rimAlpha: LOCKED_113_RIM_ALPHA,
    rimWidth: LOCKED_113_RIM_WIDTH_DEFAULT,
  });

  const group = new THREE.Group();
  group.visible = false;
  group.add(rectHandle.mesh);

  const surfaceCenter = opts.surfaceCenter;

  return {
    group,
    setPose(pointMath: MathVec3, normalMath: MathVec3): void {
      poseTangentPlaneMesh(
        rectHandle.mesh,
        pointMath,
        normalMath,
        surfaceCenter,
      );
    },
    setVisible(visible: boolean): void {
      group.visible = visible;
    },
    dispose(): void {
      // TranslucentRectHandles.dispose() is the single GPU-resource
      // owner per the #150 step-1 disposal contract — it disposes
      // the mesh's geometry and material together.
      rectHandle.dispose();
    },
  };
}
