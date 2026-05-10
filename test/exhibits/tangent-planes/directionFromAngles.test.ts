import { describe, expect, it } from 'vitest';
import { directionFromAngles } from '../../../src/exhibits/tangent-planes/directionFromAngles.ts';
import { writeMathToWorld } from '../../../src/scaffold/math/frames.ts';
import * as THREE from 'three';

// Math-frame typo guard for the tangent-planes scene's θ/φ point
// parametrization (#147). Keeps the (sin θ cos φ, sin θ sin φ, cos θ)
// convention pinned at the unit-test level so a transposition (e.g.
// `(sin θ sin φ, sin θ cos φ, …)`) fails CI rather than slipping
// through to a manual headset smoke pass.

function expectMathClose(
  v: readonly [number, number, number],
  expected: readonly [number, number, number],
  precision = 12,
) {
  expect(v[0]).toBeCloseTo(expected[0], precision);
  expect(v[1]).toBeCloseTo(expected[1], precision);
  expect(v[2]).toBeCloseTo(expected[2], precision);
}

describe('directionFromAngles — math-frame cardinal directions', () => {
  it('θ=0, φ=0 → +math-Z (north pole, "up")', () => {
    const out: [number, number, number] = [0, 0, 0];
    expectMathClose(directionFromAngles(0, 0, out), [0, 0, 1]);
  });

  it('θ=0, φ=π/4 → +math-Z (φ irrelevant at the north pole)', () => {
    const out: [number, number, number] = [0, 0, 0];
    expectMathClose(directionFromAngles(0, Math.PI / 4, out), [0, 0, 1]);
  });

  it('θ=π → −math-Z (south pole, "down")', () => {
    const out: [number, number, number] = [0, 0, 0];
    expectMathClose(directionFromAngles(Math.PI, 0, out), [0, 0, -1]);
  });

  it('θ=π/2, φ=0 → +math-X ("right")', () => {
    const out: [number, number, number] = [0, 0, 0];
    expectMathClose(directionFromAngles(Math.PI / 2, 0, out), [1, 0, 0]);
  });

  it('θ=π/2, φ=π/2 → +math-Y ("forward, away from user")', () => {
    const out: [number, number, number] = [0, 0, 0];
    expectMathClose(directionFromAngles(Math.PI / 2, Math.PI / 2, out), [0, 1, 0]);
  });

  it('θ=π/2, φ=π → −math-X ("left")', () => {
    const out: [number, number, number] = [0, 0, 0];
    expectMathClose(directionFromAngles(Math.PI / 2, Math.PI, out), [-1, 0, 0]);
  });

  it('θ=π/2, φ=−π/2 → −math-Y ("back, toward user")', () => {
    const out: [number, number, number] = [0, 0, 0];
    expectMathClose(
      directionFromAngles(Math.PI / 2, -Math.PI / 2, out),
      [0, -1, 0],
    );
  });

  it('θ=π/2, φ=−π → −math-X (same point as φ=π — closed-range double-snap)', () => {
    const out: [number, number, number] = [0, 0, 0];
    expectMathClose(directionFromAngles(Math.PI / 2, -Math.PI, out), [-1, 0, 0]);
  });
});

describe('directionFromAngles — out-tuple aliasing', () => {
  it('mutates `out` in place and returns the same tuple', () => {
    const out: [number, number, number] = [99, 99, 99];
    const result = directionFromAngles(Math.PI / 2, 0, out);
    expect(result).toBe(out);
    // cos(π/2) is not exactly 0 in IEEE 754 (≈ 6.12e-17), so toEqual
    // would fail on the z component despite the math being correct.
    expectMathClose(out, [1, 0, 0]);
  });

  it('reusing the same `out` on successive calls overwrites cleanly', () => {
    const out: [number, number, number] = [0, 0, 0];
    directionFromAngles(0, 0, out);
    expectMathClose(out, [0, 0, 1]);
    directionFromAngles(Math.PI / 2, Math.PI / 2, out);
    expectMathClose(out, [0, 1, 0]);
    directionFromAngles(Math.PI, 0, out);
    expectMathClose(out, [0, 0, -1]);
  });
});

describe('directionFromAngles + writeMathToWorld round-trip — math-frame routing', () => {
  // Lock the full math → world chain: the indicator's world position is
  // derived by applying writeMathToWorld to directionFromAngles' output,
  // so a regression in either step would surface here.
  function expectWorldClose(
    v: { x: number; y: number; z: number },
    [x, y, z]: readonly [number, number, number],
  ) {
    expect(v.x).toBeCloseTo(x);
    expect(v.y).toBeCloseTo(y);
    expect(v.z).toBeCloseTo(z);
  }

  it('θ=0 (north pole) → world +Y ("up")', () => {
    const dirMath: [number, number, number] = [0, 0, 0];
    const target = new THREE.Vector3();
    writeMathToWorld(directionFromAngles(0, 0, dirMath), target);
    expectWorldClose(target, [0, 1, 0]);
  });

  it('θ=π/2, φ=π/2 (math-Y forward) → world −Z ("away from camera")', () => {
    const dirMath: [number, number, number] = [0, 0, 0];
    const target = new THREE.Vector3();
    writeMathToWorld(
      directionFromAngles(Math.PI / 2, Math.PI / 2, dirMath),
      target,
    );
    expectWorldClose(target, [0, 0, -1]);
  });

  it('θ=π/2, φ=0 (math-X right) → world +X', () => {
    const dirMath: [number, number, number] = [0, 0, 0];
    const target = new THREE.Vector3();
    writeMathToWorld(directionFromAngles(Math.PI / 2, 0, dirMath), target);
    expectWorldClose(target, [1, 0, 0]);
  });
});
