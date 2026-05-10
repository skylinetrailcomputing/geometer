import type { MathVec3 } from '@/scaffold/math/frames';
import { formatSignedMagnitude } from '@/scaffold/ui/formatSignedMagnitude';

// Pure formatter for the gradient-levels readout (#166). Given the raw
// surface-local gradient ∇f at the selected point, produce the four
// numeric-slot strings the readout's troika-Text instances render.
//
// Lives in its own file so test/exhibits/gradient-levels/* can import
// without triggering `index.ts`'s `registerExhibit` side effect at
// unit-test import time — same isolation pattern as
// `surfaceModel.ts`, `poseGradientArrow.ts`.
//
// Takes a single `MathVec3 gradient` (the raw, un-normalized ∇f from
// `gradJs(p)`) — NOT the unit normal from `raycastImplicit`'s
// `result.normal`. The composition test in
// `test/exhibits/gradient-levels/formatGradientLevelsReadout.test.ts`
// pins this contract: feeding a unit normal yields magnitude '1.00'
// instead of the real |∇f|, so the wiring failure mode is fail-loud
// at the unit-test level.

function formatUnsignedMagnitude(v: number): string {
  // |∇f| is non-negative by definition; no sign character. Local helper —
  // only this readout uses it. If a future scene also wants unsigned
  // 2-decimal, extract on its third use per the repo's house rule.
  return Math.abs(v).toFixed(2);
}

export interface GradientLevelsReadoutStrings {
  /** Top-line ∇f components, in math reading order [∂f/∂x, ∂f/∂y, ∂f/∂z]. */
  components: readonly [string, string, string];
  /** Bottom-line |∇f|, unsigned 2-decimal. */
  magnitude: string;
}

/**
 * Format the four numeric strings the readout displays from a raw
 * gradient vector. Pure; allocates one fresh struct per call.
 * Allocation cost is bounded by the readout's update throttle (≈30 Hz),
 * so the per-frame call rate stays under 30 allocations/second.
 *
 * The input gradient is in math-frame surface-local coords — the
 * readout shows raw math-frame components without any frame swap.
 */
export function formatGradientLevelsReadout(
  gradient: MathVec3,
): GradientLevelsReadoutStrings {
  const mag = Math.hypot(gradient[0], gradient[1], gradient[2]);
  return {
    components: [
      formatSignedMagnitude(gradient[0]),
      formatSignedMagnitude(gradient[1]),
      formatSignedMagnitude(gradient[2]),
    ],
    magnitude: formatUnsignedMagnitude(mag),
  };
}
