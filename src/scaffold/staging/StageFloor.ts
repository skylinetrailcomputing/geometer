import * as THREE from 'three';

// Cluster-wide floor primitive for the v1.0 staged-exhibit vocabulary
// (#221 / E1.1). Two cutout-shape code paths, dispatched on
// `StageCutoutDescriptor.kind`:
//
// - `kind: 'rect'` — 4-strip-with-clamping (#222 lift from quadrics'
//   #125 implementation). The hole rectangle is clamped to the outer
//   floor's bounds via Math.max/min, then 4 strips are constructed
//   around it (front / behind / left / right). Degenerate strips
//   early-return. Handles boundary-exceeding cutouts naturally. Used
//   by quadrics, gradient-levels, saddle-extrema.
// - `kind: 'circle'` — ShapeGeometry-with-hole (#238). Strictly-
//   interior cutouts only (asserted at construction); tangent contact
//   with the outer rect degenerates earcut tessellation. Used by
//   tangent-planes, which opts in to a per-scene `outerHalfExtent: 6`
//   so its `radius: BOUND = 1.5` disk at `SURFACE_CENTER.z = -4` fits
//   strictly interior with 0.5m margin.
//
// Sign-flip note for circle path: the shape is constructed in local-
// XY and rotated `-π/2` about world-X to lie on the floor plane. The
// rotation maps local +Y to world −Z, so a cutout centered at world
// `(cx, cz)` is constructed at local-XY `(cx, -cz)`.
//
// Ownership (per `_private/plans/v1.0.md` §4 staging rules): exhibit-
// owned. Per-scene cutout descriptor; allocated in `mount`, disposed
// in `unmount`. The shell removes `ctx.group` after `unmount` returns
// (shell.ts:471–472), so dispose() only releases owned GPU resources;
// no `scene.remove(...)` calls.

export const STAGE_FLOOR_COLOR_RGB = [
  0x22 / 255,
  0x22 / 255,
  0x44 / 255,
] as const;

export const STAGE_FLOOR_OUTER_HALF_DEFAULT = 5;
export const STAGE_FLOOR_BACK_EXTENSION_DEFAULT = 0;

/**
 * Cutout descriptor for the floor. Sum-type:
 *
 * - `kind: 'rect'` — strip approach (handles both interior and boundary-
 *   exceeding cutouts via Math.max/min clamp + degenerate-strip early-
 *   return). Cluster-wide today: quadrics, gradient-levels, saddle-extrema.
 * - `kind: 'circle'` — ShapeGeometry-with-hole approach. Strictly-interior
 *   cutouts only (asserted at construction); tangent contact with the
 *   outer rect degenerates earcut tessellation. Tangent-planes opted in
 *   under #238's Path A1 (per-scene `outerHalfExtent: 6` so the
 *   `radius: BOUND = 1.5` disk fits strictly interior with 0.5m margin).
 *
 * Coordinates are in world XZ — the primitive applies the local-XY ↔
 * world-XZ sign-flip internally (the floor plane is laid down by
 * rotating geometry `-π/2` about world-X, which maps local +Y to
 * world −Z), so callers don't reason about any rotation themselves.
 */
export type StageCutoutDescriptor =
  | {
      readonly kind: 'rect';
      readonly centerXZ: readonly [number, number];
      readonly halfExtentX: number;
      readonly halfExtentZ: number;
    }
  | {
      readonly kind: 'circle';
      readonly centerXZ: readonly [number, number];
      readonly radius: number;
    };

export interface StageFloorOptions {
  readonly cutout: StageCutoutDescriptor;
  /** Default `STAGE_FLOOR_OUTER_HALF_DEFAULT` (5 m → 10 × 10 m floor). */
  readonly outerHalfExtent?: number;
  /**
   * Optional asymmetric extension of the floor's −Z edge (math-Y positive
   * direction). Lets a scene push the back of the floor past the math
   * envelope without inflating all four edges. Default 0 (symmetric).
   * See `_private/plans/223-illusory-railing.md` §3.5 for the per-scene
   * rationale + Brad's PR #244 smoke feedback.
   */
  readonly backExtension?: number;
}

export interface StageFloorHandles {
  /** Add to the exhibit's group at mount time. */
  readonly group: THREE.Group;
  /** Outer half-extent in world units; E1.2 (#223) railing composes against this. */
  readonly outerHalfExtent: number;
  /** Back extension (−Z direction) in world units; E1.2 railing reads this. */
  readonly backExtension: number;
  /** Disposes owned geometries + material. Exhibit calls in unmount(). */
  dispose(): void;
}

export function createStageFloor(opts: StageFloorOptions): StageFloorHandles {
  const outer = opts.outerHalfExtent ?? STAGE_FLOOR_OUTER_HALF_DEFAULT;
  const back = opts.backExtension ?? STAGE_FLOOR_BACK_EXTENSION_DEFAULT;

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...STAGE_FLOOR_COLOR_RGB),
  });
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  group.name = 'stage-floor';

  if (opts.cutout.kind === 'rect') {
    buildRectFloor(opts.cutout, outer, back, material, geometries, group);
  } else {
    buildCircleFloor(opts.cutout, outer, back, material, geometries, group);
  }

  let disposed = false;
  return {
    group,
    outerHalfExtent: outer,
    backExtension: back,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      material.dispose();
      for (const g of geometries) g.dispose();
      geometries.length = 0;
    },
  };
}

function buildRectFloor(
  cutout: Extract<StageCutoutDescriptor, { kind: 'rect' }>,
  outer: number,
  back: number,
  material: THREE.Material,
  geometries: THREE.BufferGeometry[],
  group: THREE.Group,
): void {
  const [cx, cz] = cutout.centerXZ;
  const { halfExtentX, halfExtentZ } = cutout;

  // Asymmetric outer rect: X stays ±outer; Z spans [-outer-back, +outer].
  const outerMinZ = -outer - back;

  const holeMinX = Math.max(cx - halfExtentX, -outer);
  const holeMaxX = Math.min(cx + halfExtentX, outer);
  const holeMinZ = Math.max(cz - halfExtentZ, outerMinZ);
  const holeMaxZ = Math.min(cz + halfExtentZ, outer);

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
  addStrip(-outer, outer, outerMinZ, holeMinZ); // behind hole (extended)
  addStrip(-outer, holeMinX, holeMinZ, holeMaxZ); // left of hole
  addStrip(holeMaxX, outer, holeMinZ, holeMaxZ); // right of hole
}

function buildCircleFloor(
  cutout: Extract<StageCutoutDescriptor, { kind: 'circle' }>,
  outer: number,
  back: number,
  material: THREE.Material,
  geometries: THREE.BufferGeometry[],
  group: THREE.Group,
): void {
  const [cx, cz] = cutout.centerXZ;
  const { radius } = cutout;

  // Strictly-interior invariant: circle's bounding rect fits inside outer
  // rect. The outer X extents are symmetric `±outer`; the outer Z extents
  // are asymmetric `[-outer - back, +outer]` (v3 back-extension). The
  // `>=` (not `>`) is load-bearing — equality means the hole vertex is
  // shared with the outer contour at the tangent point, which earcut
  // treats as degenerate (zero-area triangles / undefined tessellation).
  // The v1 roundtable on #238 caught this as a three-way convergent HIGH.
  if (
    Math.abs(cx) + radius >= outer ||
    cz + radius >= outer ||
    cz - radius <= -outer - back
  ) {
    throw new Error(
      `createStageFloor: circle cutout must be strictly interior to outer ` +
        `(cx=${cx}, cz=${cz}, r=${radius}; outer=${outer}, back=${back}; ` +
        `X: |cx|+r=${Math.abs(cx) + radius} vs outer; ` +
        `front: cz+r=${cz + radius} vs outer; ` +
        `back: cz-r=${cz - radius} vs -outer-back=${-outer - back}). ` +
        `Boundary tangency degenerates earcut. Use 'kind: rect' for ` +
        `boundary-exceeding cutouts, or expand outerHalfExtent / backExtension.`,
    );
  }

  // Build the floor as a ShapeGeometry with a circular hole. The shape is
  // constructed in local-XY (Z = 0) and then rotated `-π/2` about world-X
  // to lie on the floor plane. The rotation maps local +Y to world −Z, so
  // a cutout centered at world `(cx, cz)` maps to local-XY `(cx, -cz)`.
  // World-Z range `[-outer-back, +outer]` maps to local-Y `[-outer, +outer+back]`.
  // X is symmetric and needs no sign-flip.
  const localYMin = -outer; // world-Z = +outer
  const localYMax = outer + back; // world-Z = -outer - back
  const shape = new THREE.Shape();
  shape.moveTo(-outer, localYMin);
  shape.lineTo(outer, localYMin);
  shape.lineTo(outer, localYMax);
  shape.lineTo(-outer, localYMax);
  shape.closePath(); // CCW outer

  // Sign-flip: world-Z = cz → local-Y = -cz. `clockwise: true` produces a
  // CW hole; `ShapeGeometry.addShape` auto-normalizes winding either way
  // but passing the intended convention directly matches earcut's
  // documented expectations and reads more clearly to future maintainers.
  const hole = new THREE.Path();
  hole.absarc(cx, -cz, radius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new THREE.ShapeGeometry(shape);
  geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  group.add(mesh);
}
