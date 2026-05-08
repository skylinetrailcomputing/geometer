import { describe, expect, it } from 'vitest';
import { isDoublePlane } from '../../../src/exhibits/quadrics/classify.ts';

describe('isDoublePlane — positive cases (rank 1, d_eff = 0)', () => {
  it('a-axis, no linear: returns axis x at offset 0', () => {
    expect(isDoublePlane(1, 0, 0, 0, 0, 0, 0)).toEqual({ axis: 'x', offset: 0 });
  });

  it('b-axis, no linear: returns axis y at offset 0', () => {
    expect(isDoublePlane(0, 1, 0, 0, 0, 0, 0)).toEqual({ axis: 'y', offset: 0 });
  });

  it('c-axis, no linear: returns axis z at offset 0', () => {
    expect(isDoublePlane(0, 0, 1, 0, 0, 0, 0)).toEqual({ axis: 'z', offset: 0 });
  });

  it('a-axis, negative coef: still axis x at offset 0', () => {
    expect(isDoublePlane(-1, 0, 0, 0, 0, 0, 0)).toEqual({ axis: 'x', offset: 0 });
  });

  it('a-axis with linear shift: x² + x − (−¼) = (x + ½)² ⇒ offset −½', () => {
    expect(isDoublePlane(1, 0, 0, -0.25, 1, 0, 0)).toEqual({
      axis: 'x',
      offset: -0.5,
    });
  });

  it('b-axis with linear shift: offset −½', () => {
    expect(isDoublePlane(0, 1, 0, -0.25, 0, 1, 0)).toEqual({
      axis: 'y',
      offset: -0.5,
    });
  });

  it('c-axis with linear shift: offset −½', () => {
    expect(isDoublePlane(0, 0, 1, -0.25, 0, 0, 1)).toEqual({
      axis: 'z',
      offset: -0.5,
    });
  });

  it('negative coef + linear shift: a = −1, u = 1, d = ¼ ⇒ offset +½', () => {
    // f = −x² + x − ¼ = −(x − ½)². Zero only at x = ½.
    expect(isDoublePlane(-1, 0, 0, 0.25, 1, 0, 0)).toEqual({
      axis: 'x',
      offset: 0.5,
    });
  });
});

describe('isDoublePlane — negative cases (other regimes)', () => {
  it('rank 0: returns null', () => {
    expect(isDoublePlane(0, 0, 0, 0, 0, 0, 0)).toBeNull();
  });

  it('rank 2: returns null (an ellipsoid / hyperboloid / cone family, not a plane)', () => {
    expect(isDoublePlane(1, 1, 0, 0, 0, 0, 0)).toBeNull();
  });

  it('rank 3: returns null', () => {
    expect(isDoublePlane(1, 1, 1, 0, 0, 0, 0)).toBeNull();
  });

  it('rank 1 with d_eff > 0: pair of parallel planes, not double', () => {
    expect(isDoublePlane(1, 0, 0, 1, 0, 0, 0)).toBeNull();
  });

  it('rank 1 with d_eff < 0: empty set', () => {
    expect(isDoublePlane(1, 0, 0, -1, 0, 0, 0)).toBeNull();
  });

  it('rank 1 with linear on a zero-squared axis: parabolic cylinder, not plane', () => {
    expect(isDoublePlane(1, 0, 0, 0, 0, 1, 0)).toBeNull();
    expect(isDoublePlane(1, 0, 0, 0, 0, 0, 1)).toBeNull();
    expect(isDoublePlane(0, 1, 0, 0, 1, 0, 0)).toBeNull();
  });

  it('rank 1 with d_eff just past the zero-floor: not detected', () => {
    // ZERO_EPSILON is 1e-6 in classify; |d_eff| = 1e-3 is well outside.
    expect(isDoublePlane(1, 0, 0, 1e-3, 0, 0, 0)).toBeNull();
  });
});

describe('isDoublePlane — agrees with classify()', () => {
  // Every pose that classify labels 'Double plane' must yield a non-null
  // predicate, and vice versa. This is the load-bearing invariant: the
  // exhibit reads the predicate to decide rendering, and the classifier
  // reads independent logic to label the readout, so a divergence would
  // show up to the user as "the readout says X but the surface looks
  // like Y."
  const cases = [
    [1, 0, 0, 0, 0, 0, 0],
    [-1, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0],
    [1, 0, 0, -0.25, 1, 0, 0],
    [0, 1, 0, -0.25, 0, 1, 0],
    [0, 0, 1, -0.25, 0, 0, 1],
    // Negative cases.
    [1, 1, 1, 1, 0, 0, 0],
    [1, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ] as const;

  for (const [a, b, c, d, u, v, w] of cases) {
    it(`(${a}, ${b}, ${c}, ${d}, ${u}, ${v}, ${w})`, async () => {
      const { classify } = await import('../../../src/exhibits/quadrics/classify.ts');
      const family = classify(a, b, c, d, u, v, w).family;
      const pose = isDoublePlane(a, b, c, d, u, v, w);
      expect(family === 'Double plane').toBe(pose !== null);
    });
  }
});
