import { describe, expect, it } from 'vitest';
import { classify } from '../../../src/exhibits/quadrics/classify.ts';

// Each row: [a, b, c, d, u, v, w, expectedFamily, comment?].
// Math-frame: a/u pair on the X axis, b/v on Y, c/w on Z.
type Row = [number, number, number, number, number, number, number, string, string?];

function check(rows: Row[]) {
  for (const [a, b, c, d, u, v, w, expected, comment] of rows) {
    const label = comment ? `${comment}: ` : '';
    it(`${label}classify(${a}, ${b}, ${c}, ${d}, ${u}, ${v}, ${w}) → ${expected}`, () => {
      expect(classify(a, b, c, d, u, v, w).family).toBe(expected);
    });
  }
}

describe('classify — #96 explicit acceptance', () => {
  check([
    [1, 1, 0, 0, 0, 0, 1, 'Elliptic paraboloid'],
    [1, -1, 0, 0, 0, 0, 1, 'Hyperbolic paraboloid'],
    [1, 0, 0, 0, 0, 0, 1, 'Parabolic cylinder'],
    [0, 0, 0, 0, 1, 0, 0, 'Plane', 'u-only'],
    [0, 0, 0, 0, 0, 1, 0, 'Plane', 'v-only'],
    [0, 0, 0, 0, 0, 0, 1, 'Plane', 'w-only'],
  ]);
});

describe('classify — sign / axis variants on rank-deficient cases', () => {
  check([
    // Sign-flipped rank-2: both negative still match → elliptic paraboloid.
    [-1, -1, 0, 0, 0, 0, 1, 'Elliptic paraboloid', 'both squared signs negative'],
    [-1, 1, 0, 0, 0, 0, 1, 'Hyperbolic paraboloid', 'mixed signs, w on zero-axis'],
    // Zero-axis is b (not c), v carries the linear.
    [1, 0, 1, 0, 0, 1, 0, 'Elliptic paraboloid', 'zero-axis = b, v ≠ 0'],
    // Rank-1 with linear on a different zero-axis than the nonzero squared.
    [0, 1, 0, 0, 1, 0, 0, 'Parabolic cylinder', 'a-axis zero, u ≠ 0'],
    [0, 0, 1, 0, 1, 0, 0, 'Parabolic cylinder', 'a- and b-axes zero, u ≠ 0'],
  ]);
});

describe('classify — v0.1 regression (linear terms = 0)', () => {
  check([
    [1, 1, 1, 1, 0, 0, 0, 'Ellipsoid'],
    [1, 1, 1, 0, 0, 0, 0, 'Degenerate'],
    [1, 1, 1, -1, 0, 0, 0, 'Empty set'],
    [1, 1, -1, 1, 0, 0, 0, 'Hyperboloid (1 sheet)'],
    [1, 1, -1, 0, 0, 0, 0, 'Cone'],
    [1, 1, -1, -1, 0, 0, 0, 'Hyperboloid (2 sheets)'],
    [1, 1, 0, 1, 0, 0, 0, 'Elliptic cylinder'],
    [1, -1, 0, 0, 0, 0, 0, 'Pair of intersecting planes'],
    [1, 0, 0, 1, 0, 0, 0, 'Pair of parallel planes'],
    [0, 0, 0, 0, 0, 0, 0, 'Degenerate', 'all zeros = all of ℝ³'],
  ]);
});

describe('classify — Double plane (#138, rank 1 + d_eff = 0, no zero-axis linear)', () => {
  check([
    // Pure tangent-zero poses on each math axis, no linear term. These
    // are the exact poses #116 reported as fuzzy edge-on noise — the
    // raymarcher couldn't catch the tangent zero and the readout only
    // had 'Degenerate' to describe what the user was seeing.
    [1, 0, 0, 0, 0, 0, 0, 'Double plane', 'a-axis, no shift'],
    [0, 1, 0, 0, 0, 0, 0, 'Double plane', 'b-axis, no shift'],
    [0, 0, 1, 0, 0, 0, 0, 'Double plane', 'c-axis, no shift'],
    // Sign-flipped halves of each pair (negative squared coef, d = 0).
    [-1, 0, 0, 0, 0, 0, 0, 'Double plane', 'a-axis, negative coef'],
    [0, -1, 0, 0, 0, 0, 0, 'Double plane', 'b-axis, negative coef'],
    [0, 0, -1, 0, 0, 0, 0, 'Double plane', 'c-axis, negative coef'],
    // Linear term on the *nonzero-squared* axis, with d chosen so
    // completing-the-square lands d_eff exactly at zero. e.g. on a:
    //   x² + x − (−¼) = (x + ½)²  ⇒  zero only at x = −½.
    [1, 0, 0, -0.25, 1, 0, 0, 'Double plane', 'a-axis, shifted'],
    [0, 1, 0, -0.25, 0, 1, 0, 'Double plane', 'b-axis, shifted'],
    [0, 0, 1, -0.25, 0, 0, 1, 'Double plane', 'c-axis, shifted'],
    // Boundary: d_eff slightly off zero is *not* a double plane — it's
    // a Pair of parallel planes (positive d_eff) or Empty set (negative).
    [1, 0, 0, 0.01, 0, 0, 0, 'Pair of parallel planes', 'd_eff > 0 — two planes'],
    [1, 0, 0, -0.01, 0, 0, 0, 'Empty set', 'd_eff < 0 — no real solutions'],
  ]);
});

describe('classify — rank-3 d_eff via completing-the-square (#97 scope expansion)', () => {
  // (1, 1, 1, 0) with u = 1: x² + y² + z² + x = 0 ⇔ (x + ½)² + y² + z² = ¼
  // → sphere of radius ½ centered at (−½, 0, 0). Was "Degenerate" pre-#97.
  check([
    [1, 1, 1, 0, 1, 0, 0, 'Ellipsoid', 'sphere recovered from translated origin'],
    [1, 1, 1, 1, 1, 0, 0, 'Ellipsoid', 'd > 0 stays positive after shift'],
    [1, 1, 1, -0.1, 1, 0, 0, 'Ellipsoid', 'small-negative d crosses to + via u² term'],
  ]);
});

describe('classify — rank-deficient fall-through (zero-axis linear = 0, non-zero-axis linear shifts d_eff)', () => {
  check([
    // (1, 1, 0, 0) with u = 1, w = 0:
    // x² + x + y² = 0 ⇔ (x + ½)² + y² = ¼ → elliptic cylinder.
    [1, 1, 0, 0, 1, 0, 0, 'Elliptic cylinder', 'rank-2 fall-through, d_eff > 0'],
    // (1, 0, 0, 0) with u = 1, v = w = 0:
    // x² + x = 0 ⇔ x(x + 1) = 0 → two parallel planes (x = 0, x = −1).
    [1, 0, 0, 0, 1, 0, 0, 'Pair of parallel planes', 'rank-1 fall-through, d_eff > 0'],
    // Rank 1, linear on a zero-axis (not the nonzero squared axis).
    [1, 0, 0, 0, 0, 1, 0, 'Parabolic cylinder', 'rank 1, v on zero-axis b'],
  ]);
});
