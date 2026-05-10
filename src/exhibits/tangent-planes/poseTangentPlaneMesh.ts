import * as THREE from 'three';
import { writeMathToWorld, type MathVec3 } from '@/scaffold/math/frames';

// Pure pose helper for the tangent-planes scene's tangent-plane mesh
// (#148). Lives in its own file so test/exhibits/tangent-planes/* can
// import it without triggering `index.ts`'s `registerExhibit` side
// effect at unit-test import time — same isolation pattern as
// `directionFromAngles.ts` + `raycastSurface.ts`.
//
// Position + orientation are pure functions of (pointMath, normalMath,
// surfaceCenter): mutate the mesh's `position` and `quaternion` in
// place. The math→world routing for both vectors happens here so the
// caller (TangentPlane.ts) passes raw raymarch output without thinking
// about the frame swap. Allocation-free per call (two module-scope
// scratches).

// PlaneGeometry's default normal is +Z. Quaternion is computed by
// rotating +Z to the world-frame normal.
const PLANE_REF_NORMAL = new THREE.Vector3(0, 0, 1);

// Module-scope scratches — allocated once at import, mutated per-frame.
// Same convention as `tangent-planes/index.ts:136-137`.
const positionWorld = new THREE.Vector3();
const normalWorld = new THREE.Vector3();

/**
 * Position + orient `mesh` so it sits at `pointMath` (in surface-local
 * math coords) and faces `normalMath`. `surfaceCenter` is the world-space
 * center of the surface; the mesh's final world position is
 * `writeMathToWorld(pointMath) + surfaceCenter`.
 *
 * Mutates the mesh's `position` and `quaternion`. Allocation-free. The
 * helper owns the full math→world + surfaceCenter offset — DO NOT also
 * translate the parent group by `surfaceCenter`, or the mesh will land
 * at `point + 2 × surfaceCenter`.
 *
 * Edge case: when `normalMath = [0, 1, 0]` (`+math-Y`, world `(0, 0, -1)`),
 * the world normal is anti-parallel to `PLANE_REF_NORMAL = (0, 0, 1)` and
 * `setFromUnitVectors` picks an arbitrary perpendicular axis for the 180°
 * rotation. The resulting normal direction is well-defined; only the roll
 * about that normal is arbitrary. Fires at the φ = π/2 snap point — see
 * the headset-smoke continuity check in the tangent-planes plan §6.3.
 */
export function poseTangentPlaneMesh(
  mesh: THREE.Object3D,
  pointMath: MathVec3,
  normalMath: MathVec3,
  surfaceCenter: THREE.Vector3,
): void {
  writeMathToWorld(pointMath, positionWorld);
  positionWorld.add(surfaceCenter);
  mesh.position.copy(positionWorld);

  writeMathToWorld(normalMath, normalWorld).normalize();
  mesh.quaternion.setFromUnitVectors(PLANE_REF_NORMAL, normalWorld);
}
