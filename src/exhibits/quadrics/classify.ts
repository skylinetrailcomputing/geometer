// Pure classifier: (a, b, c, d, u, v, w) → family label, per SPEC.md
// "Classification taxonomy".
//
// Sign-flip symmetry — the surface defined by (a, b, c, d) equals the one
// defined by (−a, −b, −c, −d) — is handled by enumerating both halves of
// each flip-pair explicitly in the table below, mirroring SPEC.md.
//
// Linear terms (#85, #88, #94, #96): the implicit equation
//   ax² + by² + cz² + ux + vy + wz = d
// classifies via completing-the-square on every axis where the squared
// coefficient is nonzero. For each such axis,
//   ax² + ux  =  a(x + u/2a)² − u²/4a
// so the linear term folds into a shifted center plus an effective
// constant `d_eff = d + Σ_{nonzero squared axes} linear² / (4·squared)`.
// The original (n+, n−, n₀) signature of the quadratic part is unchanged
// by the shift; only sgn(d_eff) is what the existing taxonomy keys on.
//
// Linear terms on a *zero-coefficient axis* can't be folded away — there's
// no completing-the-square when the squared coefficient is zero. They
// instead introduce new families that aren't in the v0.1 30-entry table:
//   - Rank 2 + zero-axis linear → paraboloid (elliptic if the two nonzero
//     squared signs match, hyperbolic if mixed).
//   - Rank 1 + any zero-axis linear → parabolic cylinder.
//   - Rank 0 + any nonzero linear → plane.
// These four labels are additions in v0.4 alongside the linear-terms
// section.

// Per SPEC.md "Classifier numerical contract". The slider's own zero detent
// (0.05) already snaps to exact zero on emit; this epsilon is defense in
// depth for any non-slider caller (tests, future presets).
const ZERO_EPSILON = 1e-6;

export type Sign = -1 | 0 | 1;

export interface Classification {
  family: string;
}

const TABLE: ReadonlyMap<string, string> = new Map([
  // (n+, n−, n₀) | sgn(d_eff) | Family
  ['3,0,0|1', 'Ellipsoid'],
  ['3,0,0|0', 'Degenerate'],
  ['3,0,0|-1', 'Empty set'],
  ['0,3,0|1', 'Empty set'],
  ['0,3,0|0', 'Degenerate'],
  ['0,3,0|-1', 'Ellipsoid'],
  ['2,1,0|1', 'Hyperboloid (1 sheet)'],
  ['2,1,0|0', 'Cone'],
  ['2,1,0|-1', 'Hyperboloid (2 sheets)'],
  ['1,2,0|1', 'Hyperboloid (2 sheets)'],
  ['1,2,0|0', 'Cone'],
  ['1,2,0|-1', 'Hyperboloid (1 sheet)'],
  ['2,0,1|1', 'Elliptic cylinder'],
  ['2,0,1|0', 'Degenerate'],
  ['2,0,1|-1', 'Empty set'],
  ['0,2,1|1', 'Empty set'],
  ['0,2,1|0', 'Degenerate'],
  ['0,2,1|-1', 'Elliptic cylinder'],
  ['1,1,1|1', 'Hyperbolic cylinder'],
  ['1,1,1|0', 'Pair of intersecting planes'],
  ['1,1,1|-1', 'Hyperbolic cylinder'],
  ['1,0,2|1', 'Pair of parallel planes'],
  // Rank 1 + d_eff = 0 with no zero-axis linear: f reduces to a single
  // squared term shifted by completing the square, vanishing on a single
  // double plane. Was 'Degenerate' (algebraically true — the locus has
  // measure zero in the squared-form sense), but the surface students see
  // is unambiguously a plane, and the prior label hid the family from
  // the readout. Refined in #138 alongside the exhibit-side mesh swap
  // that actually renders this regime — the raymarcher's sign-change
  // hit detection mathematically can't catch a tangent zero, so the
  // pose was previously rendering as stochastic FP noise (cf. #116).
  ['1,0,2|0', 'Double plane'],
  ['1,0,2|-1', 'Empty set'],
  ['0,1,2|1', 'Empty set'],
  ['0,1,2|0', 'Double plane'],
  ['0,1,2|-1', 'Pair of parallel planes'],
  ['0,0,3|1', 'Empty set'],
  ['0,0,3|0', 'Degenerate'],
  ['0,0,3|-1', 'Empty set'],
]);

export function sign(v: number): Sign {
  if (Math.abs(v) < ZERO_EPSILON) return 0;
  return v > 0 ? 1 : -1;
}

export function classify(
  a: number,
  b: number,
  c: number,
  d: number,
  u: number = 0,
  v: number = 0,
  w: number = 0,
): Classification {
  const aS = sign(a);
  const bS = sign(b);
  const cS = sign(c);
  const uS = sign(u);
  const vS = sign(v);
  const wS = sign(w);

  let nPlus = 0;
  let nMinus = 0;
  let nZero = 0;
  for (const s of [aS, bS, cS]) {
    if (s === 1) nPlus++;
    else if (s === -1) nMinus++;
    else nZero++;
  }
  const rank = nPlus + nMinus;

  // Zero-axis linear: a linear coefficient on an axis whose squared
  // coefficient is zero. These can't be folded into d_eff and instead
  // signal a paraboloid / parabolic-cylinder / plane family.
  const zeroAxisLinearNonzero =
    (aS === 0 && uS !== 0) || (bS === 0 && vS !== 0) || (cS === 0 && wS !== 0);

  if (rank === 0) {
    if (uS !== 0 || vS !== 0 || wS !== 0) return { family: 'Plane' };
    // Pure constant equation 0 = d: empty if d ≠ 0, all of ℝ³ if d = 0.
    return { family: lookup(nPlus, nMinus, nZero, sign(d)) };
  }

  if (rank === 2 && zeroAxisLinearNonzero) {
    return {
      family:
        nPlus === 2 || nMinus === 2 ? 'Elliptic paraboloid' : 'Hyperbolic paraboloid',
    };
  }

  if (rank === 1 && zeroAxisLinearNonzero) {
    return { family: 'Parabolic cylinder' };
  }

  // Fall-through: rank 3, or rank-deficient with no zero-axis linear.
  // Compute d_eff by completing the square on every nonzero squared axis.
  // Folding linears into d_eff captures cases the v0.1 table couldn't see —
  // e.g., (1,1,1,0) with u=1 is actually a sphere of radius 1/2 centered
  // at (−1/2, 0, 0), not the single-point degenerate that sgn(d) alone
  // would suggest.
  let dEff = d;
  if (aS !== 0) dEff += (u * u) / (4 * a);
  if (bS !== 0) dEff += (v * v) / (4 * b);
  if (cS !== 0) dEff += (w * w) / (4 * c);

  return { family: lookup(nPlus, nMinus, nZero, sign(dEff)) };
}

function lookup(nPlus: number, nMinus: number, nZero: number, dSign: Sign): string {
  const key = `${nPlus},${nMinus},${nZero}|${dSign}`;
  const family = TABLE.get(key);
  // Unreachable: (n+, n−, n₀) always partitions 3, sgn(d_eff) ∈ {-1, 0, 1};
  // the table enumerates all 10 × 3 = 30 combinations.
  if (!family) throw new Error(`classify: missing taxonomy entry for ${key}`);
  return family;
}

export type MathAxis = 'x' | 'y' | 'z';

export interface PlanePose {
  /** Math-frame axis perpendicular to the plane(s). */
  axis: MathAxis;
  /**
   * Math-frame offsets along `axis`. One entry for the single-plane
   * regimes ('Double plane', 'Plane'); two entries (sorted ascending)
   * for the 'Pair of parallel planes' regime.
   */
  offsets: readonly number[];
}

/**
 * Detect every pose that the marcher renders unreliably as one or two
 * axis-aligned planes and return the math-frame axis + plane offset(s).
 * Returns null on every other pose.
 *
 * Three regimes share the same family of visible artifact (edge-on
 * fuzziness on math-Y at natural Quest viewing pose, cf. #116) and the
 * same fix shape — substitute explicit `PlaneGeometry` meshes for the
 * marcher:
 *
 *  1. **Tangent zero (rank 1, d_eff = 0).** `f` reduces to
 *     `α(p·k − offset)²` for some axis k — non-negative everywhere,
 *     vanishing only on a single double plane. The marcher's
 *     sign-change hit detection mathematically can't catch a tangent
 *     zero, so the surface either fails to render or surfaces as
 *     stochastic FP noise (#116, #138). classify() labels this
 *     'Double plane'. Returned as a single offset.
 *
 *  2. **Edge-on linear (rank 0 + single linear).** `f` reduces to
 *     `λ·k − d` for some axis k — a real sign change, marcher *can*
 *     catch it, but only if a sample on each side lands within the
 *     AABB intersection along that ray. For grazing rays at near-
 *     tangent angles, the crossing falls between discrete sample
 *     steps and adjacent fragments randomly do/don't catch the plane
 *     — the same fuzzy speckle as hypothesis (2) in #116. Math-Y-only
 *     in practice. classify() labels this 'Plane'. Returned as a
 *     single offset.
 *
 *  3. **Pair of parallel planes (rank 1, sgn(d_eff) = sgn(squared
 *     coef)).** `f` reduces to `α((p·k − center)² − r²)` with
 *     `r = √(d_eff / coef)` — two parallel planes at `center ± r`.
 *     The marcher catches whichever plane it hits first along each ray
 *     (always the front one) but the second plane aliases through the
 *     first as parallax-correct fragment-depth noise (#142). classify()
 *     labels this 'Pair of parallel planes'. Returned as two offsets,
 *     sorted ascending.
 *
 * Truly tilted multi-linear cases (rank 0 + ≥ 2 linears) aren't
 * covered yet — they're not edge-on at natural viewing pose, so they
 * don't fuzz, and the orientation math is heavier. Add when a real
 * reproducer surfaces.
 *
 * Mirrors the same `sign(...) → ZERO_EPSILON` floor and the same
 * complete-the-square `d_eff` calculation as classify(), so a positive
 * predicate result and a 'Double plane' / 'Plane' / 'Pair of parallel
 * planes' label always agree (modulo the deferred multi-linear case).
 */
export function getPlanePose(
  a: number,
  b: number,
  c: number,
  d: number,
  u: number = 0,
  v: number = 0,
  w: number = 0,
): PlanePose | null {
  const aS = sign(a);
  const bS = sign(b);
  const cS = sign(c);
  const uS = sign(u);
  const vS = sign(v);
  const wS = sign(w);

  const rank = (aS !== 0 ? 1 : 0) + (bS !== 0 ? 1 : 0) + (cS !== 0 ? 1 : 0);

  // Rank-0 + single linear nonzero: axis-aligned linear plane.
  // Plane equation `λ·axis = d` ⇒ axis = d / λ. Multi-linear (≥ 2 of
  // u, v, w nonzero) intentionally falls through; classify() still
  // labels it 'Plane', but the marcher handles non-edge-on tilted
  // planes adequately and we'd need the more general tilted
  // orientation math to substitute correctly.
  if (rank === 0) {
    const linearCount = (uS !== 0 ? 1 : 0) + (vS !== 0 ? 1 : 0) + (wS !== 0 ? 1 : 0);
    if (linearCount !== 1) return null;
    if (uS !== 0) return { axis: 'x', offsets: [normalizeNegativeZero(d / u)] };
    if (vS !== 0) return { axis: 'y', offsets: [normalizeNegativeZero(d / v)] };
    return { axis: 'z', offsets: [normalizeNegativeZero(d / w)] };
  }

  if (rank !== 1) return null;

  // Rank-1: a linear term on a *zero-squared* axis can't be folded by
  // completing the square; it produces a parabolic cylinder, not a plane.
  // classify() routes those poses out before the d_eff fall-through, and
  // so do we.
  if (aS === 0 && uS !== 0) return null;
  if (bS === 0 && vS !== 0) return null;
  if (cS === 0 && wS !== 0) return null;

  let dEff: number;
  let axis: MathAxis;
  let center: number;
  let coef: number;
  if (aS !== 0) {
    dEff = d + (u * u) / (4 * a);
    axis = 'x';
    center = -u / (2 * a);
    coef = a;
  } else if (bS !== 0) {
    dEff = d + (v * v) / (4 * b);
    axis = 'y';
    center = -v / (2 * b);
    coef = b;
  } else {
    // cS !== 0 by rank check above.
    dEff = d + (w * w) / (4 * c);
    axis = 'z';
    center = -w / (2 * c);
    coef = c;
  }

  // Tangent-zero regime ('Double plane'): single offset at the
  // completing-the-square center. ZERO_EPSILON floor matches classify()'s
  // sgn(d_eff) = 0 dispatch — the same epsilon decides 'Double plane' vs.
  // 'Pair of parallel planes' on either side of the boundary.
  if (Math.abs(dEff) < ZERO_EPSILON) {
    return { axis, offsets: [normalizeNegativeZero(center)] };
  }

  // Pair-of-parallel-planes regime: same-sign d_eff and squared coef.
  // Opposite signs land in 'Empty set' (the lookup table's
  // '1,0,2|-1' / '0,1,2|1' rows) — the marcher renders those correctly
  // (no surface to draw), so no stand-in needed.
  if (sign(dEff) !== sign(coef)) return null;

  const root = Math.sqrt(dEff / coef);
  const offsets = [
    normalizeNegativeZero(center - root),
    normalizeNegativeZero(center + root),
  ];
  return { axis, offsets };
}

// `-u / (2 * a)` and `d / u` emit `-0` whenever the numerator is zero —
// === +0 but not Object.is-equal, which leaks into test assertions and
// any future serialization without changing any behavior that consumes
// the offset numerically.
function normalizeNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}
