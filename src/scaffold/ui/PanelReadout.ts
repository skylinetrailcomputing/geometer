// PanelReadout — shared base class for the four cluster readouts
// (EquationReadout, TangentPlaneReadout, GradientLevelsReadout,
// SaddleExtremaReadout). Extracted under #225's E1.4c (PR3 of the
// control-plinth sub-epic, issue #252) per the extract-on-Nth-use
// rule (N=4).
//
// Contributes three responsibilities each subclass formerly handled
// itself (identical-by-copy across the four files pre-extraction):
//
//   1. THREE.Group construction + cloak-at-boot (`group.visible =
//      false` until the subclass's first setValues() uncloaks).
//   2. Yaw-only billboard via faceCamera(camera) — `group.rotation`
//      written every frame. Per parent-plan §3.5 v3 lock (option-c),
//      the back-plate inherits this rotation transitively as a child
//      of `group`, so panel + text yaw-billboard together.
//   3. Back-plate slab construction + dispose — a dark MeshBasicMaterial
//      BoxGeometry sized to the subclass-supplied worst-case text
//      bounds + padding, with the front face flush at the subclass's
//      requested z and the slab extruded behind it by
//      READOUT_PANEL_DEPTH (#270 — gives the slab enough depth that
//      yaw-billboard motion reads as a solid screen turning, not a
//      flat decal sliding). Subclass calls createPanel(dims) once
//      during its ctor after laying out text children; subclass's
//      dispose() chains disposePanel() after disposing text children.
//
// What this base does NOT do:
//   - The text children themselves (subclass-specific layouts).
//   - The 33ms-throttle / per-slot string caching path in each
//     subclass's setValues() — that stays in the subclass.
//   - Per-frame back-plate-vs-text bounds-sync. Plan §3.3 amends parent
//     §3.5 v3 to drop per-frame sync in favor of static, em-derived
//     sizing; "breathing" panels as digit counts change read as UX
//     jitter.

import * as THREE from 'three';
import {
  READOUT_PANEL_COLOR_RGB,
  READOUT_PANEL_DEPTH,
} from './readoutTokens';

export interface PanelReadoutPanelDimensions {
  /** Half-width of the back-plate quad in group-local meters. */
  readonly halfWidth: number;
  /** Half-height of the back-plate quad in group-local meters. */
  readonly halfHeight: number;
  /** Group-local (x, y) center of the back-plate. Defaults to (0, 0).
   *  Used when text is offset from group origin. */
  readonly center?: readonly [number, number];
  /** Front-face z (group-local +Z). The slab is extruded BEHIND this
   *  by READOUT_PANEL_DEPTH, so subclasses think in terms of "where
   *  does the screen surface sit" — the depth direction is internal.
   *  Defaults to -0.001 m (text in front of the screen surface). */
  readonly localZ?: number;
}

export abstract class PanelReadout {
  /** Plinth-slot target group. Children: subclass text children +
   *  (after createPanel) the back-plate mesh. Position written by the
   *  plinth slot; rotation overwritten per frame by faceCamera(). */
  readonly group: THREE.Group;

  private panel: THREE.Mesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private readonly camWorld = new THREE.Vector3();
  private readonly groupWorld = new THREE.Vector3();

  protected constructor(groupName: string) {
    this.group = new THREE.Group();
    this.group.name = groupName;
    // Hidden until subclass's first setValues() populates text +
    // uncloaks. Avoids painting empty strings on the first frame.
    this.group.visible = false;
  }

  /** Subclass calls ONCE during ctor, after constructing + positioning
   *  its text children, with worst-case dims derived from the
   *  subclass's own em-width constants × READOUT_FONT_SIZE (see plan
   *  §3.3 methodology). Throws on second call (single-shot guard). */
  protected createPanel(dims: PanelReadoutPanelDimensions): void {
    if (this.panel !== null) {
      throw new Error('PanelReadout.createPanel: already created');
    }
    const geometry = new THREE.BoxGeometry(
      dims.halfWidth * 2,
      dims.halfHeight * 2,
      READOUT_PANEL_DEPTH,
    );
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...READOUT_PANEL_COLOR_RGB),
      depthWrite: true,
      transparent: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Back-plate renders BEFORE text (which has default renderOrder 0).
    // Defensive against three.js's render-order-vs-scene-graph subtlety.
    mesh.renderOrder = -1;
    const [cx, cy] = dims.center ?? [0, 0];
    // dims.localZ is the SCREEN SURFACE z (front face). The slab's
    // center sits half-a-depth behind, so the geometry extends BEHIND
    // the screen surface — front-face position is unchanged from the
    // old PlaneGeometry contract; text stays in front.
    const frontZ = dims.localZ ?? -0.001;
    mesh.position.set(cx, cy, frontZ - READOUT_PANEL_DEPTH / 2);
    this.group.add(mesh);
    this.panel = mesh;
  }

  /** Yaw-only billboard. Per parent-plan §3.5 v3 lock (option-c), the
   *  back-plate (a child of `group`) inherits the rotation
   *  transitively — panel and text yaw-billboard together. */
  faceCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    this.group.getWorldPosition(this.groupWorld);
    const dx = this.camWorld.x - this.groupWorld.x;
    const dz = this.camWorld.z - this.groupWorld.z;
    this.group.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  /** Subclass dispose() MUST call this to clean up the back-plate.
   *  Removes the mesh from the group BEFORE disposing GPU resources —
   *  THREE.js's geometry/material.dispose() frees GPU buffers but does
   *  NOT remove the mesh from its parent. Without the explicit remove,
   *  the dead mesh stays attached and any later render would hit a
   *  "disposed material" WebGL error.
   *
   *  Idempotent: safe to call when createPanel was never invoked, or
   *  when disposePanel was already called.
   *
   *  Post-dispose contract: this PanelReadout instance is UNUSABLE.
   *  Do not call createPanel again. The subclass discards the
   *  instance; the shell tears down ctx.group on unmount. */
  protected disposePanel(): void {
    if (this.panel !== null) {
      this.group.remove(this.panel);
      this.panel.geometry.dispose();
      this.panel.material.dispose();
      this.panel = null;
    }
  }

  abstract dispose(): void;
}
