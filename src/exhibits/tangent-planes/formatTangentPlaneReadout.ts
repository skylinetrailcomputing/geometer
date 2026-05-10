import type { MathVec3 } from '@/scaffold/math/frames';
import { formatSignedMagnitude } from '@/scaffold/ui/formatSignedMagnitude';

// Pure formatter for the tangent-planes readout (#149). Given a
// surface-local point and its outward unit normal, produce the nine
// numeric-slot strings that the readout's troika-Text instances render.
//
// Lives in its own file so test/exhibits/tangent-planes/* can import it
// without triggering `index.ts`'s `registerExhibit` side effect at
// unit-test import time — same isolation pattern as
// `directionFromAngles.ts`, `raycastSurface.ts`, `poseTangentPlaneMesh.ts`.
//
// `formatSignedMagnitude` lifted to scaffold on third use (#166); the
// local `formatInvertedSignedMagnitude` stays here — only one call site,
// extraction trigger hasn't fired.

const MINUS = '−'; // U+2212
const PLUS = '+';

/**
 * Sign + 2-decimal magnitude with the sign of `−v` (i.e. the sign of the
 * constant in `(x − x₀)` after expanding). The pedagogical readable form
 * for the top-line plane equation is `(x − 0.42)` when `x₀ = +0.42`, and
 * `(x + 0.42)` when `x₀ = −0.42`. Exact zero renders as `−0.00` —
 * deliberate, so the equation reads as the textbook identity form
 * `(x − x₀)` even when `x₀` is at a snap-to-zero pole.
 */
function formatInvertedSignedMagnitude(v: number): string {
  const sign = v < 0 ? PLUS : MINUS;
  return `${sign}${Math.abs(v).toFixed(2)}`;
}

export interface TangentPlaneReadoutStrings {
  /**
   * Top-line normal coefficients (one per axis), in math reading order
   * `[n_x, n_y, n_z]`. Each is a `±N.NN` signed-magnitude string.
   */
  topNormals: readonly [string, string, string];
  /**
   * Top-line point-offset constants (one per axis), in math reading order
   * `[−x₀, −y₀, −z₀]`. Each is a `±N.NN` string with the sign of the
   * negated coordinate — so `x₀ = +0.42` yields `−0.42`, displayed inside
   * the equation as `(x − 0.42)`.
   */
  topPoints: readonly [string, string, string];
  /**
   * Bottom-line normal-vector components, in math reading order
   * `[n_x, n_y, n_z]`. Each is a `±N.NN` signed-magnitude string. Same
   * source values as `topNormals`; the readout writes both because the
   * top and bottom lines hold geometrically-independent Text instances.
   */
  bottomNormals: readonly [string, string, string];
}

/**
 * Format the nine numeric strings the readout displays from the per-frame
 * raymarch result. Pure; allocates one fresh struct per call. Allocation
 * cost is bounded by the readout's update throttle (≈30 Hz), so the
 * per-frame call rate stays under 30 allocations/second.
 *
 * The point and normal are surface-local math-frame; the readout shows
 * raw surface-local components without any frame swap (the textbook
 * §11.4 form is in math coordinates, not Three.js world coordinates).
 */
export function formatTangentPlaneReadout(
  point: MathVec3,
  normal: MathVec3,
): TangentPlaneReadoutStrings {
  return {
    topNormals: [
      formatSignedMagnitude(normal[0]),
      formatSignedMagnitude(normal[1]),
      formatSignedMagnitude(normal[2]),
    ],
    topPoints: [
      formatInvertedSignedMagnitude(point[0]),
      formatInvertedSignedMagnitude(point[1]),
      formatInvertedSignedMagnitude(point[2]),
    ],
    bottomNormals: [
      formatSignedMagnitude(normal[0]),
      formatSignedMagnitude(normal[1]),
      formatSignedMagnitude(normal[2]),
    ],
  };
}
