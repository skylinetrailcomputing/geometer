import * as THREE from 'three';

// Math ↔ world frame helpers (#120). Single source of truth for the
// geometer convention; tested in test/scaffold/math/frames.test.ts.
//
// Math frame (US-undergrad textbook convention; X right, Y forward,
// Z up — right-handed, X × Y = Z):
//   - X axis points to the user's right.
//   - Y axis points forward, away from the user (into the screen).
//   - Z axis points up.
//
// World frame (Three.js): Y up, camera default looks down −Z.
// Therefore "forward, away from user" maps to **negative** world-Z.
// The full mapping is:
//
//   math (X, Y, Z) → world (X, Z, −Y)
//   world (x, y, z) → math (x, −z, y)
//
// For squared values the negative drops out (squaring kills sign),
// which is why the quadrics shader's squared-coefficient routing
// reads as "math-Y² ↔ world-Z²" without an explicit minus. For
// vectors, linear coefficients, and any direction that needs the
// *sign* preserved, use these helpers — open-coding the swap is the
// most likely place for a sign-flip regression.

export type MathVec3 = readonly [number, number, number];

/**
 * Convert a vector from the math frame to a new Three.js Vector3 in
 * world coordinates. Allocates; convenient for one-shot uses (e.g.,
 * setting up a static axis indicator at mount time).
 *
 * For per-frame paths use {@link writeMathToWorld} instead.
 */
export function mathToWorld(v: MathVec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[2], -v[1]);
}

/**
 * Non-allocating variant: writes the world-frame conversion of `v`
 * into `target` and returns it for chaining. Use this in per-frame
 * update paths to avoid garbage.
 */
export function writeMathToWorld(
  v: MathVec3,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.set(v[0], v[2], -v[1]);
}

/**
 * Convert a Three.js Vector3 in world coordinates back to the math
 * frame. Inverse of {@link mathToWorld}.
 */
export function worldToMath(v: THREE.Vector3): MathVec3 {
  return [v.x, -v.z, v.y];
}
