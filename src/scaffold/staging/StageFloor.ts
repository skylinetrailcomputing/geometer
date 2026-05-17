import * as THREE from 'three';

// Cluster-wide floor primitive for the v1.0 staged-exhibit vocabulary
// (#221 / E1.1, #222). Lifted from quadrics' resident floor + AABB
// hole-punch implementation (#125) into the shared `scaffold/staging/`
// namespace so future cluster scenes can opt in without duplicating
// the strip-decomposition logic.
//
// Implementation strategy: 4-strip-with-clamping. The hole rectangle
// is clamped to the outer floor's bounds via Math.max/min, then 4
// strips are constructed around it (front / behind / left / right of
// hole). Degenerate strips (zero or negative area after clamp) early-
// return from addStrip. Handles boundary-exceeding cutouts naturally,
// which `THREE.ShapeGeometry` with hole subtraction would not — earcut
// requires holes to be strictly interior to the outer contour.
//
// Ownership (per `_private/plans/v1.0.md` §4 staging rules): exhibit-
// owned. Per-scene cutout descriptor; allocated in `mount`, disposed
// in `unmount`. The shell removes `ctx.group` after `unmount` returns
// (shell.ts:471–472), so dispose() only releases owned GPU resources;
// no `scene.remove(...)` calls.
//
// Future API extensions tracked in #238 (cluster-wide cutout decision):
// `kind: 'circle'` descriptor variant + a ShapeGeometry-with-holes
// code path for strictly-interior cutouts.

export const STAGE_FLOOR_COLOR_RGB = [
  0x22 / 255,
  0x22 / 255,
  0x44 / 255,
] as const;

export const STAGE_FLOOR_OUTER_HALF_DEFAULT = 5;

/**
 * Cutout descriptor for the floor. Today's only variant is `rect`;
 * `circle` will be added via #238 when the tangent-planes /
 * gradient-levels / saddle-extrema floor question is resolved
 * (cutout-as-projection-aperture vs dipping-hole).
 *
 * Coordinates are in world XZ — the primitive constructs strips
 * directly in that frame, so callers don't need to reason about any
 * local-XY-vs-world-XZ rotation. The strips are rotated -π/2 about
 * world-X to lie on the floor plane.
 */
export type StageCutoutDescriptor = {
  readonly kind: 'rect';
  readonly centerXZ: readonly [number, number];
  readonly halfExtentX: number;
  readonly halfExtentZ: number;
};

export interface StageFloorOptions {
  readonly cutout: StageCutoutDescriptor;
  /** Default `STAGE_FLOOR_OUTER_HALF_DEFAULT` (5 m → 10 × 10 m floor). */
  readonly outerHalfExtent?: number;
}

export interface StageFloorHandles {
  /** Add to the exhibit's group at mount time. */
  readonly group: THREE.Group;
  /** Outer half-extent in world units; E1.2 (#223) railing composes against this. */
  readonly outerHalfExtent: number;
  /** Disposes owned geometries + material. Exhibit calls in unmount(). */
  dispose(): void;
}

export function createStageFloor(opts: StageFloorOptions): StageFloorHandles {
  const outer = opts.outerHalfExtent ?? STAGE_FLOOR_OUTER_HALF_DEFAULT;
  const [cx, cz] = opts.cutout.centerXZ;
  const { halfExtentX, halfExtentZ } = opts.cutout;

  const holeMinX = Math.max(cx - halfExtentX, -outer);
  const holeMaxX = Math.min(cx + halfExtentX, outer);
  const holeMinZ = Math.max(cz - halfExtentZ, -outer);
  const holeMaxZ = Math.min(cz + halfExtentZ, outer);

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...STAGE_FLOOR_COLOR_RGB),
  });
  const geometries: THREE.PlaneGeometry[] = [];
  const group = new THREE.Group();
  group.name = 'stage-floor';

  const addStrip = (
    xMin: number,
    xMax: number,
    zMin: number,
    zMax: number,
  ): void => {
    if (xMax <= xMin || zMax <= zMin) return;
    const stripGeometry = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
    geometries.push(stripGeometry);
    const strip = new THREE.Mesh(stripGeometry, material);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set((xMin + xMax) / 2, 0, (zMin + zMax) / 2);
    group.add(strip);
  };

  addStrip(-outer, outer, holeMaxZ, outer); // front of hole
  addStrip(-outer, outer, -outer, holeMinZ); // behind hole
  addStrip(-outer, holeMinX, holeMinZ, holeMaxZ); // left of hole
  addStrip(holeMaxX, outer, holeMinZ, holeMaxZ); // right of hole

  let disposed = false;
  return {
    group,
    outerHalfExtent: outer,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      material.dispose();
      for (const g of geometries) g.dispose();
      geometries.length = 0;
    },
  };
}
