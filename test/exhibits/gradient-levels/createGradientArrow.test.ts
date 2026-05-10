import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGradientArrow } from '../../../src/exhibits/gradient-levels/GradientArrow.ts';

// Geometry-contract test for the gradient-arrow wrapper. Catches the
// construction-side failure modes the pose-helper test can't reach
// (wrong cone orientation, total length drift, initial-visibility
// regression). Mirrors the test/scaffold/render/translucentRect.test.ts
// shape — Vitest, vi.fn() spies on Three's `'dispose'` event for the
// disposal assertion.

const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);
const ARROW_LENGTH = 0.40;

// The wrapper's group has exactly one child (the merged mesh); reach
// in to inspect the geometry + material directly. `dispose()` is the
// only public lifecycle entry point, so the handle interface
// intentionally doesn't expose the inner mesh.
function getMesh(handle: ReturnType<typeof createGradientArrow>): THREE.Mesh {
  const mesh = handle.group.children[0];
  if (!(mesh instanceof THREE.Mesh)) {
    throw new Error('createGradientArrow: expected a Mesh as group.children[0]');
  }
  return mesh;
}

describe('createGradientArrow — initial state', () => {
  it('group.visible is false at construction (no stale-pose flash)', () => {
    const handle = createGradientArrow({ surfaceCenter: SURFACE_CENTER });
    expect(handle.group.visible).toBe(false);
    handle.dispose();
  });
});

describe('createGradientArrow — geometry shape', () => {
  it('merged geometry spans y ∈ [0, ARROW_LENGTH] (tail at origin, tip at full extent)', () => {
    const handle = createGradientArrow({ surfaceCenter: SURFACE_CENTER });
    const mesh = getMesh(handle);
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0, 4);
    expect(bb.max.y).toBeCloseTo(ARROW_LENGTH, 4);
    handle.dispose();
  });

  it('merged geometry is centered around the +Y axis (radial symmetry in x and z)', () => {
    const handle = createGradientArrow({ surfaceCenter: SURFACE_CENTER });
    const mesh = getMesh(handle);
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    // |min.x + max.x| ≈ 0 means the geometry is centered at x = 0.
    expect(Math.abs(bb.min.x + bb.max.x)).toBeLessThan(1e-3);
    expect(Math.abs(bb.min.z + bb.max.z)).toBeLessThan(1e-3);
    handle.dispose();
  });
});

describe('createGradientArrow — overlay material flags', () => {
  it('mesh material has depthTest=false, depthWrite=false (overlay rendering)', () => {
    const handle = createGradientArrow({ surfaceCenter: SURFACE_CENTER });
    const mesh = getMesh(handle);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    handle.dispose();
  });

  it('mesh.renderOrder is 2 (within the opaque pass, after default-renderOrder objects)', () => {
    const handle = createGradientArrow({ surfaceCenter: SURFACE_CENTER });
    const mesh = getMesh(handle);
    expect(mesh.renderOrder).toBe(2);
    handle.dispose();
  });
});

describe('createGradientArrow — setVisible', () => {
  it('setVisible(true) then setVisible(false) toggles group.visible', () => {
    const handle = createGradientArrow({ surfaceCenter: SURFACE_CENTER });
    handle.setVisible(true);
    expect(handle.group.visible).toBe(true);
    handle.setVisible(false);
    expect(handle.group.visible).toBe(false);
    handle.dispose();
  });
});

describe('createGradientArrow — dispose()', () => {
  // Three dispatches a 'dispose' event on the resource; spying on that
  // verifies the dispose actually runs without poking at internal state.
  it('disposes both geometry and material exactly once', () => {
    const handle = createGradientArrow({ surfaceCenter: SURFACE_CENTER });
    const mesh = getMesh(handle);
    const geomSpy = vi.fn();
    const matSpy = vi.fn();
    mesh.geometry.addEventListener('dispose', geomSpy);
    (mesh.material as THREE.Material).addEventListener('dispose', matSpy);
    handle.dispose();
    expect(geomSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });
});
