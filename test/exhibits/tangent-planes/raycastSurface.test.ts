import { describe, expect, it } from 'vitest';
import {
  raycastImplicit,
  type RaycastResult,
} from '../../../src/exhibits/tangent-planes/raycastSurface.ts';
import type { MathVec3 } from '../../../src/scaffold/math/frames.ts';

// Unit-sphere test surface: f = x² + y² + z² − 1, ∇f = (2x, 2y, 2z).
const sphereF = (x: number, y: number, z: number): number =>
  x * x + y * y + z * z - 1;
const sphereGradF = (x: number, y: number, z: number): MathVec3 => [
  2 * x,
  2 * y,
  2 * z,
];

// 2-sheet hyperboloid: f = x² − y² − z² − 1, ∇f = (2x, −2y, −2z).
// Sheets at x = ±√(1 + y² + z²); the y-axis passes through the gap.
const twoSheetF = (x: number, y: number, z: number): number =>
  x * x - y * y - z * z - 1;
const twoSheetGradF = (x: number, y: number, z: number): MathVec3 => [
  2 * x,
  -2 * y,
  -2 * z,
];

const SPHERE_BOUND = 1.5;

function expectHit(r: RaycastResult): asserts r is Extract<RaycastResult, { hit: true }> {
  expect(r.hit).toBe(true);
}

function expectClose(
  v: MathVec3,
  expected: readonly [number, number, number],
  tol = 1e-2,
) {
  expect(v[0]).toBeCloseTo(expected[0], -Math.log10(tol));
  expect(v[1]).toBeCloseTo(expected[1], -Math.log10(tol));
  expect(v[2]).toBeCloseTo(expected[2], -Math.log10(tol));
}

describe('raycastImplicit — forward-only domain (GPT #1 / HIGH from v1 plan-review)', () => {
  // The bug guarded against here: with origin at [0,0,0] inside the unit
  // sphere's AABB and `+x` direction, a march from `tNear = -1.5` finds
  // the back-side sign change at `t ≈ -1` first and would return
  // `[-1, 0, 0]`. The `t0 = max(tNear, 0)` clamp gives `[+1, 0, 0]`.
  it('+X direction returns +X-side hit, not −X', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [1, 0, 0],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expectClose(r.point, [1, 0, 0]);
  });

  it('−X direction returns −X-side hit, not +X', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [-1, 0, 0],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expectClose(r.point, [-1, 0, 0]);
  });

  it('+Y direction returns +Y-side hit', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [0, 1, 0],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expectClose(r.point, [0, 1, 0]);
  });

  it('−Y direction returns −Y-side hit', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [0, -1, 0],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expectClose(r.point, [0, -1, 0]);
  });

  it('+Z direction returns +Z-side hit', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [0, 0, 1],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expectClose(r.point, [0, 0, 1]);
  });

  it('−Z direction returns −Z-side hit', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [0, 0, -1],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expectClose(r.point, [0, 0, -1]);
  });
});

describe('raycastImplicit — outward unit normal', () => {
  // For the unit sphere, `gradF(p) = 2p`, so `normalize(gradF(p)) = p`
  // when `|p| = 1`. The hit point at distance 1 should equal its normal.
  it.each([
    ['+X', [1, 0, 0]],
    ['+Y', [0, 1, 0]],
    ['+Z', [0, 0, 1]],
    ['−X', [-1, 0, 0]],
    ['−Y', [0, -1, 0]],
    ['−Z', [0, 0, -1]],
  ] as const)('cardinal %s: normal ≈ point', (_label, dir) => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: dir as MathVec3,
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expect(r.normal[0]).toBeCloseTo(r.point[0], 3);
    expect(r.normal[1]).toBeCloseTo(r.point[1], 3);
    expect(r.normal[2]).toBeCloseTo(r.point[2], 3);
    // Normal must be unit-length.
    const nLen = Math.hypot(r.normal[0], r.normal[1], r.normal[2]);
    expect(nLen).toBeCloseTo(1);
  });

  it('off-axis [1,1,1]/√3 direction hits at the same diagonal point', () => {
    const inv = 1 / Math.sqrt(3);
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [inv, inv, inv],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expectClose(r.point, [inv, inv, inv]);
    expectClose(r.normal, [inv, inv, inv], 1e-3);
  });
});

describe('raycastImplicit — miss cases', () => {
  it('2-sheet hyperboloid, +Y from origin: misses through the gap', () => {
    const r = raycastImplicit({
      f: twoSheetF,
      gradF: twoSheetGradF,
      origin: [0, 0, 0],
      dir: [0, 1, 0],
      bound: 3,
    });
    expect(r.hit).toBe(false);
  });

  it('AABB miss: origin outside, ray pointing away', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [10, 0, 0],
      dir: [1, 0, 0],
      bound: SPHERE_BOUND,
    });
    expect(r.hit).toBe(false);
  });

  it('tFar < 0: origin past the AABB on the +X side, ray pointing further +X', () => {
    // Origin at +5 in X, AABB ends at +1.5, ray heads further +X — entirely
    // behind tNear once you flip into the slab math, so the early return
    // for `tFar < 0` fires.
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [5, 0, 0],
      dir: [1, 0, 0],
      bound: SPHERE_BOUND,
    });
    expect(r.hit).toBe(false);
  });

  it('zero direction component: dir [1, 0, 0] still resolves cleanly (slab clip with ±Infinity)', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [1, 0, 0],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expectClose(r.point, [1, 0, 0]);
  });
});

describe('raycastImplicit — tangent / glancing edge', () => {
  // A ray that grazes the unit sphere's surface very near `f = 0` may or
  // may not register a sign change depending on step alignment — both
  // outcomes are spec-permissible. The contract is "does not throw, does
  // not return a junk hit outside the AABB."
  it('does not throw on a tangent-grazing ray; if hit, point is within bound', () => {
    // Origin at [0, 1, 0] (on the surface), direction [1, 0, 0] (tangent
    // to the sphere at that point in the XY plane). Whether the march
    // catches a sign change depends on numerical luck.
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 1, 0],
      dir: [1, 0, 0],
      bound: SPHERE_BOUND,
    });
    if (r.hit) {
      expect(Math.abs(r.point[0])).toBeLessThanOrEqual(SPHERE_BOUND);
      expect(Math.abs(r.point[1])).toBeLessThanOrEqual(SPHERE_BOUND);
      expect(Math.abs(r.point[2])).toBeLessThanOrEqual(SPHERE_BOUND);
    }
    // Either branch is acceptable — the assertion is "doesn't throw".
  });
});

describe('raycastImplicit — bisection precision', () => {
  // With steps=64 over diagonal 2*bound=3, initial bracket ≈ 0.047 m.
  // After 8 bisections (default), bracket halves 8× to ≈ 1.8e-4 m. The
  // forward-only-domain tests above use a 1e-2 m tolerance for slack;
  // this test pins the actual achieved precision tighter.
  it('+X cardinal hit on unit sphere lands within 5e-4 m of [1,0,0]', () => {
    const r = raycastImplicit({
      f: sphereF,
      gradF: sphereGradF,
      origin: [0, 0, 0],
      dir: [1, 0, 0],
      bound: SPHERE_BOUND,
    });
    expectHit(r);
    expect(Math.abs(r.point[0] - 1)).toBeLessThan(5e-4);
    expect(Math.abs(r.point[1])).toBeLessThan(5e-4);
    expect(Math.abs(r.point[2])).toBeLessThan(5e-4);
  });
});
