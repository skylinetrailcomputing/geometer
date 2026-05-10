import * as THREE from 'three';
import { writeMathToWorld, type MathVec3 } from '@/scaffold/math/frames';

// Pure pose helper for the gradient-levels scene's gradient-vector
// arrow (#165). Lives in its own file so test/exhibits/gradient-levels/*
// can import it without triggering `index.ts`'s `registerExhibit` side
// effect at unit-test import time — same isolation pattern as
// `directionFromAngles.ts`, `surfaceModel.ts`, `poseTangentPlaneMesh.ts`.
//
// Position + orientation are pure functions of (pointMath, normalMath,
// surfaceCenter): mutate the mesh's `position` and `quaternion` in
// place. The math→world routing for both vectors happens here so the
// caller (GradientArrow.ts) passes raw raymarch output without thinking
// about the frame swap. Allocation-free per call (two module-scope
// scratches).

// CylinderGeometry's default axis is +Y. The merged shaft+cone in
// GradientArrow.ts is built tail-at-origin, tip-along-+Y. Quaternion is
// computed by rotating +Y to the world-frame ∇f direction.
const ARROW_REF_AXIS = new THREE.Vector3(0, 1, 0);

// Module-scope scratches — allocated once at import, mutated per-frame.
const positionWorld = new THREE.Vector3();
const directionWorld = new THREE.Vector3();

/**
 * Position + orient `mesh` so its tail sits at `pointMath` (in surface-
 * local math coords) and its tip points along `normalMath`.
 * `surfaceCenter` is the world-space center of the surface; the mesh's
 * final world position is `writeMathToWorld(pointMath) + surfaceCenter`.
 *
 * Mutates the mesh's `position` and `quaternion`. Allocation-free. The
 * helper owns the full math→world + surfaceCenter offset — DO NOT also
 * translate the parent group by `surfaceCenter`, or the mesh will land
 * at `point + 2 × surfaceCenter`.
 *
 * Edge case: when `normalMath = [0, 0, -1]` (math-Z south, world
 * `(0, -1, 0)`), the world direction is anti-parallel to
 * `ARROW_REF_AXIS = (0, 1, 0)` and `setFromUnitVectors` picks an
 * arbitrary perpendicular axis for the 180° rotation. The arrow
 * direction is well-defined; the roll about its own axis is arbitrary
 * BUT INVISIBLE (cylinder + cone are bodies of revolution about +Y;
 * at 32 radial segments the silhouette is fine enough that the
 * faceted-vs-continuous gap doesn't read). Distinct from the
 * tangent-plane mesh case, where roll IS visible at the corners.
 *
 * Fires at θ=0 with k<0 (math-Z+ axis hits the upper 2-sheet apex
 * where ∇f points along math-Z−, world `(0, -1, 0)`).
 */
export function poseGradientArrow(
  mesh: THREE.Object3D,
  pointMath: MathVec3,
  normalMath: MathVec3,
  surfaceCenter: THREE.Vector3,
): void {
  writeMathToWorld(pointMath, positionWorld);
  positionWorld.add(surfaceCenter);
  mesh.position.copy(positionWorld);

  // Defensive .normalize() — raycastImplicit already returns a unit
  // normal (raycastImplicit.ts:172-174), but keeping the explicit
  // normalize matches poseTangentPlaneMesh.ts and guards against
  // future raycaster contract drift. Cost: one Math.sqrt per hit frame.
  writeMathToWorld(normalMath, directionWorld).normalize();
  mesh.quaternion.setFromUnitVectors(ARROW_REF_AXIS, directionWorld);
}
