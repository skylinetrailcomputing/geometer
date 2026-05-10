import type { MathVec3 } from '@/scaffold/math/frames';

// Pure math-frame helper for the tangent-planes scene's θ/φ point parametrization
// (#147). Lives in its own file so test/exhibits/tangent-planes/* can import it
// without triggering `index.ts`'s `registerExhibit` side effect at unit-test
// import time — the same isolation pattern as quadrics' `classify.ts`.
//
// Math frame: X right, Y forward, Z up (#43, scaffold/math/frames.ts).
//   θ ∈ [0, π]  is polar angle from +math-Z (up).
//                 θ = 0 ⇒ direction = +math-Z (north pole, up)
//                 θ = π ⇒ direction = −math-Z (south pole, down)
//   φ ∈ [−π, π] is azimuth in the math-XY plane, measured from +math-X.
//                 φ = 0   ⇒ +math-X (right)
//                 φ = π/2 ⇒ +math-Y (forward, away from the user)
//                 φ = ±π  ⇒ −math-X (left; both ±π map to the same direction
//                           — the slider range is closed, not wrapping)

/**
 * Compute the math-frame direction for spherical angles (θ, φ).
 *
 * `out` is mutated in place to keep this allocation-free in the per-frame
 * update path. `out` must be a mutable tuple — declaring it as `MathVec3`
 * (which is `readonly [number, number, number]`) would block the index
 * writes here. The return is typed `MathVec3` so callers reading the value
 * see the immutable view; the underlying tuple is shared with the caller.
 */
export function directionFromAngles(
  theta: number,
  phi: number,
  out: [number, number, number],
): MathVec3 {
  const sinT = Math.sin(theta);
  out[0] = sinT * Math.cos(phi);
  out[1] = sinT * Math.sin(phi);
  out[2] = Math.cos(theta);
  return out;
}
