import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createStageFloor } from '../../../src/scaffold/staging/StageFloor.ts';

describe('createStageFloor (#238 circle path)', () => {
  describe('kind: circle interior-only invariant', () => {
    // Mirrors tangent-planes' actual descriptor under Path A1: per-scene
    // outerHalfExtent: 6 + radius: 1.5 at z=-4. |cz|+r = 5.5 < 6 ✓.
    it('accepts a circle cutout strictly interior with margin', () => {
      expect(() =>
        createStageFloor({
          cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
          outerHalfExtent: 6,
        }),
      ).not.toThrow();
    });

    // The test that would have caught v1's `>` bug. Exact boundary
    // tangency (|cz| + r === outer) MUST reject; earcut treats
    // shared-vertex contact as degenerate.
    it('rejects a circle cutout exactly touching the outer on -Z', () => {
      expect(() =>
        createStageFloor({
          cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.0 },
          // outerHalfExtent defaults to 5 → |cz|+r = 5.0 === outer
        }),
      ).toThrow(/strictly interior/);
    });

    it('rejects a circle cutout that exits the outer on +X', () => {
      expect(() =>
        createStageFloor({
          cutout: { kind: 'circle', centerXZ: [4.5, 0], radius: 1.0 },
        }),
      ).toThrow(/strictly interior/);
    });

    it('rejects a circle cutout that exits the outer on -Z', () => {
      expect(() =>
        createStageFloor({
          cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
          // outerHalfExtent defaults to 5 → |cz|+r = 5.5 > 5
        }),
      ).toThrow(/strictly interior/);
    });
  });

  // Sign-flip mapping is CPU-side and isolatable; relying on headset
  // smoke alone for a deterministic coordinate transform would miss a
  // regression that flips local-Y = +centerZ instead of -centerZ.
  //
  // The probe asserts on hole-boundary vertices (which ShapeGeometry
  // writes at exactly `radius` from the hole center) at both the
  // correct candidate center (local-Y = -world-Z = +4) and the wrong
  // candidate center (local-Y = +world-Z = -4). The asymmetry
  // distinguishes correct from regression.
  describe('kind: circle sign-flip mapping (local-Y = -world-Z)', () => {
    it('places the hole boundary at local-XY (cx, -cz), not (cx, +cz)', () => {
      const handles = createStageFloor({
        cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
        outerHalfExtent: 6,
      });

      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      expect(meshes.length).toBeGreaterThan(0);
      const mesh = meshes[0];

      const pos = mesh.geometry.attributes.position;
      let nearCorrectCenter = 0;
      let nearWrongCenter = 0;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i);
        const ly = pos.getY(i);
        const dCorrect = Math.hypot(lx - 0, ly - 4); // expected: local +4
        const dWrong = Math.hypot(lx - 0, ly + 4); // regression: local -4
        if (dCorrect > 1.2 && dCorrect < 1.8) nearCorrectCenter += 1;
        if (dWrong > 1.2 && dWrong < 1.8) nearWrongCenter += 1;
      }
      expect(nearCorrectCenter).toBeGreaterThan(0); // hole IS at (0, +4)
      expect(nearWrongCenter).toBe(0); // hole is NOT at (0, -4)

      handles.dispose();
    });
  });

  // v3 back-extension (PR #244 smoke): asymmetric Z extent so the floor
  // clears math envelopes that reach past the symmetric outerHalfExtent
  // on the −Z side without inflating all four edges. Affects the
  // strictly-interior invariant and the outer rect vertex layout.
  describe('backExtension (v3 — asymmetric −Z extension)', () => {
    it('handle exposes backExtension default 0 when not passed', () => {
      const handles = createStageFloor({
        cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 3 },
      });
      expect(handles.backExtension).toBe(0);
      handles.dispose();
    });

    it('handle exposes backExtension when passed', () => {
      const handles = createStageFloor({
        cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 3 },
        backExtension: 3,
      });
      expect(handles.backExtension).toBe(3);
      handles.dispose();
    });

    it('rect path: back-extension expands the −Z floor reach without affecting X', () => {
      const handles = createStageFloor({
        cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 3 },
        outerHalfExtent: 5,
        backExtension: 3,
      });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      // The "behind" strip should reach z = -outer - back = -8.
      // Each strip is rotated -π/2 about world-X; center.z is in world.
      let foundBackStrip = false;
      for (const m of meshes) {
        if (m.position.z < -5) foundBackStrip = true;
      }
      expect(foundBackStrip).toBe(true);
      handles.dispose();
    });

    it('circle path: back-extension expands strictly-interior allowance on −Z', () => {
      // Without back-extension this would fail (|cz|+r = 5.5 >= 5).
      // With backExtension: 3, the back edge moves to -8; cz - r = -5.5 > -8 ✓.
      expect(() =>
        createStageFloor({
          cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
          outerHalfExtent: 5,
          backExtension: 3,
        }),
      ).not.toThrow();
    });

    it('circle path: still rejects circle exceeding the extended back edge', () => {
      expect(() =>
        createStageFloor({
          cutout: { kind: 'circle', centerXZ: [0, -7], radius: 1.5 },
          outerHalfExtent: 5,
          backExtension: 3, // back at -8; cz - r = -8.5 <= -8 → reject
        }),
      ).toThrow(/strictly interior/);
    });

    it('circle path: still rejects circle exceeding the front edge regardless of back-extension', () => {
      expect(() =>
        createStageFloor({
          cutout: { kind: 'circle', centerXZ: [0, 4], radius: 1.5 },
          outerHalfExtent: 5,
          backExtension: 10, // huge back, but front still bounded at +5
        }),
      ).toThrow(/strictly interior/);
    });
  });

  describe('dispose() — circle path', () => {
    // Three.js dispatches a 'dispose' event on the resource; spying on
    // that verifies dispose actually runs without poking internal state.
    // Same pattern as translucentRect.test.ts.
    it('disposes ShapeGeometry and material exactly once', () => {
      const handles = createStageFloor({
        cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
        outerHalfExtent: 6,
      });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      const geomSpy = vi.fn();
      const matSpy = vi.fn();
      meshes[0].geometry.addEventListener('dispose', geomSpy);
      (meshes[0].material as THREE.Material).addEventListener(
        'dispose',
        matSpy,
      );
      handles.dispose();
      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);

      handles.dispose(); // idempotent — guard against double-dispose
      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
    });
  });
});
