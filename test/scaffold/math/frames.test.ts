import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  mathToWorld,
  writeMathToWorld,
  worldToMath,
  type MathVec3,
} from '@/scaffold/math/frames';

// Use toBeCloseTo throughout: the helpers compute `-v[i]` which
// produces IEEE −0 when v[i] is +0, and Object.is(-0, 0) is false,
// so toBe / toEqual would fail on the zero components even though
// the numeric value is correct.

function expectVec3(
  v: { x: number; y: number; z: number },
  [x, y, z]: readonly [number, number, number],
) {
  expect(v.x).toBeCloseTo(x);
  expect(v.y).toBeCloseTo(y);
  expect(v.z).toBeCloseTo(z);
}

function expectMathVec(v: MathVec3, expected: readonly [number, number, number]) {
  expect(v[0]).toBeCloseTo(expected[0]);
  expect(v[1]).toBeCloseTo(expected[1]);
  expect(v[2]).toBeCloseTo(expected[2]);
}

// Basis-vector tests (not just round-trip): a flipped handedness or
// dropped sign convention can round-trip identically while still
// pointing the wrong direction in world space. Pin each math basis
// vector to its expected world-frame image.

describe('mathToWorld basis vectors', () => {
  it('math-X (right) → +world-X', () => {
    expectVec3(mathToWorld([1, 0, 0]), [1, 0, 0]);
  });
  it('math-Y (forward, away from user) → −world-Z', () => {
    expectVec3(mathToWorld([0, 1, 0]), [0, 0, -1]);
  });
  it('math-Z (up) → +world-Y', () => {
    expectVec3(mathToWorld([0, 0, 1]), [0, 1, 0]);
  });
});

describe('worldToMath inverse', () => {
  it('+world-X → math-X', () => {
    expectMathVec(worldToMath(new THREE.Vector3(1, 0, 0)), [1, 0, 0]);
  });
  it('+world-Y → math-Z', () => {
    expectMathVec(worldToMath(new THREE.Vector3(0, 1, 0)), [0, 0, 1]);
  });
  it('−world-Z → math-Y', () => {
    expectMathVec(worldToMath(new THREE.Vector3(0, 0, -1)), [0, 1, 0]);
  });
});

describe('mathToWorld ↔ worldToMath round-trip', () => {
  const cases: MathVec3[] = [
    [1, 2, 3],
    [-0.5, 0, 4.2],
    [0, 0, 0],
    [-1.7, -2.3, 0.1],
  ];
  it.each(cases)('round-trips (%f, %f, %f)', (...v) => {
    expectMathVec(worldToMath(mathToWorld(v as unknown as MathVec3)), v as MathVec3);
  });
});

describe('writeMathToWorld non-allocating', () => {
  it('writes into target and returns it', () => {
    const target = new THREE.Vector3(99, 99, 99);
    const result = writeMathToWorld([1, 2, 3], target);
    expect(result).toBe(target);
    expectVec3(target, [1, 3, -2]);
  });
  it('reusing the same target on successive calls overwrites cleanly', () => {
    const target = new THREE.Vector3();
    writeMathToWorld([1, 0, 0], target);
    expectVec3(target, [1, 0, 0]);
    writeMathToWorld([0, 1, 0], target);
    expectVec3(target, [0, 0, -1]);
    writeMathToWorld([0, 0, 1], target);
    expectVec3(target, [0, 1, 0]);
  });
});
