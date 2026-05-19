import * as THREE from 'three';
import type { StageCutoutDescriptor } from './StageFloor';

// Sub-floor "vantablack" contrast pit for the v1.0 staged-exhibit
// vocabulary (#224 / E1.3, PR #245 smoke iter 5). A pure-black box
// directly BELOW the StageFloor cutout: looking down through the
// cutout (where the math surface dips) reveals purposeful pure
// black, maximising surface contrast, while at eye level / above
// only the near-black background skybox shows ("obscures the
// skybox only in the downward direction" — Brad's clarification).
//
// EXHIBIT-OWNED, per-scene — same ownership + lifecycle as
// StageFloor / StageRailing / StageInnerRailing (allocated in
// `mount`, disposed in `unmount`). It was briefly a single
// shell-owned box folded into Environment, but PR #245 smoke
// surfaced that one uniformly-sized box cannot be both contained
// under tangent-planes' shallow floor (back edge world Z = −6, no
// backExtension) AND cover quadrics' deep cutout (reaches world
// Z ≈ −7.7). Sizing the pit to **each scene's own cutout
// footprint** resolves it by construction: the pit is exactly the
// hole, so it always covers the cutout and is always contained
// wherever the cutout is (the cluster's cutouts are within their
// floors by StageFloor's own clamp/interior invariants).
//
// Pass the SAME `StageCutoutDescriptor` the scene gives
// `createStageFloor`. Rect → rect pit; circle → the circle's
// bounding-box rect pit (the opaque floor hides the corners; only
// the circular hole is seen). 5 faces — bottom + 4 walls, OPEN
// TOP: the StageFloor + its cutout are the lid you peer down
// through. Walls run from just below the floor down `depth`.
//
// Three.js export discipline (v1.0.md §4 / feedback_threejs_token_
// exports_immutable): colour is an immutable RGB tuple + factory.

/** Pure black, on purpose ("vantablack"). Tuple+factory per the
 *  export discipline even though it's 0,0,0. */
export const CONTRAST_PIT_COLOR_RGB = [0, 0, 0] as const;

/** Pit floor depth below `topY`, world units. Clears the deepest
 *  cluster dip (quadrics' cube bottom at world-Y ≈ −2) with margin.
 *  First-pass smoke-tunable (feedback_staging_dimensions_first_pass). */
export const CONTRAST_PIT_DEPTH_DEFAULT = 3;

/** Pit top, world Y. A hair below the StageFloor (Y = 0) so the
 *  open top never z-fights the floor. */
export const CONTRAST_PIT_TOP_Y_DEFAULT = -0.02;

export interface ContrastPitOptions {
  /** The SAME cutout the scene passes to `createStageFloor`. */
  readonly cutout: StageCutoutDescriptor;
  /** Floor-to-pit-bottom depth. Default `CONTRAST_PIT_DEPTH_DEFAULT`. */
  readonly depth?: number;
  /** Pit top, world Y. Default `CONTRAST_PIT_TOP_Y_DEFAULT`. */
  readonly topY?: number;
}

export interface ContrastPitHandles {
  /** Add to the exhibit's group at mount time. */
  readonly group: THREE.Group;
  /** Disposes owned geometries + material. Exhibit calls in unmount(). */
  dispose(): void;
}

/** Half-extents of the pit's XZ footprint, derived from the cutout. */
function footprint(cutout: StageCutoutDescriptor): {
  cx: number;
  cz: number;
  halfX: number;
  halfZ: number;
} {
  const [cx, cz] = cutout.centerXZ;
  if (cutout.kind === 'rect') {
    return { cx, cz, halfX: cutout.halfExtentX, halfZ: cutout.halfExtentZ };
  }
  // circle → bounding-box rect (radius on each axis); the opaque
  // floor hides the corners, only the circular hole is seen.
  return { cx, cz, halfX: cutout.radius, halfZ: cutout.radius };
}

export function createContrastPit(
  opts: ContrastPitOptions,
): ContrastPitHandles {
  const { cx, cz, halfX, halfZ } = footprint(opts.cutout);
  const depth = opts.depth ?? CONTRAST_PIT_DEPTH_DEFAULT;
  const topY = opts.topY ?? CONTRAST_PIT_TOP_Y_DEFAULT;
  const botY = topY - depth;
  const midY = topY - depth / 2;

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(...CONTRAST_PIT_COLOR_RGB),
    side: THREE.DoubleSide,
    fog: false,
  });
  const geometries: THREE.PlaneGeometry[] = [];
  const group = new THREE.Group();
  group.name = 'contrast-pit';

  // Per-face geometry (sizes differ), one shared material — the
  // StageFloor shared-material pattern. PlaneGeometry default lies
  // in XY (normal +Z); rotate to seat each face.
  const addFace = (
    w: number,
    h: number,
    pos: readonly [number, number, number],
    rot: readonly [number, number, number],
  ): void => {
    const g = new THREE.PlaneGeometry(w, h);
    geometries.push(g);
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.name = 'contrast-pit-face';
    group.add(mesh);
  };

  // bottom carpet — horizontal, full footprint.
  addFace(2 * halfX, 2 * halfZ, [cx, botY, cz], [-Math.PI / 2, 0, 0]);
  // ±Z walls — span X × depth.
  addFace(2 * halfX, depth, [cx, midY, cz + halfZ], [0, 0, 0]); // +Z (user)
  addFace(2 * halfX, depth, [cx, midY, cz - halfZ], [0, 0, 0]); // −Z (back)
  // ±X walls — span Z × depth.
  addFace(2 * halfZ, depth, [cx + halfX, midY, cz], [0, Math.PI / 2, 0]);
  addFace(2 * halfZ, depth, [cx - halfX, midY, cz], [0, Math.PI / 2, 0]);
  // Open top — the StageFloor cutout is the lid.

  let disposed = false;
  return {
    group,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      material.dispose();
      for (const g of geometries) g.dispose();
      geometries.length = 0;
    },
  };
}
