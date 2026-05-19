import * as THREE from 'three';

// Cluster-wide illusory railing primitive for the v1.0 staged-exhibit
// vocabulary (#221 / E1.2). Composes against
// `StageFloorHandles.outerHalfExtent` (StageFloor.ts:79); each scene
// calls both factories in mount() and disposes both in unmount(). See
// `_private/plans/223-illusory-railing.md` for the design rationale,
// roundtable findings, and per-scene math-envelope audit.
//
// Geometry: 4 corner posts + 4 perimeter top-rail tubes. All eight
// meshes share a single `MeshStandardMaterial` and two `BufferGeometry`
// instances (one post geometry, one tube geometry). Static — no
// per-frame work.
//
// Tube orientation uses `quaternion.setFromUnitVectors(localY, side)`
// rather than two-axis Euler rotation — the three-way convergent v1
// roundtable HIGH (Sonnet F1 + GPT F5 + DeepSeek F1) flagged that an
// Euler approach with a wrong comment was visually correct but
// fragile under future edits; the quaternion form makes the intent
// (*orient cylinder's local +Y at this world-space side direction*)
// literal in code with no Euler-order mental model required.
//
// Both posts and tubes use `openEnded: true` (GPT F7). The post's
// bottom cap would otherwise sit coplanar with the floor at Y=0
// (z-fighting risk in VR); the tube end caps are structurally
// occluded by the corner posts they meet.
//
// Input-inertness: railing meshes are invisible to the cluster's
// picking systems by construction. Math-object picking uses
// `raycastImplicit` (CPU raymarch against an implicit function), UI
// primitives use analytic `raySphereHit` against known centers, and
// `DesktopPointer.raycaster` only reads `.ray` fields — never calls
// `intersectObjects`. No scene-traversal raycaster exists today, so
// the railing meshes silently stay out of the way.
//
// Visual-only: no physics, no collider, no camera clamp. Pancake
// camera envelope is owned by `cameraControls.ts` (#192); future FPS
// clamp is #242.
//
// Ownership: exhibit-owned per `v1.0.md` §4. Each scene's `mount()`
// calls `createStageRailing()`; `unmount()` calls `dispose()`. The
// shell removes `ctx.group` after `unmount` returns
// (shell.ts:471–472), so `dispose()` only releases owned GPU
// resources; no `scene.remove(...)` calls.

export const STAGE_RAILING_COLOR_RGB = [
  0x3a / 255,
  0x3a / 255,
  0x55 / 255,
] as const;

const POST_HEIGHT = 0.9;
const POST_RADIUS = 0.04;
const TUBE_RADIUS = 0.03;

export interface StageRailingOptions {
  /** Required. Same value the scene passed to `createStageFloor`. */
  readonly outerHalfExtent: number;
}

export interface StageRailingHandles {
  /** Add to the exhibit's group at mount time. */
  readonly group: THREE.Group;
  /** Disposes owned geometries + material. Exhibit calls in unmount(). */
  dispose(): void;
}

export function createStageRailing(
  opts: StageRailingOptions,
): StageRailingHandles {
  const outer = opts.outerHalfExtent;

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...STAGE_RAILING_COLOR_RGB),
  });
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  group.name = 'stage-railing';

  // 4 corner posts. CylinderGeometry default axis is +Y — upright
  // posts need no rotation, just translate so the bottom sits on the
  // floor plane at Y = 0.
  const postGeom = new THREE.CylinderGeometry(
    POST_RADIUS,
    POST_RADIUS,
    POST_HEIGHT,
    8,
    1,
    true, // openEnded — bottom cap would be coplanar with floor
  );
  geometries.push(postGeom);
  const postCorners: readonly (readonly [number, number])[] = [
    [-outer, -outer],
    [outer, -outer],
    [outer, outer],
    [-outer, outer],
  ];
  for (const [px, pz] of postCorners) {
    const post = new THREE.Mesh(postGeom, material);
    post.position.set(px, POST_HEIGHT / 2, pz);
    group.add(post);
  }

  // 4 perimeter top-rail tubes. Tube center sits at Y = POST_HEIGHT,
  // so the rail centerline rests at post-cap height (rail top at
  // POST_HEIGHT + TUBE_RADIUS, slightly overhanging post tops — the
  // standard museum top-rail-on-post geometry). Local +Y is the
  // cylinder's long axis; the quaternion orients it along the side.
  const sideLength = outer * 2;
  const tubeGeom = new THREE.CylinderGeometry(
    TUBE_RADIUS,
    TUBE_RADIUS,
    sideLength,
    8,
    1,
    true, // openEnded — end caps occluded by corner posts
  );
  geometries.push(tubeGeom);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const addTube = (
    midX: number,
    midZ: number,
    sideDirection: THREE.Vector3,
  ): void => {
    const tube = new THREE.Mesh(tubeGeom, material);
    tube.position.set(midX, POST_HEIGHT, midZ);
    tube.quaternion.setFromUnitVectors(yAxis, sideDirection);
    group.add(tube);
  };
  addTube(0, outer, new THREE.Vector3(1, 0, 0)); // front (z=+outer), spans X
  addTube(0, -outer, new THREE.Vector3(1, 0, 0)); // back (z=-outer), spans X
  addTube(outer, 0, new THREE.Vector3(0, 0, 1)); // right (x=+outer), spans Z
  addTube(-outer, 0, new THREE.Vector3(0, 0, 1)); // left (x=-outer), spans Z

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
