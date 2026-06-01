// ReadoutPost — thin cylindrical stem mounting a readout panel to the
// plinth working surface (#286 / two-slot architecture). Each cluster
// scene registers two plinth slots per readout:
//
//   1. A `'surface'`-oriented post slot at slot-Z = 0. The post sits
//      flat on the working surface and extends along surface-normal
//      (= slot-local +Z) for READOUT_POST_LENGTH. No faceCamera; the
//      slot's 'surface' orientation is load-bearing — it stays
//      statically tilted with the desk.
//   2. The existing readout slot at slot-Z = READOUT_POST_LENGTH —
//      `computePlinthSlotTransform` lifts the readout group origin
//      off the working surface by that distance along surface-normal,
//      placing it at the post tip. The readout's `faceCamera`
//      continues to overwrite group rotation with world-Y yaw every
//      frame — unchanged from today.
//
// The post is purely visual signaling that the readout is mounted on
// the plinth, NOT a kinematic element. Panel yaws independently around
// the lifted slot point; post stays static. The panel's offset from
// the slot point (8 mm in group-local -Z) means the panel center
// orbits the post tip on an 8 mm circle in world XZ as yaw varies —
// visually invisible at panel scale (half-widths 0.20–0.38 m).
//
// Why not in scaffold/staging — the post is semantically a readout-
// mounting element, composing with the readout's group rather than the
// stage furniture. Same module home as PanelReadout; no cross-layer
// imports needed (color + dimension tokens all in readoutTokens.ts).
//
// Lifecycle (mirrors StageFloor / StageRailing / ContrastPit):
// exhibit-owned. Scene mount allocates via `createReadoutPost()`,
// passes the handles into the plinth slot manifest. Scene unmount
// disposes via `ownedDisposables`. Plinth removal in
// shell.ts:471–472 takes the group with it.

import * as THREE from 'three';
import {
  READOUT_POST_COLOR_RGB,
  READOUT_POST_LENGTH,
  READOUT_POST_RADIUS,
} from './readoutTokens';

export interface ReadoutPostHandles {
  /** Add to a plinth slot at the readout's XY with slot-Z = 0 and
   *  `orientation: 'surface'`. The mesh sits flat on the working
   *  surface and extends along surface-normal for
   *  READOUT_POST_LENGTH. */
  readonly group: THREE.Group;
  /** Idempotent. Disposes the cylinder geometry + material. */
  dispose(): void;
}

export function createReadoutPost(): ReadoutPostHandles {
  const group = new THREE.Group();
  group.name = 'readout-post';

  // CylinderGeometry is Y-aligned by default (height axis = +Y). The
  // post sits in a 'surface'-oriented slot where slot-local +Z =
  // surface normal. Rotate the mesh by π/2 about local +X so the
  // cylinder's height axis maps from local +Y to local +Z. Then
  // translate by +READOUT_POST_LENGTH/2 along local +Z so the mesh
  // extends from local (0, 0, 0) (surface plane) to local
  // (0, 0, READOUT_POST_LENGTH) (post tip).
  const geometry = new THREE.CylinderGeometry(
    READOUT_POST_RADIUS,
    READOUT_POST_RADIUS,
    READOUT_POST_LENGTH,
    12,
    1,
  );
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...READOUT_POST_COLOR_RGB),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'readout-post-cylinder';
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = READOUT_POST_LENGTH / 2;
  group.add(mesh);

  let disposed = false;
  return {
    group,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
    },
  };
}
