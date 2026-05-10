import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createTranslucentRect } from '../../../src/scaffold/render/TranslucentRect.ts';

// Default-ish input fixture for tests that don't care about specific values.
function makeOptions(overrides: Partial<Parameters<typeof createTranslucentRect>[0]> = {}) {
  return {
    halfExtent: 0.5,
    bodyColor: new THREE.Color(0.34, 0.71, 0.91),
    bodyAlpha: 0.10,
    rimColor: new THREE.Color(0.70, 0.90, 0.99),
    rimAlpha: 0.65,
    rimWidth: 0.05,
    ...overrides,
  };
}

describe('createTranslucentRect — geometry', () => {
  it('builds a PlaneGeometry sized 2 × halfExtent per side', () => {
    const handle = createTranslucentRect(makeOptions({ halfExtent: 0.45 }));
    expect(handle.mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(handle.mesh.geometry.parameters.width).toBeCloseTo(0.9, 6);
    expect(handle.mesh.geometry.parameters.height).toBeCloseTo(0.9, 6);
    handle.dispose();
  });
});

describe('createTranslucentRect — material flags', () => {
  it('material is transparent, depthWrite=false, side=DoubleSide', () => {
    const handle = createTranslucentRect(makeOptions());
    expect(handle.material.transparent).toBe(true);
    expect(handle.material.depthWrite).toBe(false);
    expect(handle.material.side).toBe(THREE.DoubleSide);
    handle.dispose();
  });

  it('mesh.renderOrder is 1 (sits above default-0 implicit surface)', () => {
    const handle = createTranslucentRect(makeOptions());
    expect(handle.mesh.renderOrder).toBe(1);
    handle.dispose();
  });
});

describe('createTranslucentRect — uniforms', () => {
  it('numeric uniforms are wired through', () => {
    const handle = createTranslucentRect(
      makeOptions({ halfExtent: 0.45, bodyAlpha: 0.10, rimAlpha: 0.65, rimWidth: 0.05 }),
    );
    expect(handle.material.uniforms.uHalfExtent.value).toBeCloseTo(0.45, 6);
    expect(handle.material.uniforms.uBodyAlpha.value).toBeCloseTo(0.10, 6);
    expect(handle.material.uniforms.uRimAlpha.value).toBeCloseTo(0.65, 6);
    expect(handle.material.uniforms.uRimWidth.value).toBeCloseTo(0.05, 6);
    handle.dispose();
  });

  // The high-value test: a future "I forgot the .clone()" regression
  // would silently couple two consumers' colors via shared THREE.Color
  // references. Mutating the input color after construction must NOT
  // bleed into the GPU uniform.
  it('bodyColor uniform is cloned (mutating the input color does not mutate the uniform)', () => {
    const inputBody = new THREE.Color(0.34, 0.71, 0.91);
    const handle = createTranslucentRect(makeOptions({ bodyColor: inputBody }));
    inputBody.r = 0.99;
    inputBody.g = 0.99;
    inputBody.b = 0.99;
    const uBody = handle.material.uniforms.uBodyColor.value as THREE.Color;
    expect(uBody.r).toBeCloseTo(0.34, 6);
    expect(uBody.g).toBeCloseTo(0.71, 6);
    expect(uBody.b).toBeCloseTo(0.91, 6);
    handle.dispose();
  });

  it('rimColor uniform is cloned (mutating the input color does not mutate the uniform)', () => {
    const inputRim = new THREE.Color(0.70, 0.90, 0.99);
    const handle = createTranslucentRect(makeOptions({ rimColor: inputRim }));
    inputRim.r = 0.01;
    inputRim.g = 0.01;
    inputRim.b = 0.01;
    const uRim = handle.material.uniforms.uRimColor.value as THREE.Color;
    expect(uRim.r).toBeCloseTo(0.70, 6);
    expect(uRim.g).toBeCloseTo(0.90, 6);
    expect(uRim.b).toBeCloseTo(0.99, 6);
    handle.dispose();
  });
});

describe('createTranslucentRect — dispose()', () => {
  // Three dispatches a 'dispose' event on the resource; spying on that
  // verifies the dispose actually runs without poking at internal state.
  it('disposes both geometry and material exactly once', () => {
    const handle = createTranslucentRect(makeOptions());
    const geomSpy = vi.fn();
    const matSpy = vi.fn();
    handle.mesh.geometry.addEventListener('dispose', geomSpy);
    handle.material.addEventListener('dispose', matSpy);
    handle.dispose();
    expect(geomSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });
});
