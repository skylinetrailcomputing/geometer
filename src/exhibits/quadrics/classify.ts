// Pure classifier: (a, b, c, d) → family label, per SPEC.md "Classification taxonomy".
//
// Sign-flip symmetry — the surface defined by (a, b, c, d) equals the one
// defined by (−a, −b, −c, −d) — is handled by enumerating both halves of
// each flip-pair explicitly in the table below, mirroring SPEC.md.
//
// Linear-term invariance (#85, #88): the family is determined by the
// quadratic part alone — adding `+ ux + vy + wz` to the implicit equation
// translates the surface's center but doesn't cross any taxonomy boundary
// (completing the square folds (u, v, w) into a shifted center while
// leaving the diagonal-quadratic signature untouched). So the linear-terms
// section deliberately skips re-classifying — the rack readout stays
// stable as the user sweeps u/v/w, and the user *sees* the location change
// directly in the surface.

// Per SPEC.md "Classifier numerical contract". The slider's own zero detent
// (0.05) already snaps to exact zero on emit; this epsilon is defense in
// depth for any non-slider caller (tests, future presets).
const ZERO_EPSILON = 1e-6;

export type Sign = -1 | 0 | 1;

export interface Classification {
  family: string;
}

const TABLE: ReadonlyMap<string, string> = new Map([
  // (n+, n−, n₀) | sgn(d) | Family
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
  ['1,0,2|0', 'Degenerate'],
  ['1,0,2|-1', 'Empty set'],
  ['0,1,2|1', 'Empty set'],
  ['0,1,2|0', 'Degenerate'],
  ['0,1,2|-1', 'Pair of parallel planes'],
  ['0,0,3|1', 'Empty set'],
  ['0,0,3|0', 'Degenerate'],
  ['0,0,3|-1', 'Empty set'],
]);

export function sign(v: number): Sign {
  if (Math.abs(v) < ZERO_EPSILON) return 0;
  return v > 0 ? 1 : -1;
}

export function classify(a: number, b: number, c: number, d: number): Classification {
  const signs = [sign(a), sign(b), sign(c)];
  let nPlus = 0;
  let nMinus = 0;
  let nZero = 0;
  for (const s of signs) {
    if (s === 1) nPlus++;
    else if (s === -1) nMinus++;
    else nZero++;
  }
  const key = `${nPlus},${nMinus},${nZero}|${sign(d)}`;
  const family = TABLE.get(key);
  // Unreachable: (n+, n−, n₀) always partitions 3, sgn(d) ∈ {-1, 0, 1};
  // the table enumerates all 10 × 3 = 30 combinations.
  if (!family) throw new Error(`classify: missing taxonomy entry for ${key}`);
  return { family };
}
