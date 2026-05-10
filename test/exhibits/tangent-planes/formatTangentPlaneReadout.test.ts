import { describe, expect, it } from 'vitest';
import { formatTangentPlaneReadout } from '../../../src/exhibits/tangent-planes/formatTangentPlaneReadout.ts';

// Sign + magnitude formatter for the tangent-planes readout (#149).
// Pure; verifies the three contracts the headset visual depends on:
//   1. Top-line normal slot uses a leading sign of `+` for non-negative
//      values, `−` (U+2212) for negative — matches `EquationReadout.ts`.
//   2. Top-line point slot uses an *inverted* sign — the `±` glyph is
//      the sign of `−x₀` so the parenthesized form `(x − x₀)` reads
//      correctly under sign flip.
//   3. Bottom-line normal slot is the same signed-magnitude as the top
//      normal (independent Text instances drive the same string source).
//
// Guards a textbook-form regression at the unit-test level: a swapped
// sign convention would otherwise slip through to a manual headset
// smoke pass, where `(x + 0.42)` masquerading as `(x − x₀)` for
// `x₀ = +0.42` would silently teach the wrong algebra.

const MINUS = '−'; // U+2212

describe('formatTangentPlaneReadout — top-line normals', () => {
  it('positive normal → leading "+" sign', () => {
    const r = formatTangentPlaneReadout([0, 0, 0], [0.71, 0.5, 0.5]);
    expect(r.topNormals[0]).toBe('+0.71');
    expect(r.topNormals[1]).toBe('+0.50');
    expect(r.topNormals[2]).toBe('+0.50');
  });

  it('negative normal → leading "−" sign (U+2212)', () => {
    const r = formatTangentPlaneReadout([0, 0, 0], [-0.71, -0.5, -0.5]);
    expect(r.topNormals[0]).toBe(`${MINUS}0.71`);
    expect(r.topNormals[1]).toBe(`${MINUS}0.50`);
    expect(r.topNormals[2]).toBe(`${MINUS}0.50`);
  });

  it('zero normal → "+0.00" (sphere normals are never exactly zero, but the path is defensive)', () => {
    const r = formatTangentPlaneReadout([0, 0, 0], [0, 0, 0]);
    expect(r.topNormals[0]).toBe('+0.00');
    expect(r.topNormals[1]).toBe('+0.00');
    expect(r.topNormals[2]).toBe('+0.00');
  });
});

describe('formatTangentPlaneReadout — top-line point offsets (inverted sign)', () => {
  it('positive x₀ → "−|x₀|" (renders as (x − 0.42))', () => {
    const r = formatTangentPlaneReadout([0.42, 0.5, 0.71], [0, 0, 0]);
    expect(r.topPoints[0]).toBe(`${MINUS}0.42`);
    expect(r.topPoints[1]).toBe(`${MINUS}0.50`);
    expect(r.topPoints[2]).toBe(`${MINUS}0.71`);
  });

  it('negative x₀ → "+|x₀|" (renders as (x + 0.42))', () => {
    const r = formatTangentPlaneReadout([-0.42, -0.5, -0.71], [0, 0, 0]);
    expect(r.topPoints[0]).toBe('+0.42');
    expect(r.topPoints[1]).toBe('+0.50');
    expect(r.topPoints[2]).toBe('+0.71');
  });

  it('exact zero x₀ → "−0.00" (renders as (x − 0.00), the textbook identity form)', () => {
    const r = formatTangentPlaneReadout([0, 0, 0], [1, 0, 0]);
    expect(r.topPoints[0]).toBe(`${MINUS}0.00`);
    expect(r.topPoints[1]).toBe(`${MINUS}0.00`);
    expect(r.topPoints[2]).toBe(`${MINUS}0.00`);
  });
});

describe('formatTangentPlaneReadout — bottom-line normals match top-line normals', () => {
  it('source value parity — same signed-magnitude string per axis', () => {
    const r = formatTangentPlaneReadout([0, 0, 0], [0.71, -0.5, 0]);
    expect(r.bottomNormals[0]).toBe(r.topNormals[0]);
    expect(r.bottomNormals[1]).toBe(r.topNormals[1]);
    expect(r.bottomNormals[2]).toBe(r.topNormals[2]);
  });
});

describe('formatTangentPlaneReadout — unit sphere identity (n̂ = p̂)', () => {
  it('on the unit sphere the normal equals the point — readouts agree per axis', () => {
    // A real surface point on the unit sphere: (sin θ cos φ, sin θ sin φ, cos θ)
    // with θ = π/3, φ = π/4. Same initial pose used in tangent-planes/index.ts.
    const x = Math.sin(Math.PI / 3) * Math.cos(Math.PI / 4);
    const y = Math.sin(Math.PI / 3) * Math.sin(Math.PI / 4);
    const z = Math.cos(Math.PI / 3);
    // For x²+y²+z²=1, ∇f = 2p ⇒ unit normal = p directly.
    const r = formatTangentPlaneReadout([x, y, z], [x, y, z]);
    // Top-line normal coefficients are the signed point components.
    expect(r.topNormals[0]).toBe('+0.61');
    expect(r.topNormals[1]).toBe('+0.61');
    expect(r.topNormals[2]).toBe('+0.50');
    // Top-line point offsets carry the inverted sign — the equation
    // reads `+0.61 (x − 0.61) + 0.61 (y − 0.61) + 0.50 (z − 0.50) = 0`.
    expect(r.topPoints[0]).toBe(`${MINUS}0.61`);
    expect(r.topPoints[1]).toBe(`${MINUS}0.61`);
    expect(r.topPoints[2]).toBe(`${MINUS}0.50`);
  });
});

describe('formatTangentPlaneReadout — sign flip continuity', () => {
  it('crossing zero on x₀ flips only the parenthesized connector — magnitude unchanged', () => {
    const positive = formatTangentPlaneReadout([0.42, 0, 0], [0, 0, 1]);
    const negative = formatTangentPlaneReadout([-0.42, 0, 0], [0, 0, 1]);
    expect(positive.topPoints[0]).toBe(`${MINUS}0.42`);
    expect(negative.topPoints[0]).toBe('+0.42');
  });
});
