import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createStageRailing } from '../../../src/scaffold/staging/StageRailing.ts';

describe('createStageRailing (#223)', () => {
  describe('geometry — 4 posts + 4 tubes', () => {
    it('builds exactly 8 meshes inside the group', () => {
      const handles = createStageRailing({ outerHalfExtent: 5 });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      expect(meshes).toHaveLength(8);
      handles.dispose();
    });

    it('places corner posts at (±outer, height/2, ±outer)', () => {
      const outer = 5;
      const handles = createStageRailing({ outerHalfExtent: outer });

      // Corner posts: 4 meshes with |x| ≈ |z| ≈ outer.
      const cornerPositions: Array<readonly [number, number, number]> = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const p = obj.position;
          if (
            Math.abs(Math.abs(p.x) - outer) < 1e-9 &&
            Math.abs(Math.abs(p.z) - outer) < 1e-9
          ) {
            cornerPositions.push([p.x, p.y, p.z] as const);
          }
        }
      });
      expect(cornerPositions).toHaveLength(4);
      // All four corners present
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          expect(
            cornerPositions.some(
              ([x, , z]) => Math.sign(x) === sx && Math.sign(z) === sz,
            ),
          ).toBe(true);
        }
      }
      // All four posts at the same height
      const ys = cornerPositions.map(([, y]) => y);
      expect(new Set(ys).size).toBe(1);
      handles.dispose();
    });

    it('places top-rail tubes at y = POST_HEIGHT (above corner posts)', () => {
      const outer = 5;
      const handles = createStageRailing({ outerHalfExtent: outer });

      const tubeYs: number[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const p = obj.position;
          // Tubes sit at midpoints of sides: one of (x, z) is 0, the
          // other is ±outer.
          const xZero = Math.abs(p.x) < 1e-9;
          const zZero = Math.abs(p.z) < 1e-9;
          if (xZero || zZero) tubeYs.push(p.y);
        }
      });
      expect(tubeYs).toHaveLength(4);
      // All tubes at the same height
      expect(new Set(tubeYs).size).toBe(1);
      // Tubes strictly above corner posts (posts at height/2, tubes at height).
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const p = obj.position;
          const isCorner =
            Math.abs(Math.abs(p.x) - outer) < 1e-9 &&
            Math.abs(Math.abs(p.z) - outer) < 1e-9;
          if (isCorner) expect(tubeYs[0]).toBeGreaterThan(p.y);
        }
      });
      handles.dispose();
    });
  });

  // Three-way convergent HIGH from v1 roundtable (Sonnet F1 + GPT F5 +
  // DeepSeek F1): tube *orientation* is the regression class to defend
  // against. Position-only tests would have passed even if all four
  // tubes were oriented identically. After updateMatrixWorld(true),
  // transform the cylinder's local +Y axis through the mesh's quaternion;
  // the result is the tube's long axis in world space. Front / back tubes
  // must span world-X (zero Y, zero Z); right / left tubes must span
  // world-Z (zero Y, zero X). The quaternion approach in StageRailing.ts
  // makes orientation literal in the construction code; this test catches
  // any future regression to wrong-axis orientation.
  describe('orientation — tubes aligned with their sides', () => {
    it('front + back tubes span world-X, right + left tubes span world-Z', () => {
      const outer = 5;
      const handles = createStageRailing({ outerHalfExtent: outer });

      // Force matrixWorld up-to-date — meshes have just been added to a
      // detached Group, so matrixWorld is identity until we update.
      handles.group.updateMatrixWorld(true);

      const yLocal = new THREE.Vector3(0, 1, 0);
      handles.group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const p = obj.position;
        const isTube =
          (Math.abs(p.x) < 1e-9 &&
            Math.abs(Math.abs(p.z) - outer) < 1e-9) ||
          (Math.abs(p.z) < 1e-9 && Math.abs(Math.abs(p.x) - outer) < 1e-9);
        if (!isTube) return;

        // Cylinder's local +Y is its long axis. Transform to world via
        // the mesh's quaternion (no translation contribution to a
        // direction vector).
        const worldAxis = yLocal.clone().applyQuaternion(obj.quaternion);

        // Tube is horizontal — Y component should be ~0.
        expect(Math.abs(worldAxis.y)).toBeLessThan(1e-9);

        // Front (z = +outer) and back (z = -outer) tubes span world-X.
        // Right (x = +outer) and left (x = -outer) tubes span world-Z.
        // Tolerance-based discriminator (per second-Sonnet NEW LOW):
        // construction sets midpoints to literal 0, so exact equality
        // holds today, but a tolerance removes the implicit "we promise
        // midpoints are exactly 0" coupling against future drift.
        const spansX = Math.abs(p.z) > 1e-6;
        if (spansX) {
          expect(Math.abs(worldAxis.x)).toBeCloseTo(1, 9);
          expect(Math.abs(worldAxis.z)).toBeLessThan(1e-9);
        } else {
          expect(Math.abs(worldAxis.z)).toBeCloseTo(1, 9);
          expect(Math.abs(worldAxis.x)).toBeLessThan(1e-9);
        }
      });
      handles.dispose();
    });
  });

  describe('scales with outerHalfExtent', () => {
    it('honors per-scene outerHalfExtent: 6 (tangent-planes)', () => {
      const handles = createStageRailing({ outerHalfExtent: 6 });
      let foundFar = false;
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (Math.abs(obj.position.x) > 5.5) foundFar = true;
          if (Math.abs(obj.position.z) > 5.5) foundFar = true;
        }
      });
      expect(foundFar).toBe(true);
      handles.dispose();
    });
  });

  describe('dispose()', () => {
    // Material-sharing assertion (Sonnet F3): v1 test grabbed
    // meshes[0].material and asserted its spy fires once, but didn't
    // verify meshes[1..7] used the same material instance. A
    // copy-paste implementation that allocated a new material per mesh
    // would leak 7 materials silently.
    it('shares one material + two geometries across all 8 meshes', () => {
      const handles = createStageRailing({ outerHalfExtent: 5 });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      expect(meshes).toHaveLength(8);

      const material = meshes[0].material as THREE.Material;
      for (const m of meshes) expect(m.material).toBe(material);

      const uniqueGeoms = new Set<THREE.BufferGeometry>();
      for (const m of meshes) uniqueGeoms.add(m.geometry);
      expect(uniqueGeoms.size).toBe(2);

      handles.dispose();
    });

    // Three.js dispatches a 'dispose' event on the resource; spying on
    // that verifies dispose actually runs without poking internal state.
    // Same pattern as StageFloor.test.ts circle path.
    it('disposes shared material + geometries exactly once, idempotent', () => {
      const handles = createStageRailing({ outerHalfExtent: 5 });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      const material = meshes[0].material as THREE.Material;
      const matSpy = vi.fn();
      material.addEventListener('dispose', matSpy);

      const uniqueGeoms = new Set<THREE.BufferGeometry>();
      for (const m of meshes) uniqueGeoms.add(m.geometry);
      const geomSpies = new Map<
        THREE.BufferGeometry,
        ReturnType<typeof vi.fn>
      >();
      for (const g of uniqueGeoms) {
        const spy = vi.fn();
        g.addEventListener('dispose', spy);
        geomSpies.set(g, spy);
      }

      handles.dispose();
      expect(matSpy).toHaveBeenCalledTimes(1);
      for (const spy of geomSpies.values()) {
        expect(spy).toHaveBeenCalledTimes(1);
      }

      handles.dispose(); // idempotent — guard against double-dispose
      expect(matSpy).toHaveBeenCalledTimes(1);
      for (const spy of geomSpies.values()) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });
});
