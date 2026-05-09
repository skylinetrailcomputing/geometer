import { describe, expect, it } from 'vitest';
import { getPlanePose } from '../../../src/exhibits/quadrics/classify.ts';

describe('getPlanePose — rank-1 + d_eff = 0 (tangent zero)', () => {
  it('a-axis, no linear: returns axis x at offset 0', () => {
    expect(getPlanePose(1, 0, 0, 0, 0, 0, 0)).toEqual({ axis: 'x', offsets: [0] });
  });

  it('b-axis, no linear: returns axis y at offset 0', () => {
    expect(getPlanePose(0, 1, 0, 0, 0, 0, 0)).toEqual({ axis: 'y', offsets: [0] });
  });

  it('c-axis, no linear: returns axis z at offset 0', () => {
    expect(getPlanePose(0, 0, 1, 0, 0, 0, 0)).toEqual({ axis: 'z', offsets: [0] });
  });

  it('a-axis, negative coef: still axis x at offset 0', () => {
    expect(getPlanePose(-1, 0, 0, 0, 0, 0, 0)).toEqual({ axis: 'x', offsets: [0] });
  });

  it('a-axis with linear shift: x² + x − (−¼) = (x + ½)² ⇒ offset −½', () => {
    expect(getPlanePose(1, 0, 0, -0.25, 1, 0, 0)).toEqual({
      axis: 'x',
      offsets: [-0.5],
    });
  });

  it('b-axis with linear shift: offset −½', () => {
    expect(getPlanePose(0, 1, 0, -0.25, 0, 1, 0)).toEqual({
      axis: 'y',
      offsets: [-0.5],
    });
  });

  it('c-axis with linear shift: offset −½', () => {
    expect(getPlanePose(0, 0, 1, -0.25, 0, 0, 1)).toEqual({
      axis: 'z',
      offsets: [-0.5],
    });
  });

  it('negative coef + linear shift: a = −1, u = 1, d = ¼ ⇒ offset +½', () => {
    // f = −x² + x − ¼ = −(x − ½)². Zero only at x = ½.
    expect(getPlanePose(-1, 0, 0, 0.25, 1, 0, 0)).toEqual({
      axis: 'x',
      offsets: [0.5],
    });
  });
});

describe('getPlanePose — rank-1 + d_eff > 0 (pair of parallel planes)', () => {
  // The third regime of the math-Y edge-on aliasing family (#142). The
  // marcher catches the front plane cleanly via first-sign-change but
  // the back plane aliases through it as fragment-depth noise. Same fix
  // as the first two regimes — substitute explicit PlaneGeometry meshes
  // — just two of them instead of one. Acceptance criterion in #142
  // calls for parity across all three axes (x, y, z).
  it('a-axis: f = x² − 1 ⇒ planes at x = ±1', () => {
    expect(getPlanePose(1, 0, 0, 1, 0, 0, 0)).toEqual({
      axis: 'x',
      offsets: [-1, 1],
    });
  });

  it('b-axis: f = y² − 1 ⇒ planes at y = ±1 (the actual #142 reproducer family)', () => {
    expect(getPlanePose(0, 1, 0, 1, 0, 0, 0)).toEqual({
      axis: 'y',
      offsets: [-1, 1],
    });
  });

  it('c-axis: f = z² − 1 ⇒ planes at z = ±1', () => {
    expect(getPlanePose(0, 0, 1, 1, 0, 0, 0)).toEqual({
      axis: 'z',
      offsets: [-1, 1],
    });
  });

  it('negative coef + d: f = −y² − (−1) = −(y² − 1) ⇒ planes at y = ±1', () => {
    // classify() table row '0,1,2|-1' = 'Pair of parallel planes'.
    expect(getPlanePose(0, -1, 0, -1, 0, 0, 0)).toEqual({
      axis: 'y',
      offsets: [-1, 1],
    });
  });

  it('b-axis with linear shift: y² + v·y = 0 ⇒ y(y + v) = 0 (the #142 slider pose)', () => {
    // a=0, b=1, c=0, d=0, v=1 ⇒ d_eff = v²/(4b) = 0.25, center = -v/(2b) = -0.5,
    // root = √(d_eff / b) = 0.5. Planes at -0.5 ± 0.5 = {-1, 0}.
    expect(getPlanePose(0, 1, 0, 0, 0, 1, 0)).toEqual({
      axis: 'y',
      offsets: [-1, 0],
    });
  });

  it('a-axis at d = 4: planes at x = ±2 (slider extremes)', () => {
    expect(getPlanePose(1, 0, 0, 4, 0, 0, 0)).toEqual({
      axis: 'x',
      offsets: [-2, 2],
    });
  });
});

describe('getPlanePose — rank-0 + single linear (edge-on aliasing)', () => {
  // The other half of #138's scope: rank-0 with exactly one linear
  // term nonzero. classify() labels these 'Plane' (not 'Double plane'),
  // but the marcher's edge-on aliasing artifact is identical in
  // appearance to the tangent-zero case for the math-Y axis at natural
  // Quest viewing pose, so both regimes share this dispatch.
  it('u-only: math-X plane at d/u', () => {
    expect(getPlanePose(0, 0, 0, 1, 2, 0, 0)).toEqual({
      axis: 'x',
      offsets: [0.5],
    });
  });

  it('v-only: math-Y plane at d/v (the actual fuzzy reproducer)', () => {
    expect(getPlanePose(0, 0, 0, 0, 0, 1, 0)).toEqual({
      axis: 'y',
      offsets: [0],
    });
  });

  it('w-only: math-Z plane at d/w', () => {
    expect(getPlanePose(0, 0, 0, -1, 0, 0, 2)).toEqual({
      axis: 'z',
      offsets: [-0.5],
    });
  });

  it('v-only, negative coef: still axis y, offset = d/v with sign', () => {
    // f = −y − 1 = 0 ⇒ y = −1.
    expect(getPlanePose(0, 0, 0, 1, 0, -1, 0)).toEqual({
      axis: 'y',
      offsets: [-1],
    });
  });
});

describe('getPlanePose — negative cases', () => {
  it('rank 0, all linear zero: returns null (Empty set / Degenerate, not a plane)', () => {
    expect(getPlanePose(0, 0, 0, 0, 0, 0, 0)).toBeNull();
    expect(getPlanePose(0, 0, 0, 1, 0, 0, 0)).toBeNull();
  });

  it('rank 0 with two linears nonzero: tilted plane, not yet handled', () => {
    // Truly tilted plane — orientation math is heavier and the artifact
    // is rare at natural viewing pose, so deferred. classify() still
    // labels it 'Plane'.
    expect(getPlanePose(0, 0, 0, 0, 1, 1, 0)).toBeNull();
    expect(getPlanePose(0, 0, 0, 0, 1, 1, 1)).toBeNull();
  });

  it('rank 2: returns null (an ellipsoid / hyperboloid / cone family)', () => {
    expect(getPlanePose(1, 1, 0, 0, 0, 0, 0)).toBeNull();
  });

  it('rank 3: returns null', () => {
    expect(getPlanePose(1, 1, 1, 0, 0, 0, 0)).toBeNull();
  });

  it('rank 1 with d_eff < 0 (opposite sign from coef): empty set', () => {
    // Empty set in classify (table row '1,0,2|-1'); marcher correctly
    // renders nothing, so the predicate skips it. Same row applies for
    // a < 0, d > 0 (table row '0,1,2|1') by sign-flip symmetry.
    expect(getPlanePose(1, 0, 0, -1, 0, 0, 0)).toBeNull();
    expect(getPlanePose(-1, 0, 0, 1, 0, 0, 0)).toBeNull();
  });

  it('rank 1 with linear on a zero-squared axis: parabolic cylinder', () => {
    expect(getPlanePose(1, 0, 0, 0, 0, 1, 0)).toBeNull();
    expect(getPlanePose(1, 0, 0, 0, 0, 0, 1)).toBeNull();
    expect(getPlanePose(0, 1, 0, 0, 1, 0, 0)).toBeNull();
  });
});

describe('getPlanePose — agrees with classify()', () => {
  // For every pose the predicate fires on, classify() must label the
  // pose 'Double plane' (rank-1, d_eff = 0), 'Plane' (rank-0 single-
  // linear), or 'Pair of parallel planes' (rank-1, sgn(d_eff) =
  // sgn(coef)). The exhibit reads the predicate to decide rendering
  // and the classifier reads independent logic to label the readout,
  // so a divergence would show up to the user as "the readout says X
  // but the surface looks like Y."
  const positiveCases = [
    [1, 0, 0, 0, 0, 0, 0],
    [-1, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0],
    [0, -1, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0],
    [0, 0, -1, 0, 0, 0, 0],
    [1, 0, 0, -0.25, 1, 0, 0],
    [0, 1, 0, -0.25, 0, 1, 0],
    [0, 0, 1, -0.25, 0, 0, 1],
    // Rank-0 single-linear cases.
    [0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0, 1, 0],
    [0, 0, 0, -1, 0, 0, 1],
    // Pair-of-parallel-planes cases (#142).
    [1, 0, 0, 1, 0, 0, 0],
    [0, 1, 0, 1, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 0],
    [0, -1, 0, -1, 0, 0, 0],
    [0, 1, 0, 0, 0, 1, 0],
  ] as const;

  const negativeCases = [
    [1, 1, 1, 1, 0, 0, 0],
    [1, 0, 0, -1, 0, 0, 0],
    [1, 0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
    // Multi-linear is a tilted plane the predicate doesn't yet handle,
    // but classify() labels it 'Plane'. This is a deliberate divergence
    // (the predicate only handles axis-aligned cases) tracked here so
    // the test fails the day someone extends the predicate without
    // updating this list.
    [0, 0, 0, 0, 1, 1, 0],
  ] as const;

  for (const [a, b, c, d, u, v, w] of positiveCases) {
    it(`positive: (${a}, ${b}, ${c}, ${d}, ${u}, ${v}, ${w})`, async () => {
      const { classify } = await import('../../../src/exhibits/quadrics/classify.ts');
      const family = classify(a, b, c, d, u, v, w).family;
      const pose = getPlanePose(a, b, c, d, u, v, w);
      expect(pose).not.toBeNull();
      expect(['Double plane', 'Plane', 'Pair of parallel planes']).toContain(family);
    });
  }

  for (const [a, b, c, d, u, v, w] of negativeCases) {
    it(`negative: (${a}, ${b}, ${c}, ${d}, ${u}, ${v}, ${w})`, () => {
      expect(getPlanePose(a, b, c, d, u, v, w)).toBeNull();
    });
  }
});
