import { formatSignedMagnitude } from '@/scaffold/ui/formatSignedMagnitude';
import type { Hessian } from './presets';

// Pure formatter for the saddle-extrema classification readout (#181).
// Given the symmetric Hessian entries `(f_xx, f_xy, f_yy)` at the
// selected point, produce the strings the readout's troika-Text slots
// render plus the classification verdict from the second-derivative
// test.
//
// Sibling of `gradient-levels/formatGradientLevelsReadout.ts` —
// lives in its own file so `test/exhibits/saddle-extrema/*` can import
// without triggering `index.ts`'s `registerExhibit` side effect at
// unit-test import time. Same isolation pattern as `GraphSurface.ts` and
// the gradient-levels formatters.
//
// Strictly, the second-derivative test classifies *critical* points;
// at a non-critical point the linear term dominates and the verdict
// "local min / saddle / ..." isn't a well-formed claim about the
// surface there. The readout displays the Hessian-based verdict at
// whatever (x, y) is selected anyway — pedagogically this is "what
// *would* the local shape be IF this were a critical point," and
// it parallels the always-on local-quadratic overlay (#180) which
// renders the second-order Taylor approximation regardless of
// criticality. The interpretation that the verdict only *applies* at
// a critical point belongs in the SPEC, not in this formatter.

/** Inconclusive band for the second-derivative test. */
const DEFAULT_INCONCLUSIVE_EPS = 1e-9;

/**
 * Classification verdict from the second-derivative test (§11.7–11.8).
 * Lowercase phrasing matches the cluster's tone (verdict reads as a
 * text label, not a heading).
 */
export type SaddleExtremaVerdict =
  | 'local min'
  | 'local max'
  | 'saddle'
  | 'inconclusive';

export interface SaddleExtremaReadoutStrings {
  /** Hessian entries [f_xx, f_xy, f_yy], each signed-magnitude 2-decimal. */
  readonly hessianEntries: readonly [string, string, string];
  /** `D = f_xx · f_yy − f_xy²`, signed-magnitude 2-decimal. */
  readonly determinant: string;
  /** Classification verdict text — drives the bottom-line readout slot. */
  readonly verdict: SaddleExtremaVerdict;
}

/**
 * Classify the critical-point archetype from a 2×2 symmetric Hessian.
 *
 * - `D > 0` and `f_xx > 0` ⇒ local min.
 * - `D > 0` and `f_xx < 0` ⇒ local max.
 * - `D < 0` ⇒ saddle.
 * - `|D| < eps` ⇒ inconclusive (second-derivative test fails;
 *   higher-order terms determine the local shape — the §11.7–11.8
 *   stuck-point that the preset library's monkey saddle and `x⁴+y⁴`
 *   were chosen to surface).
 *
 * Edge case `D > 0` with `f_xx === 0`: impossible — if `f_xx = 0` then
 * `D = -f_xy² ≤ 0`, contradicting `D > 0`. The branch is unreachable
 * and intentionally not coded for.
 */
export function classifySaddleExtrema(
  hessian: Hessian,
  eps: number = DEFAULT_INCONCLUSIVE_EPS,
): SaddleExtremaVerdict {
  const [fxx, fxy, fyy] = hessian;
  const D = fxx * fyy - fxy * fxy;
  if (Math.abs(D) < eps) return 'inconclusive';
  if (D < 0) return 'saddle';
  return fxx > 0 ? 'local min' : 'local max';
}

/**
 * Format the readout strings from a 2×2 symmetric Hessian. Pure;
 * allocates one fresh struct per call. The readout throttles
 * `setValues()` to ≈30 Hz so allocation rate stays bounded.
 *
 * Both the entries and `D` use `formatSignedMagnitude` (`±N.NN` with
 * U+2212 minus) for visual consistency with the cluster's other
 * readouts — gradient-levels' components, tangent-planes' normal
 * components, the equation-readout coefficients.
 */
export function formatSaddleExtremaReadout(
  hessian: Hessian,
  eps: number = DEFAULT_INCONCLUSIVE_EPS,
): SaddleExtremaReadoutStrings {
  const [fxx, fxy, fyy] = hessian;
  const D = fxx * fyy - fxy * fxy;
  return {
    hessianEntries: [
      formatSignedMagnitude(fxx),
      formatSignedMagnitude(fxy),
      formatSignedMagnitude(fyy),
    ],
    determinant: formatSignedMagnitude(D),
    verdict: classifySaddleExtrema(hessian, eps),
  };
}
