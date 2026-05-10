import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { poseTangentPlaneMesh } from '../../../src/exhibits/tangent-planes/poseTangentPlaneMesh.ts';

// Unit tests for the pure math→world + orientation helper. The
// `surfaceCenter` value matches the tangent-planes scene's
// `SURFACE_CENTER = (0, 1.5, -4)` so position assertions read as
// "what the user would see in headset."
const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);

// PlaneGeometry's default normal (= the reference vector
// `setFromUnitVectors` rotates from). Mirrors the constant in
// poseTangentPlaneMesh.ts; used here only to re-apply the result
// quaternion and verify the rotated direction.
const REF_NORMAL = new THREE.Vector3(0, 0, 1);

function transformedNormal(mesh: THREE.Object3D): THREE.Vector3 {
  return REF_NORMAL.clone().applyQuaternion(mesh.quaternion);
}

describe('poseTangentPlaneMesh — math→world + position', () => {
  it.each([
    {
      label: '+math-X (right)',
      pointMath: [1, 0, 0] as const,
      expectedWorld: [1, 1.5, -4] as const,
    },
    {
      label: '+math-Z (north pole)',
      pointMath: [0, 0, 1] as const,
      expectedWorld: [0, 2.5, -4] as const,
    },
    {
      label: '+math-Y (forward)',
      pointMath: [0, 1, 0] as const,
      expectedWorld: [0, 1.5, -5] as const,
    },
    {
      label: '−math-Z (south pole)',
      pointMath: [0, 0, -1] as const,
      expectedWorld: [0, 0.5, -4] as const,
    },
  ])('point $label lands at the expected world position', ({ pointMath, expectedWorld }) => {
    const mesh = new THREE.Object3D();
    poseTangentPlaneMesh(mesh, pointMath, [0, 0, 1], SURFACE_CENTER);
    expect(mesh.position.x).toBeCloseTo(expectedWorld[0], 6);
    expect(mesh.position.y).toBeCloseTo(expectedWorld[1], 6);
    expect(mesh.position.z).toBeCloseTo(expectedWorld[2], 6);
  });

  it('off-axis diagonal point lands at the math→world conversion + surfaceCenter', () => {
    const inv = 1 / Math.sqrt(3);
    const mesh = new THREE.Object3D();
    poseTangentPlaneMesh(
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

describe('poseTangentPlaneMesh — orientation (deterministic perpendicular cases)', () => {
  it('+math-Z normal rotates ref +Z to world +Y', () => {
    const mesh = new THREE.Object3D();
    poseTangentPlaneMesh(mesh, [0, 0, 1], [0, 0, 1], SURFACE_CENTER);
    const n = transformedNormal(mesh);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(1, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  it('+math-X normal rotates ref +Z to world +X', () => {
    const mesh = new THREE.Object3D();
    poseTangentPlaneMesh(mesh, [1, 0, 0], [1, 0, 0], SURFACE_CENTER);
    const n = transformedNormal(mesh);
    expect(n.x).toBeCloseTo(1, 6);
    expect(n.y).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  it('−math-Z (south pole) normal rotates ref +Z to world −Y (perpendicular case)', () => {
    // math-Z → world-Y, so normalMath [0,0,-1] → world (0,-1,0). That's
    // perpendicular to PLANE_REF_NORMAL = (0,0,1), NOT anti-parallel.
    // setFromUnitVectors is deterministic for perpendicular inputs.
    const mesh = new THREE.Object3D();
    poseTangentPlaneMesh(mesh, [0, 0, -1], [0, 0, -1], SURFACE_CENTER);
    const n = transformedNormal(mesh);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(-1, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  it('off-axis diagonal normal rotates ref +Z to the math→world conversion', () => {
    const inv = 1 / Math.sqrt(3);
    const mesh = new THREE.Object3D();
    poseTangentPlaneMesh(
      mesh,
      [inv, inv, inv],
      [inv, inv, inv],
      SURFACE_CENTER,
    );
    const n = transformedNormal(mesh);
    // Expected world normal = writeMathToWorld([inv,inv,inv]) = (inv, inv, -inv).
    expect(n.x).toBeCloseTo(inv, 6);
    expect(n.y).toBeCloseTo(inv, 6);
    expect(n.z).toBeCloseTo(-inv, 6);
  });
});

describe('poseTangentPlaneMesh — anti-parallel orientation (+math-Y / φ=π/2)', () => {
  // The TRUE anti-parallel case for PLANE_REF_NORMAL = (0,0,1):
  //   normalMath [0,1,0] → writeMathToWorld → world (0,0,-1).
  //   dot((0,0,1), (0,0,-1)) = -1 → anti-parallel.
  // setFromUnitVectors picks an arbitrary perpendicular axis for the 180°
  // rotation. The rotated +Z must equal the world normal regardless of
  // which perpendicular axis is picked; the roll about that normal is
  // non-deterministic across Three versions (and visually invisible due
  // to the uniform rim). We therefore assert ONLY the transformed normal
  // direction, NOT the roll.
  it('+math-Y normal rotates ref +Z to world (0, 0, −1) — direction only', () => {
    const mesh = new THREE.Object3D();
    poseTangentPlaneMesh(mesh, [0, 1, 0], [0, 1, 0], SURFACE_CENTER);
    const n = transformedNormal(mesh);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(-1, 6);
  });

  // Defensive: regardless of the picked perpendicular roll, the resulting
  // quaternion must be a unit quaternion. Catches a regression where a
  // future hand-rolled fallback returns NaN-laced components.
  it('result quaternion is unit-length at the anti-parallel case', () => {
    const mesh = new THREE.Object3D();
    poseTangentPlaneMesh(mesh, [0, 1, 0], [0, 1, 0], SURFACE_CENTER);
    const q = mesh.quaternion;
    const len = Math.hypot(q.x, q.y, q.z, q.w);
    expect(len).toBeCloseTo(1, 6);
  });
});
