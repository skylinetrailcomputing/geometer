import { describe, expect, it } from 'vitest';
import { anglesFromDirection } from '../../../src/scaffold/math/anglesFromDirection.ts';
import { directionFromAngles } from '../../../src/scaffold/math/directionFromAngles.ts';

// Math-frame typo guard for the tangent-planes scene's controller-aim
// inverse (#197). Pinned at the unit-test level so a transposition (e.g.
// swapping `atan2(y, x)` for `atan2(x, y)`) fails CI rather than slipping
// through to a manual headset smoke pass. Mirror of
// `directionFromAngles.test.ts`'s coverage shape.

describe('anglesFromDirection — math-frame cardinal directions', () => {
  it('+math-Z (north pole) → θ=0, φ=0 (degenerate)', () => {
    const { theta, phi } = anglesFromDirection([0, 0, 1]);
    expect(theta).toBeCloseTo(0, 12);
    expect(phi).toBeCloseTo(0, 12);
  });

  it('−math-Z (south pole) → θ=π, φ=0 (degenerate)', () => {
    const { theta, phi } = anglesFromDirection([0, 0, -1]);
    expect(theta).toBeCloseTo(Math.PI, 12);
    expect(phi).toBeCloseTo(0, 12);
  });

  it('+math-X (right) → θ=π/2, φ=0', () => {
    const { theta, phi } = anglesFromDirection([1, 0, 0]);
    expect(theta).toBeCloseTo(Math.PI / 2, 12);
    expect(phi).toBeCloseTo(0, 12);
  });

  it('+math-Y (forward) → θ=π/2, φ=π/2', () => {
    const { theta, phi } = anglesFromDirection([0, 1, 0]);
    expect(theta).toBeCloseTo(Math.PI / 2, 12);
    expect(phi).toBeCloseTo(Math.PI / 2, 12);
  });

  it('−math-X (left) → θ=π/2, φ=π (positive branch of atan2)', () => {
    const { theta, phi } = anglesFromDirection([-1, 0, 0]);
    expect(theta).toBeCloseTo(Math.PI / 2, 12);
    expect(phi).toBeCloseTo(Math.PI, 12);
  });

  it('−math-Y (back, toward user) → θ=π/2, φ=−π/2', () => {
    const { theta, phi } = anglesFromDirection([0, -1, 0]);
    expect(theta).toBeCloseTo(Math.PI / 2, 12);
    expect(phi).toBeCloseTo(-Math.PI / 2, 12);
  });
});

describe('anglesFromDirection — clamping + numerics', () => {
  it('clamps z slightly above 1 (ray-sphere drift) to θ=0', () => {
    // Mimics the dir.z = 1 + 1e-16 case that arises from ray-sphere
    // intersection numerics on a near-pole pick. Without the clamp,
    // acos(1 + eps) = NaN and the slider would receive NaN.
    const { theta } = anglesFromDirection([0, 0, 1 + 1e-12]);
    expect(theta).toBeCloseTo(0, 12);
    expect(Number.isFinite(theta)).toBe(true);
  });

  it('clamps z slightly below −1 to θ=π', () => {
    const { theta } = anglesFromDirection([0, 0, -1 - 1e-12]);
    expect(theta).toBeCloseTo(Math.PI, 12);
    expect(Number.isFinite(theta)).toBe(true);
  });
});

describe('anglesFromDirection ∘ directionFromAngles round-trip', () => {
  // Closes the contract: any (θ, φ) inside the open interior of the slider
  // domain survives a forward-then-inverse trip with no sign / axis swap.
  // Stays off the poles (where φ is degenerate) and off φ = ±π (where
  // atan2 picks +π for both ±0 inputs to y).
  const cases: Array<readonly [string, number, number]> = [
    ['interior, off-snap', Math.PI / 3, Math.PI / 4],
    ['equator +X', Math.PI / 2, 0],
    ['equator +Y', Math.PI / 2, Math.PI / 2],
    ['equator −Y', Math.PI / 2, -Math.PI / 2],
    ['polar quadrant', Math.PI / 4, 3 * Math.PI / 4],
    ['polar quadrant 2', 2 * Math.PI / 3, -3 * Math.PI / 4],
  ];

  for (const [name, theta0, phi0] of cases) {
    it(`${name}: (θ=${theta0.toFixed(3)}, φ=${phi0.toFixed(3)}) round-trips`, () => {
      const dir: [number, number, number] = [0, 0, 0];
      directionFromAngles(theta0, phi0, dir);
      const { theta, phi } = anglesFromDirection(dir);
      expect(theta).toBeCloseTo(theta0, 12);
      expect(phi).toBeCloseTo(phi0, 12);
    });
  }
});
