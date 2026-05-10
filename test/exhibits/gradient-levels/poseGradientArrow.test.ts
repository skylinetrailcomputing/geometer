import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { poseGradientArrow } from '../../../src/exhibits/gradient-levels/poseGradientArrow.ts';

// Unit tests for the pure math→world + orientation helper. The
// `surfaceCenter` value matches the gradient-levels scene's
// `SURFACE_CENTER = (0, 1.5, -4)` so position assertions read as
// "what the user would see in headset."
const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);

// CylinderGeometry's default axis (= the reference vector
// `setFromUnitVectors` rotates from). Mirrors the constant in
// poseGradientArrow.ts; used here only to re-apply the result
// quaternion and verify the rotated direction.
const REF_AXIS = new THREE.Vector3(0, 1, 0);

function transformedAxis(mesh: THREE.Object3D): THREE.Vector3 {
  return REF_AXIS.clone().applyQuaternion(mesh.quaternion);
}

describe('poseGradientArrow — math→world + position', () => {
  it.each([
    {
      label: '+math-X (right)',
      pointMath: [1, 0, 0] as const,
      expectedWorld: [1, 1.5, -4] as const,
    },
    {
      label: '+math-Y (forward)',
      pointMath: [0, 1, 0] as const,
      expectedWorld: [0, 1.5, -5] as const,
    },
    {
      label: '+math-Z (north pole)',
      pointMath: [0, 0, 1] as const,
      expectedWorld: [0, 2.5, -4] as const,
    },
    {
      label: '−math-Z (south pole)',
      pointMath: [0, 0, -1] as const,
      expectedWorld: [0, 0.5, -4] as const,
    },
  ])('point $label lands at the expected world position', ({ pointMath, expectedWorld }) => {
    const mesh = new THREE.Object3D();
    poseGradientArrow(mesh, pointMath, [0, 0, 1], SURFACE_CENTER);
    expect(mesh.position.x).toBeCloseTo(expectedWorld[0], 6);
    expect(mesh.position.y).toBeCloseTo(expectedWorld[1], 6);
    expect(mesh.position.z).toBeCloseTo(expectedWorld[2], 6);
  });

  it('off-axis diagonal point lands at the math→world conversion + surfaceCenter', () => {
    const inv = 1 / Math.sqrt(3);
    const mesh = new THREE.Object3D();
    poseGradientArrow(
      mesh,
      [inv, inv, inv],
      [inv, inv, inv],
      SURFACE_CENTER,
    );
    // math (X, Y, Z) → world (X, Z, −Y).
    expect(mesh.position.x).toBeCloseTo(inv, 6);
    expect(mesh.position.y).toBeCloseTo(1.5 + inv, 6);
    expect(mesh.position.z).toBeCloseTo(-4 - inv, 6);
  });
});

describe('poseGradientArrow — orientation (deterministic cases)', () => {
  it('+math-Z normal rotates ref +Y to world +Y (identity rotation)', () => {
    // Math-Z = +world-Y, parallel to ARROW_REF_AXIS = (0, 1, 0).
    // setFromUnitVectors returns identity; rotated ref equals ref.
    const mesh = new THREE.Object3D();
    poseGradientArrow(mesh, [0, 0, 1], [0, 0, 1], SURFACE_CENTER);
    const n = transformedAxis(mesh);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(1, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  it('+math-X normal rotates ref +Y to world +X (perpendicular case)', () => {
    const mesh = new THREE.Object3D();
    poseGradientArrow(mesh, [1, 0, 0], [1, 0, 0], SURFACE_CENTER);
    const n = transformedAxis(mesh);
    expect(n.x).toBeCloseTo(1, 6);
    expect(n.y).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  it('+math-Y normal rotates ref +Y to world −Z (perpendicular case)', () => {
    // Math-Y = −world-Z, perpendicular to ARROW_REF_AXIS.
    const mesh = new THREE.Object3D();
    poseGradientArrow(mesh, [0, 1, 0], [0, 1, 0], SURFACE_CENTER);
    const n = transformedAxis(mesh);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(-1, 6);
  });

  it('off-axis diagonal normal rotates ref +Y to the math→world conversion', () => {
    const inv = 1 / Math.sqrt(3);
    const mesh = new THREE.Object3D();
    poseGradientArrow(
      mesh,
      [inv, inv, inv],
      [inv, inv, inv],
      SURFACE_CENTER,
    );
    const n = transformedAxis(mesh);
    // Expected world direction = writeMathToWorld([inv,inv,inv]) = (inv, inv, -inv).
    expect(n.x).toBeCloseTo(inv, 6);
    expect(n.y).toBeCloseTo(inv, 6);
    expect(n.z).toBeCloseTo(-inv, 6);
  });
});

describe('poseGradientArrow — anti-parallel orientation (−math-Z / θ=0, k<0)', () => {
  // The TRUE anti-parallel case for ARROW_REF_AXIS = (0, 1, 0):
  //   normalMath [0,0,-1] → writeMathToWorld → world (0,-1,0).
  //   dot((0,1,0), (0,-1,0)) = -1 → anti-parallel.
  // setFromUnitVectors picks an arbitrary perpendicular axis for the 180°
  // rotation. The rotated +Y must equal the world direction regardless of
  // which perpendicular axis is picked; the roll about that direction is
  // non-deterministic across Three versions (and visually invisible due
  // to the cylinder + cone's body-of-revolution silhouette at 32 segments).
  // We therefore assert ONLY the transformed axis direction, NOT the roll.
  it('−math-Z normal rotates ref +Y to world (0, −1, 0) — direction only', () => {
    const mesh = new THREE.Object3D();
    poseGradientArrow(mesh, [0, 0, -1], [0, 0, -1], SURFACE_CENTER);
    const n = transformedAxis(mesh);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(-1, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  // Defensive: regardless of the picked perpendicular roll, the resulting
  // quaternion must be a unit quaternion. Catches a regression where a
  // future hand-rolled fallback returns NaN-laced components.
  it('result quaternion is unit-length at the anti-parallel case', () => {
    const mesh = new THREE.Object3D();
    poseGradientArrow(mesh, [0, 0, -1], [0, 0, -1], SURFACE_CENTER);
    const q = mesh.quaternion;
    const len = Math.hypot(q.x, q.y, q.z, q.w);
    expect(len).toBeCloseTo(1, 6);
  });
});
