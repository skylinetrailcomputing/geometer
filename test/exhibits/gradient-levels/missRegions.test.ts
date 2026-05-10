import { describe, expect, it } from 'vitest';
import {
  BOUND,
  fJsRaw,
  gradJs,
} from '../../../src/exhibits/gradient-levels/surfaceModel.ts';
import { raycastImplicit } from '../../../src/scaffold/render/raycastImplicit.ts';
import type { MathVec3 } from '../../../src/scaffold/math/frames.ts';

// Hit/miss regression guard for the gradient-levels scene's f = x²+y²−z²
// family (#164). Imports `fJsRaw`, `gradJs`, `BOUND` directly from
// `surfaceModel.ts` (the single source of truth shared with the scene's
// per-frame raycaster) so a sign-flip typo there fails this test
// immediately — closing the v1 plan-review GPT F3 / HIGH gap where v1's
// test re-defined the surface formula locally and couldn't catch a typo
// in the scene's actual implementation.
//
// The miss regions follow the §2.1 analysis in `_private/plans/164-…`:
// solving f(t·d) − k = 0 along a ray from origin in math-frame
// direction (sin θ cos φ, sin θ sin φ, cos θ) gives
//   t² · cos(2θ) = −k
// with three regimes:
//   - k > 0: hits when cos(2θ) < 0  ⇔ θ ∈ (π/4, 3π/4)  (1-sheet equator band)
//   - k = 0: every ray from origin returns miss by raycaster policy
//                 (sign-change detector rejects identically-zero or
//                 one-signed f along a ray; cone geometry is fine, the
//                 raycaster just can't pick a "first forward intersection")
//   - k < 0: hits when cos(2θ) > 0  ⇔ θ ∈ [0, π/4) ∪ (3π/4, π]  (2-sheet polar caps)
// AABB clip then narrows visibility further: |cos(2θ)| ≥ |k|/BOUND².

const direction = (theta: number, phi: number): MathVec3 => [
  Math.sin(theta) * Math.cos(phi),
  Math.sin(theta) * Math.sin(phi),
  Math.cos(theta),
];

const buildF = (k: number) =>
  (x: number, y: number, z: number) =>
    fJsRaw(x, y, z) - k;

describe('gradient-levels — k > 0 (1-sheet hyperboloid)', () => {
  it('θ = π/2, φ = 0, k = 1: hits at (1, 0, 0)', () => {
    const r = raycastImplicit({
      f: buildF(1),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(Math.PI / 2, 0),
      bound: BOUND,
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.point[0]).toBeCloseTo(1, 2);
      expect(r.point[1]).toBeCloseTo(0, 2);
      expect(r.point[2]).toBeCloseTo(0, 2);
    }
  });

  it('θ = 0 (north pole), k = 1: miss (polar cap miss for k > 0)', () => {
    const r = raycastImplicit({
      f: buildF(1),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(0, 0),
      bound: BOUND,
    });
    expect(r.hit).toBe(false);
  });

  it('θ = π/4 (band edge), k = 1: f = -k constant along the ray; miss', () => {
    // At θ = π/4, f(t·d) = t²·cos(2θ) − k = -k identically along the
    // ray; no sign change possible. Expected: miss. (NOT an "asymptote
    // at infinity" — f is constant, not divergent. v1 plan-review's
    // Sonnet F4 / LOW correction.)
    const r = raycastImplicit({
      f: buildF(1),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(Math.PI / 4, 0),
      bound: BOUND,
    });
    expect(r.hit).toBe(false);
  });

  it('AABB-clipped near band edge: θ = π/4 + 0.05, k = +2: miss', () => {
    // BOUND-aware visibility: |cos(2θ)| ≥ |k|/BOUND² = 2/9 ≈ 0.222.
    // At θ = π/4 + 0.05 ⇒ 2θ = π/2 + 0.1 ⇒ |cos(2θ)| ≈ 0.0998 < 0.222.
    // Analytically valid (band) but t = √(2/0.0998) ≈ 4.48 > BOUND=3
    // ⇒ AABB-clipped. (v1 plan-review's GPT F2 / MEDIUM: the
    // analytically-hits-but-clipped case must be a test, not just prose.)
    const theta = Math.PI / 4 + 0.05;
    const r = raycastImplicit({
      f: buildF(2),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(theta, 0),
      bound: BOUND,
    });
    expect(r.hit).toBe(false);
  });

  it('off-cardinal hit: θ = π/2, φ = π/4, k = 1: hits at (√2/2, √2/2, 0)', () => {
    const r = raycastImplicit({
      f: buildF(1),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(Math.PI / 2, Math.PI / 4),
      bound: BOUND,
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      const inv = Math.SQRT1_2;
      expect(r.point[0]).toBeCloseTo(inv, 2);
      expect(r.point[1]).toBeCloseTo(inv, 2);
      expect(r.point[2]).toBeCloseTo(0, 2);
    }
  });
});

describe('gradient-levels — k = 0 (cone — raycaster-policy miss)', () => {
  // Per plan §2.1 / §2.2: every ray from origin returns miss at k = 0,
  // by sign-change-detector policy (NOT cone geometric inaccessibility
  // — the cone contains the full generator rays at θ = π/4, 3π/4). The
  // raycaster can't pick a "first forward intersection" from f that is
  // identically zero or one-signed along the ray. (v1 plan-review C1 —
  // Sonnet F3 LOW + GPT F1 HIGH convergent.)
  it.each([
    ['equator', Math.PI / 2, 0],
    ['off-equator', Math.PI / 3, Math.PI / 4],
    ['tangent ray', Math.PI / 4, 0],
    ['polar', 0, 0],
    ['south polar', Math.PI, 0],
  ] as const)('θ/φ direction (%s): miss', (_label, theta, phi) => {
    const r = raycastImplicit({
      f: buildF(0),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(theta, phi),
      bound: BOUND,
    });
    expect(r.hit).toBe(false);
  });
});

describe('gradient-levels — k < 0 (2-sheet hyperboloid)', () => {
  it('θ = 0, k = -1: hits at (0, 0, 1) (north cap top)', () => {
    const r = raycastImplicit({
      f: buildF(-1),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(0, 0),
      bound: BOUND,
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.point[0]).toBeCloseTo(0, 2);
      expect(r.point[1]).toBeCloseTo(0, 2);
      expect(r.point[2]).toBeCloseTo(1, 2);
    }
  });

  it('θ = π, k = -1: hits at (0, 0, -1) (south cap top)', () => {
    const r = raycastImplicit({
      f: buildF(-1),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(Math.PI, 0),
      bound: BOUND,
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.point[0]).toBeCloseTo(0, 2);
      expect(r.point[1]).toBeCloseTo(0, 2);
      expect(r.point[2]).toBeCloseTo(-1, 2);
    }
  });

  it('θ = π/2 (equator), k = -1: miss (equator-band miss for k < 0)', () => {
    const r = raycastImplicit({
      f: buildF(-1),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(Math.PI / 2, 0),
      bound: BOUND,
    });
    expect(r.hit).toBe(false);
  });

  it('θ = π/3 (still equator-band), k = -0.5: miss', () => {
    // θ = π/3 ⇒ cos(2θ) = -1/2 < 0; for k = -0.5, t² · (-0.5) = +0.5
    // ⇒ no real t. Equator-band miss in the k < 0 regime.
    const r = raycastImplicit({
      f: buildF(-0.5),
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: direction(Math.PI / 3, 0),
      bound: BOUND,
    });
    expect(r.hit).toBe(false);
  });
});
