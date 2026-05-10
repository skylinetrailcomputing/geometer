import type { MathVec3 } from '@/scaffold/math/frames';

// Pure surface model for the gradient-levels scene's `f = x² + y² − z²`
// family (#164). Imported by both `index.ts` (per-frame raycaster) and
// `test/exhibits/gradient-levels/missRegions.test.ts` (analytic hit/miss
// expectations) so a sign-flip typo here surfaces immediately in test
// failures — the v1 plan-review's GPT F3 / HIGH finding.
//
// Math frame: X right, Y forward, Z up. The negative term lives on
// math-Z (the third coordinate). The corresponding GLSL in `index.ts`
// operates on world-frame `p` where math-Z = world-Y, so the negative
// term lands on `p.y²` there. Both forms are correct in their own
// frame; the paired SURFACE block in `index.ts` pins the agreement.

/**
 * Math-frame `f`. Returns `x² + y² − z²` *without* subtracting `k`. The
 * caller is expected to wrap with `(x, y, z) => fJsRaw(x, y, z) - k` per
 * the per-frame closure pattern in `index.ts:update`.
 */
export const fJsRaw = (x: number, y: number, z: number): number =>
  x * x + y * y - z * z;

/**
 * `∇f` in math-frame: `(2x, 2y, −2z)`. Constant in `k` (k drops out under
 * differentiation), so a single shared gradient closure works across the
 * whole family.
 */
export const gradJs = (x: number, y: number, z: number): MathVec3 => [
  2 * x,
  2 * y,
  -2 * z,
];

/**
 * AABB half-extent for the rendered surface. Single source of truth —
 * `index.ts` imports `BOUND` from here and passes it to both
 * `createImplicitSurface` and `raycastImplicit`. The test file imports
 * it to pin the BOUND-aware miss-region expectations (per §2.1's
 * `|cos(2θ)| ≥ |k|/BOUND²` AABB-clipped visibility condition).
 */
export const BOUND = 3.0;
