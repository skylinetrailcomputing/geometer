import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createContrastPit,
  CONTRAST_PIT_DEPTH_DEFAULT,
  CONTRAST_PIT_TOP_Y_DEFAULT,
} from '../../../src/scaffold/staging/ContrastPit.ts';

function meshes(g: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

describe('createContrastPit (#224 / E1.3 — sub-floor vantablack pit)', () => {
  it('builds 5 faces (bottom + 4 walls, open top), one shared black material', () => {
    const pit = createContrastPit({
      cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 2 },
    });
    const m = meshes(pit.group);
    expect(m.length).toBe(5);
    const mat = m[0].material as THREE.MeshBasicMaterial;
    const geos = new Set<THREE.BufferGeometry>();
    for (const f of m) {
      expect(f.material).toBe(mat); // shared material
      expect(f.name).toBe('contrast-pit-face');
      geos.add(f.geometry);
    }
    expect(geos.size).toBe(5); // distinct per-face geometries
    expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(mat.color.getHex()).toBe(0x000000);
    expect(mat.fog).toBe(false);
    expect(mat.side).toBe(THREE.DoubleSide);
    pit.dispose();
  });

  it('sits ENTIRELY below the floor (open top): every face at/below topY', () => {
    const pit = createContrastPit({
      cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 3 },
    });
    const faces = meshes(pit.group);
    for (const f of faces) {
      expect(f.position.y).toBeLessThanOrEqual(CONTRAST_PIT_TOP_Y_DEFAULT + 1e-6);
    }
    // The single horizontal face is the bottom carpet at topY−depth.
    const botY = CONTRAST_PIT_TOP_Y_DEFAULT - CONTRAST_PIT_DEPTH_DEFAULT;
    expect(faces.some((f) => Math.abs(f.position.y - botY) < 1e-6)).toBe(true);
    pit.dispose();
  });

  it('rect cutout → footprint matches the cutout half-extents at its centre', () => {
    const pit = createContrastPit({
      cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3.675, halfExtentZ: 3.675 },
    });
    const faces = meshes(pit.group);
    // The four walls sit one half-extent from the cutout centre on
    // their axis; the back/front walls at z = cz ± halfZ, side walls
    // at x = cx ± halfX.
    expect(faces.some((f) => Math.abs(f.position.z - (-4 - 3.675)) < 1e-6)).toBe(
      true,
    ); // back (−Z)
    expect(faces.some((f) => Math.abs(f.position.z - (-4 + 3.675)) < 1e-6)).toBe(
      true,
    ); // front (+Z, user)
    expect(faces.some((f) => Math.abs(f.position.x - 3.675) < 1e-6)).toBe(true);
    expect(faces.some((f) => Math.abs(f.position.x + 3.675) < 1e-6)).toBe(true);
    pit.dispose();
  });

  it('circle cutout → square footprint of radius at the cutout centre', () => {
    // Mirrors tangent-planes: circle r=1.5 at (0,-4). The pit must
    // stay within tangent-planes' floor (back edge world Z = −6):
    // pit back at z = −4 − 1.5 = −5.5 > −6 ✓ (the conflict fix).
    const pit = createContrastPit({
      cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
    });
    const faces = meshes(pit.group);
    expect(faces.length).toBe(5);
    const backZ = Math.min(...faces.map((f) => f.position.z));
    expect(backZ).toBeCloseTo(-5.5, 6);
    expect(backZ).toBeGreaterThan(-6); // contained under TP floor
    pit.dispose();
  });

  it('respects custom depth + topY', () => {
    const pit = createContrastPit({
      cutout: { kind: 'rect', centerXZ: [0, 0], halfExtentX: 2, halfExtentZ: 2 },
      depth: 5,
      topY: -0.1,
    });
    const faces = meshes(pit.group);
    const ys = faces.map((f) => f.position.y);
    expect(Math.min(...ys)).toBeCloseTo(-0.1 - 5, 6); // bottom at topY−depth
    for (const y of ys) expect(y).toBeLessThanOrEqual(-0.1 + 1e-6);
    pit.dispose();
  });

  describe('dispose() — idempotent + leak-free', () => {
    it('disposes every geometry + the shared material exactly once', () => {
      const pit = createContrastPit({
        cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 3 },
      });
      const faces = meshes(pit.group);
      const mSpy = vi.fn();
      (faces[0].material as THREE.Material).addEventListener('dispose', mSpy);
      const gSpies = faces.map((f) => {
        const s = vi.fn();
        f.geometry.addEventListener('dispose', s);
        return s;
      });
      pit.dispose();
      for (const s of gSpies) expect(s).toHaveBeenCalledTimes(1);
      expect(mSpy).toHaveBeenCalledTimes(1);
      pit.dispose(); // idempotent
      for (const s of gSpies) expect(s).toHaveBeenCalledTimes(1);
      expect(mSpy).toHaveBeenCalledTimes(1);
    });
  });
});
