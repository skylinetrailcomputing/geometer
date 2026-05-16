import type { MathVec3 } from '@/scaffold/math/frames';

// Inverse of `directionFromAngles` (#197). Given a unit math-frame
// direction, recover the spherical-coordinate (θ, φ) on the tangent-planes
// SPEC.md parametrization. Used by the controller-aim picking path: a
// ray-sphere hit yields a math-frame point on the unit sphere, which we
// feed through this helper to drive the θ / φ sliders.
//
// Math frame (X right, Y forward, Z up; `scaffold/math/frames.ts`):
//   θ = arccos(z)       ∈ [0, π]    polar angle from +math-Z
//   φ = atan2(y, x)     ∈ [−π, π]   azimuth in math-XY from +math-X
//
// Pole behavior. At `dir = (0, 0, ±1)` (north / south pole), `x = y = 0`
// and `φ` is mathematically undefined — every φ produces the same world
// point. `Math.atan2(0, 0)` returns `0` by IEEE 754; we let that through
// rather than carrying caller-supplied state. The visible consequence is
// the φ slider snapping to 0 when the user aims exactly at a pole; the
// indicator + tangent plane don't visibly move, since φ is degenerate
// there. v0.9-acceptable (the in-headset pick-near-pole case lands close
// to but not exactly on the pole and reads naturally).
//
// `dir.z` may sit a hair outside `[-1, 1]` due to ray-sphere intersection
// numerics (component magnitudes can drift to ~1 + 1e-16). `Math.acos`
// returns `NaN` outside that range, which would poison the θ slider; we
// clamp to keep the contract clean.

export interface SphericalAngles {
  /** Polar angle from +math-Z, in `[0, π]`. */
  theta: number;
  /** Azimuth in math-XY from +math-X, in `[−π, π]`. */
  phi: number;
}

/**
 * Recover `(θ, φ)` from a unit math-frame direction. Pure; no allocations
 * beyond the returned object literal. Inverse of {@link directionFromAngles}
 * on the parametrization `(sin θ cos φ, sin θ sin φ, cos θ)`.
 */
export function anglesFromDirection(dir: MathVec3): SphericalAngles {
  // Clamp the z component before `acos`. See header for numerics rationale.
  const z = Math.min(1, Math.max(-1, dir[2]));
  return {
    theta: Math.acos(z),
    phi: Math.atan2(dir[1], dir[0]),
  };
}
