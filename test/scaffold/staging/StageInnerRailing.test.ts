import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createStageInnerRailing } from '../../../src/scaffold/staging/StageInnerRailing.ts';

describe('createStageInnerRailing (#223 v3 — inner railing)', () => {
  describe('rect cutout: 4 corner posts + 4 perimeter tubes', () => {
    it('builds exactly 8 meshes for a rect cutout', () => {
      const handles = createStageInnerRailing({
        cutout: {
          kind: 'rect',
          centerXZ: [0, -4],
          halfExtentX: 3.5,
          halfExtentZ: 3.5,
        },
      });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      expect(meshes).toHaveLength(8);
      handles.dispose();
    });

    it('places posts at the cutout corners', () => {
      const cx = 0;
      const cz = -4;
      const hx = 3.5;
      const hz = 3.5;
      const handles = createStageInnerRailing({
        cutout: { kind: 'rect', centerXZ: [cx, cz], halfExtentX: hx, halfExtentZ: hz },
      });

      // Walk meshes; posts have height < tube height (posts at Y=0.45,
      // tubes at Y=0.9). Posts are at the 4 cutout corners.
      const postPositions: Array<readonly [number, number]> = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.position.y < 0.5) {
          postPositions.push([obj.position.x, obj.position.z]);
        }
      });
      expect(postPositions).toHaveLength(4);
      const expectedCorners: ReadonlyArray<readonly [number, number]> = [
        [cx - hx, cz - hz],
        [cx + hx, cz - hz],
        [cx + hx, cz + hz],
        [cx - hx, cz + hz],
      ];
      for (const [ex, ez] of expectedCorners) {
        expect(
          postPositions.some(
            ([x, z]) => Math.abs(x - ex) < 1e-9 && Math.abs(z - ez) < 1e-9,
          ),
        ).toBe(true);
      }
      handles.dispose();
    });

    // Three-way convergent HIGH from v1 roundtable applies to the
    // inner railing's rect path too — same quaternion-based orientation
    // is used; same world-axis assertion catches any regression.
    it('orients tubes correctly per side (rect cutout)', () => {
      const handles = createStageInnerRailing({
        cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 3 },
      });
      handles.group.updateMatrixWorld(true);

      const yLocal = new THREE.Vector3(0, 1, 0);
      handles.group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.position.y < 0.5) return; // posts, not tubes

        const worldAxis = yLocal.clone().applyQuaternion(obj.quaternion);
        expect(Math.abs(worldAxis.y)).toBeLessThan(1e-9);

        // Front/back tubes span world-X; left/right span world-Z.
        // Position discriminator: tube at non-cutout-z midpoint = side
        // tube (left/right). Tube at non-cutout-x midpoint = front/back.
        const p = obj.position;
        // Front/back tube: x at center, z at cutout edge.
        if (Math.abs(p.x - 0) < 1e-9) {
          // X-spanning tube (front or back)
          expect(Math.abs(worldAxis.x)).toBeCloseTo(1, 9);
          expect(Math.abs(worldAxis.z)).toBeLessThan(1e-9);
        } else {
          // Z-spanning tube (left or right)
          expect(Math.abs(worldAxis.z)).toBeCloseTo(1, 9);
          expect(Math.abs(worldAxis.x)).toBeLessThan(1e-9);
        }
      });
      handles.dispose();
    });
  });

  describe('circle cutout: 8 posts + 1 torus top-rail', () => {
    it('builds 8 posts + 1 torus (9 meshes total) for a circle cutout', () => {
      const handles = createStageInnerRailing({
        cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
      });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      expect(meshes).toHaveLength(9);
      handles.dispose();
    });

    it('places 8 posts evenly around the cutout circumference', () => {
      const cx = 0;
      const cz = -4;
      const radius = 1.5;
      const handles = createStageInnerRailing({
        cutout: { kind: 'circle', centerXZ: [cx, cz], radius },
      });

      // Walk posts (Y < 0.5); each should be at radius distance from
      // (cx, cz).
      const distances: number[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.position.y < 0.5) {
          const dx = obj.position.x - cx;
          const dz = obj.position.z - cz;
          distances.push(Math.sqrt(dx * dx + dz * dz));
        }
      });
      expect(distances).toHaveLength(8);
      for (const d of distances) {
        expect(d).toBeCloseTo(radius, 9);
      }
      handles.dispose();
    });

    it('places the torus at the cutout center at Y = POST_HEIGHT, axis along world +Y', () => {
      const cx = 0;
      const cz = -4;
      const handles = createStageInnerRailing({
        cutout: { kind: 'circle', centerXZ: [cx, cz], radius: 1.5 },
      });

      // The torus is the mesh with Y ~= 0.9 (post tops).
      let torus: THREE.Mesh | undefined;
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.position.y > 0.5) {
          torus = obj;
        }
      });
      expect(torus).toBeDefined();
      expect(torus!.position.x).toBeCloseTo(cx, 9);
      expect(torus!.position.z).toBeCloseTo(cz, 9);
      expect(torus!.position.y).toBeCloseTo(0.9, 9);

      // After rotation.x = -π/2, the torus's local +Z (default ring
      // axis) should map to world +Y. Verify by transforming +Z through
      // the mesh's quaternion.
      torus!.updateMatrixWorld(true);
      const zLocal = new THREE.Vector3(0, 0, 1);
      const worldAxis = zLocal.applyQuaternion(torus!.quaternion);
      expect(Math.abs(worldAxis.y)).toBeCloseTo(1, 9);
      handles.dispose();
    });
  });

  describe('dispose()', () => {
    it('rect path: shares one material across all 8 meshes', () => {
      const handles = createStageInnerRailing({
        cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 3 },
      });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      const material = meshes[0].material as THREE.Material;
      for (const m of meshes) expect(m.material).toBe(material);
      handles.dispose();
    });

    it('circle path: shares one material across all 9 meshes', () => {
      const handles = createStageInnerRailing({
        cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
      });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      const material = meshes[0].material as THREE.Material;
      for (const m of meshes) expect(m.material).toBe(material);
      handles.dispose();
    });

    it('disposes material + geometries exactly once, idempotent (rect)', () => {
      const handles = createStageInnerRailing({
        cutout: { kind: 'rect', centerXZ: [0, -4], halfExtentX: 3, halfExtentZ: 3 },
      });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      const material = meshes[0].material as THREE.Material;
      const matSpy = vi.fn();
      material.addEventListener('dispose', matSpy);

      const uniqueGeoms = new Set<THREE.BufferGeometry>();
      for (const m of meshes) uniqueGeoms.add(m.geometry);
      // 1 post geom + 2 tube geoms (X-spanning + Z-spanning) = 3
      expect(uniqueGeoms.size).toBe(3);
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

      handles.dispose(); // idempotent
      expect(matSpy).toHaveBeenCalledTimes(1);
      for (const spy of geomSpies.values()) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });

    it('disposes material + geometries exactly once, idempotent (circle)', () => {
      const handles = createStageInnerRailing({
        cutout: { kind: 'circle', centerXZ: [0, -4], radius: 1.5 },
      });
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
      const material = meshes[0].material as THREE.Material;
      const matSpy = vi.fn();
      material.addEventListener('dispose', matSpy);

      const uniqueGeoms = new Set<THREE.BufferGeometry>();
      for (const m of meshes) uniqueGeoms.add(m.geometry);
      // 1 post geom + 1 torus geom = 2
      expect(uniqueGeoms.size).toBe(2);
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

      handles.dispose(); // idempotent
      expect(matSpy).toHaveBeenCalledTimes(1);
      for (const spy of geomSpies.values()) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });
});
