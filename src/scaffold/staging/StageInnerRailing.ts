import * as THREE from 'three';
import {
  STAGE_RAILING_COLOR_RGB,
  STAGE_RAILING_TUBE_RADIUS,
  type StageRailingHandles,
} from '@/scaffold/staging/StageRailing';
import type { StageCutoutDescriptor } from '@/scaffold/staging/StageFloor';

// Cluster-wide INNER railing primitive for the v1.0 staged-exhibit
// vocabulary (#221 / E1.2 / v3 add). Circumscribes the cutout per
// scene — museum "protect the exhibit" framing: keep users from
// stepping into the floor cutout or grabbing at the math surface.
// Brad's PR #244 smoke feedback (item 2) introduced this primitive.
//
// Takes the same `StageCutoutDescriptor` sum type the floor consumes,
// and dispatches by `kind`:
//
// - `kind: 'rect'` — 4 corner posts at the cutout corners + 4 perimeter
//   top-rail tubes. Mirrors `StageRailing`'s geometry pattern; the only
//   difference is the perimeter shape (cutout footprint vs. outer rect)
//   and the orientation of the tubes (cutout's halfExtentX/Z drive the
//   tube lengths, not the floor's outerHalfExtent).
// - `kind: 'circle'` — N evenly-spaced posts around the circumference
//   + 1 TorusGeometry top-rail. The torus is a single curved geometry
//   instance; piecewise CylinderGeometry segments would multiply
//   geometry / dispose surface for no visual gain.
//
// Cluster-uniform visual vocabulary with the outer railing: same color,
// same POST_HEIGHT, same POST_RADIUS, same STAGE_RAILING_TUBE_RADIUS.
// The inner is recognized by *where it is* (around the cutout, not the perimeter),
// not by being a different visual material. Color and palette tokens
// are shared with `StageRailing` via import.
//
// Input-inertness: same as the outer railing. The cluster has no
// scene-traversal raycasters (see `StageRailing.ts` header for sources);
// inner railing meshes are invisible to all picking systems by
// construction.
//
// Ownership: exhibit-owned per `v1.0.md` §4. Same lifecycle as
// `createStageRailing` — `mount()` calls the factory; `unmount()` calls
// `dispose()`.

const POST_HEIGHT = 0.9;
const POST_RADIUS = 0.04;
const CIRCLE_POST_COUNT = 8;
const TORUS_RADIAL_SEGMENTS = 8;
const TORUS_TUBULAR_SEGMENTS = 32;

export interface StageInnerRailingOptions {
  /**
   * Cutout descriptor — same sum type the floor consumes. Each scene
   * typically passes the same descriptor it passed to `createStageFloor`.
   */
  readonly cutout: StageCutoutDescriptor;
}

// Re-export the outer-railing handle shape — public surface is
// identical (group + dispose), so a separate type would be cosmetic.
export type StageInnerRailingHandles = StageRailingHandles;

export function createStageInnerRailing(
  opts: StageInnerRailingOptions,
): StageInnerRailingHandles {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...STAGE_RAILING_COLOR_RGB),
  });
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  group.name = 'stage-inner-railing';

  if (opts.cutout.kind === 'rect') {
    buildRectInner(opts.cutout, material, geometries, group);
  } else {
    buildCircleInner(opts.cutout, material, geometries, group);
  }

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

function buildRectInner(
  cutout: Extract<StageCutoutDescriptor, { kind: 'rect' }>,
  material: THREE.Material,
  geometries: THREE.BufferGeometry[],
  group: THREE.Group,
): void {
  const [cx, cz] = cutout.centerXZ;
  const { halfExtentX, halfExtentZ } = cutout;

  // 4 corner posts at the cutout corners.
  const postGeom = new THREE.CylinderGeometry(
    POST_RADIUS,
    POST_RADIUS,
    POST_HEIGHT,
    8,
    1,
    true, // openEnded — same rationale as outer railing
  );
  geometries.push(postGeom);
  const corners: readonly (readonly [number, number])[] = [
    [cx - halfExtentX, cz - halfExtentZ],
    [cx + halfExtentX, cz - halfExtentZ],
    [cx + halfExtentX, cz + halfExtentZ],
    [cx - halfExtentX, cz + halfExtentZ],
  ];
  for (const [px, pz] of corners) {
    const post = new THREE.Mesh(postGeom, material);
    post.position.set(px, POST_HEIGHT / 2, pz);
    group.add(post);
  }

  // 4 perimeter top-rail tubes. Front/back span world-X with length
  // 2·halfExtentX; left/right span world-Z with length 2·halfExtentZ.
  // Two CylinderGeometry instances — same X-spanning vs Z-spanning
  // split as the outer railing.
  const tubeGeomXSpan = new THREE.CylinderGeometry(
    STAGE_RAILING_TUBE_RADIUS,
    STAGE_RAILING_TUBE_RADIUS,
    halfExtentX * 2,
    8,
    1,
    true,
  );
  geometries.push(tubeGeomXSpan);
  const tubeGeomZSpan = new THREE.CylinderGeometry(
    STAGE_RAILING_TUBE_RADIUS,
    STAGE_RAILING_TUBE_RADIUS,
    halfExtentZ * 2,
    8,
    1,
    true,
  );
  geometries.push(tubeGeomZSpan);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const addTube = (
    geom: THREE.BufferGeometry,
    midX: number,
    midZ: number,
    sideDirection: THREE.Vector3,
  ): void => {
    const tube = new THREE.Mesh(geom, material);
    tube.position.set(midX, POST_HEIGHT, midZ);
    tube.quaternion.setFromUnitVectors(yAxis, sideDirection);
    group.add(tube);
  };
  addTube(tubeGeomXSpan, cx, cz + halfExtentZ, new THREE.Vector3(1, 0, 0)); // front
  addTube(tubeGeomXSpan, cx, cz - halfExtentZ, new THREE.Vector3(1, 0, 0)); // back
  addTube(tubeGeomZSpan, cx + halfExtentX, cz, new THREE.Vector3(0, 0, 1)); // right
  addTube(tubeGeomZSpan, cx - halfExtentX, cz, new THREE.Vector3(0, 0, 1)); // left
}

function buildCircleInner(
  cutout: Extract<StageCutoutDescriptor, { kind: 'circle' }>,
  material: THREE.Material,
  geometries: THREE.BufferGeometry[],
  group: THREE.Group,
): void {
  const [cx, cz] = cutout.centerXZ;
  const { radius } = cutout;

  // N evenly-spaced posts around the circumference.
  const postGeom = new THREE.CylinderGeometry(
    POST_RADIUS,
    POST_RADIUS,
    POST_HEIGHT,
    8,
    1,
    true,
  );
  geometries.push(postGeom);
  for (let i = 0; i < CIRCLE_POST_COUNT; i++) {
    const angle = (i / CIRCLE_POST_COUNT) * Math.PI * 2;
    const px = cx + radius * Math.cos(angle);
    const pz = cz + radius * Math.sin(angle);
    const post = new THREE.Mesh(postGeom, material);
    post.position.set(px, POST_HEIGHT / 2, pz);
    group.add(post);
  }

  // Top-rail as a single torus. TorusGeometry's default orientation has
  // the ring in the XY plane (axis along +Z). Rotate -π/2 about world-X
  // to lay it in the XZ plane (axis along +Y) — matches the world-up
  // orientation the cutout occupies.
  const torusGeom = new THREE.TorusGeometry(
    radius,
    STAGE_RAILING_TUBE_RADIUS,
    TORUS_RADIAL_SEGMENTS,
    TORUS_TUBULAR_SEGMENTS,
  );
  geometries.push(torusGeom);
  const torus = new THREE.Mesh(torusGeom, material);
  torus.position.set(cx, POST_HEIGHT, cz);
  torus.rotation.x = -Math.PI / 2;
  group.add(torus);
}
