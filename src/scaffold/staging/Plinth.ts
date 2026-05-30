import * as THREE from 'three';

// Cluster-wide control-plinth primitive for the v1.0 staged-exhibit
// vocabulary (#225 / E1.4). Drafting-table-console silhouette: a
// vertical body from the floor up to a working-surface front edge,
// with a tilted (~20°) rectangular slab on top forming the working
// surface. Hosts the cluster's interactive UI (sliders, presets,
// section tabs, readouts, axis indicator) via a declarative slot
// manifest passed at construction.
//
// Coordinate frames (locked at sub-epic level — see
// `_private/plans/225-control-plinth.md` §3.2.1):
//
//   PLINTH-LOCAL FRAME — origin at `anchorWorldXYZ`, axes aligned with
//   world XYZ. +X right, +Y up, +Z toward the user. The plinth.group's
//   local transform writes `anchorWorldXYZ` into its `.position`, so
//   slot targets reparented under plinth.group have `.position`
//   coordinates expressed in this frame.
//
//   SLOT-LOCAL FRAME — origin at the working surface FRONT EDGE
//   CENTER, directly above the floor anchor by
//   `workingSurfaceHeightFromFloor`. Rotated by `-tilt` radians about
//   world +X relative to plinth-local. Slot +X = right along the
//   surface (= world +X). Slot +Y = up the tilted face toward the
//   back of the surface (= plinth-local `(0, cos(tilt), -sin(tilt))`,
//   i.e., up-and-away-from-user). Slot +Z = surface normal toward the
//   user side (= plinth-local `(0, sin(tilt), cos(tilt))`).
//
// Tilt convention: front edge low and toward user (+Z), back edge
// high and away from user (−Z). The rotation that takes slot-local
// +Y to plinth-local +Y-and-toward-back is `R_x(-tilt)`, which is
// what `computePlinthSlotTransform` composes.
//
// Slot model (§3.3 — three-way roundtable convergence on default
// rotation, plus the reparenting model from GPT #2):
//   • Each PlinthSlot declares an `id` (uniqueness-validated),
//     `target: THREE.Group`, `localXYZ` in slot-local frame, and an
//     orientation policy.
//   • createPlinth REPARENTS each `target` under `plinth.group` at
//     construction. Callers MUST NOT add `target` to `ctx.group`
//     before passing it in (createPlinth throws on
//     double-parenting). `target.position` is plinth-local by
//     construction; Three.js's parent-local composition then picks
//     up any non-identity ancestor transform automatically (the
//     "non-identity parent" test verifies this).
//   • Orientation modes: `'surface'` (default — slot rotation matches
//     the tilted surface normal), `'world'` (identity — keeps the
//     group world-aligned regardless of plinth tilt, used by
//     WorldAxes so the math-frame indicator reads in the math frame
//     rather than the tabletop frame), `'custom'` (caller supplies
//     `localRotation` in slot-local frame; composed onto the surface
//     base).
//
// Slot orientation is mechanically applied at construction; callers
// that later write `group.rotation` / `group.quaternion` override it.
// The four readout classes do this every frame via `faceCamera`,
// which yaw-billboards them toward the camera. Per-slider value
// `Label`s in the cluster scenes intentionally do NOT call
// `Label.faceCamera` as of #280 — they remain surface-locked through
// the slot's default `'surface'` orientation, matching the
// `SectionTab` vocabulary landed in #255. `rackLabel` in quadrics is
// the one remaining `Label.faceCamera` in-tree caller; consolidating
// its rendering is deferred to #270 (which should be scoped to
// include it alongside the readout family).
//
// Plinth-mounted per-slider value labels also receive a 1 mm
// `slot.localXYZ[2]` standoff applied at the consumer site to
// resolve coplanar z-fighting against the slab top face. This
// mirrors `SectionTab`'s `SURFACE_LABEL_STANDOFF_M`
// (`TapButton.ts:104–118`).
//
// Surface-tilted tap-affordance opt-out (#255 PR2). TapButton-based
// primitives (Preset / SectionTab / SceneTab) also use `faceCamera`
// to yaw-billboard their text label, but the body's mesh itself is
// NOT billboarded — it inherits the slot rotation cleanly. When
// such a button is mounted on the tilted working surface (today:
// SectionTab specifically, via its module-level VISUALS const), the
// label's yaw-billboard combines with the parent's surface tilt to
// produce a compound rotation that diverges from BOTH the slab
// plane and the user-facing plane — text visibly clips into the
// slab volume. TapButtonVisuals' `labelOrientation: 'surface'` opts
// the label OUT of the yaw-billboard (early-returns from
// `faceCamera`) so the label stays at identity in the button's
// local frame and co-tilts with the slab cleanly. See
// `_private/plans/255-section-tab-anchoring-labels.md` for the
// design and the viewer-relative legibility analysis (~8% worst-
// case foreshortening at the plinth's ~20° tilt — accepted).
//
// Ownership (matches StageFloor / StageRailing / StageInnerRailing /
// ContrastPit — exhibit-owned, per the cluster's established staging
// convention). Allocated in `mount`, disposed in `unmount`. The shell
// removes `ctx.group` after `unmount` returns (`shell.ts:471–472`);
// `dispose()` only releases owned GPU resources (plinth mesh geo +
// material). The slotted UI primitives are NOT disposed by the
// plinth — they're owned by the exhibit, which disposes them via its
// own named-handle blocks.
//
// Three.js export discipline (v1.0.md §4 / feedback_threejs_token_
// exports_immutable): colour is an immutable RGB tuple +
// MeshStandardMaterial factory at construction; dimension constants
// are first-pass smoke-tunable (feedback_staging_dimensions_first_
// pass) with explicit brackets in their doc comments.

/** Plinth body / surface colour. Slightly warmer + brighter than
 *  STAGE_FLOOR_COLOR_RGB so the plinth reads as distinct furniture
 *  against the floor. First-pass smoke-tunable. */
export const PLINTH_BASE_COLOR_RGB = [
  0x40 / 255,
  0x38 / 255,
  0x44 / 255,
] as const;

/** Working-surface width in meters (X-extent of the angled top).
 *  First-pass — quadrics' 4-sliders + preset grid + section tabs
 *  drive the worst case at this width. Bracket [0.7, 1.1]; smoke-
 *  driven retune in PR4 (E1.4e). */
export const PLINTH_WORKING_WIDTH_DEFAULT = 0.9;

/** Working-surface depth in slot-local +Y (front edge → back edge
 *  along the tilted face), meters. Bracket [0.4, 0.7]; smoke-driven
 *  retune in PR4. Note: "height" here is slot-local Y, which is
 *  "depth" of the angled top in world XZ projection — see file-top
 *  coordinate-frame comment. */
export const PLINTH_WORKING_HEIGHT_DEFAULT = 0.5;

/** Working-surface tilt, radians from horizontal toward user. ~20°
 *  reads as drafting-table without being so steep that vertical
 *  text on the surface foreshortens hard. Bracket [15°, 25°];
 *  smoke-driven retune in PR4. */
export const PLINTH_TILT_DEFAULT = (20 * Math.PI) / 180;

/** Front-edge height above floor, meters (~waist-height for a
 *  standing user). Bracket [0.85, 1.05]; smoke-driven retune in PR4.
 *  The back edge sits higher by `workingSurfaceHeight * cos(tilt)`
 *  — for the defaults that's ~0.95 + 0.5 * cos(20°) ≈ 1.42 m, which
 *  must stay below the camera-to-SURFACE_CENTER line (y = 1.5 at
 *  pancake default) to avoid occluding the math object. The PR1
 *  anchor-constraint check in §4.1 verifies this. */
export const PLINTH_WORKING_HEIGHT_FROM_FLOOR_DEFAULT = 0.95;

/** Body depth in plinth-local +Z (the user-facing front face sits at
 *  z = 0; the body extends back to z = −PLINTH_BODY_DEPTH). Body is
 *  centered on the working-surface horizontal projection (about
 *  workingSurfaceHeight * sin(tilt) ≈ 0.17 m at defaults) plus visual
 *  breathing room. Exported as of #263 so `clusterStagePose` can derive
 *  each scene's plinth-anchor Z from the cutout's railing-front face. */
export const PLINTH_BODY_DEPTH = 0.3;

/** Working-surface slab thickness in slot-local +Z (slab extends
 *  from z = 0 down to z = −PLINTH_SLAB_THICKNESS in slot-local).
 *  Thin enough to read as "a tabletop" rather than "a slab" at
 *  normal viewing distance. */
const PLINTH_SLAB_THICKNESS = 0.025;

/**
 * Orientation policy for a plinth slot's target group.
 *
 * - `'surface'` (default) — align the target to the tilted working
 *   surface normal. Sliders / TapButtons get plinth-owned rotation
 *   cleanly because they never write `group.rotation` themselves.
 * - `'world'` — keep the target world-aligned regardless of tilt.
 *   Used by WorldAxes so the math-frame indicator reads as math-
 *   frame, not tabletop-frame.
 * - `'custom'` — caller supplies `localRotation` (in slot-local
 *   frame); composed onto the surface-tilt base.
 *
 * Note: slot orientation is mechanically applied at construction;
 * callers that later write `group.rotation` / `group.quaternion`
 * override it. The four readout classes do this every frame via
 * `faceCamera`. Per-slider value `Label`s in the cluster scenes
 * intentionally do NOT call `Label.faceCamera` as of #280 and remain
 * surface-locked through this slot orientation. `rackLabel` in
 * quadrics is the one remaining `Label.faceCamera` in-tree caller
 * (deferred to #270). See file-top comment for the consumer-side
 * z-standoff convention applied to surface-locked labels.
 *
 * Note: TapButton-based primitives (Preset / SectionTab / SceneTab)
 * inherit the slot rotation on their button bodies cleanly, but
 * their text labels yaw-billboard via `faceCamera`. Their
 * `TapButtonVisuals.labelOrientation: 'surface'` opts the LABEL
 * (not the body) out of yaw-billboard for surface-mounted mounts
 * where the compound rotation would clip text into the slab. See
 * file-top "Surface-tilted tap-affordance opt-out" comment.
 */
export type SlotOrientation = 'surface' | 'world' | 'custom';

export interface PlinthSlot {
  /** Required unique identifier within this plinth instance. Used
   *  for test + debug assertions; createPlinth throws on duplicate. */
  readonly id: string;
  /** Group whose `.position` (and `.quaternion`, for non-billboarded
   *  primitives) the plinth writes at construction. The plinth
   *  REPARENTS this group under `plinth.group`; callers MUST NOT
   *  add it to `ctx.group` before passing it in. */
  readonly target: THREE.Group;
  /** Slot position in slot-local frame (origin at working-surface
   *  front-edge center, +X right, +Y up the tilted face toward the
   *  back, +Z out from the face along the surface normal). */
  readonly localXYZ: readonly [number, number, number];
  /** Default `'surface'`. See `SlotOrientation`. */
  readonly orientation?: SlotOrientation;
  /** Required iff `orientation === 'custom'`. In slot-local frame. */
  readonly localRotation?: THREE.Euler;
  /** Optional cosmetic name for chrome://inspect debugging only.
   *  NOT used for lookup; uniqueness not validated. */
  readonly debugName?: string;
}

export interface PlinthOptions {
  /** Floor-footprint center, in plinth.group's parent frame (world
   *  for the cluster's identity-transform ctx.group). +Y must be 0
   *  for the plinth to sit on the floor; non-zero +Y values are
   *  accepted for tests with non-identity ancestors. */
  readonly anchorWorldXYZ: readonly [number, number, number];
  /** Declarative slot manifest. Plinth reparents each target under
   *  plinth.group at construction. */
  readonly slots: readonly PlinthSlot[];
  /** Default `PLINTH_WORKING_WIDTH_DEFAULT`. */
  readonly workingSurfaceWidth?: number;
  /** Default `PLINTH_WORKING_HEIGHT_DEFAULT`. */
  readonly workingSurfaceHeight?: number;
  /** Default `PLINTH_TILT_DEFAULT`. */
  readonly tilt?: number;
  /** Default `PLINTH_WORKING_HEIGHT_FROM_FLOOR_DEFAULT`. */
  readonly workingSurfaceHeightFromFloor?: number;
}

export interface PlinthHandles {
  /** Add to the exhibit's group at mount time. Parent of every
   *  slotted UI primitive's group + the plinth's own mesh. */
  readonly group: THREE.Group;
  readonly workingSurfaceWidth: number;
  readonly workingSurfaceHeight: number;
  readonly anchorWorldXYZ: readonly [number, number, number];
  /** Idempotent. Disposes plinth mesh geo + material; does NOT
   *  dispose the slotted UI primitives (those are exhibit-owned and
   *  freed by the exhibit's own named-handle blocks). */
  dispose(): void;
}

/**
 * Pure helper composing the slot-local → world transform for one
 * slot. The plinth's createPlinth uses this internally; tests call
 * it directly to verify the coordinate-frame math without any
 * Three.js scene-graph state.
 *
 * Output `worldPosition` is the slot position in plinth.group's
 * parent frame (= absolute world for the cluster's identity-
 * transform ctx.group; the "non-identity parent" test verifies
 * that Three.js's parent composition picks up any ancestor
 * transform automatically when createPlinth applies the result).
 */
export function computePlinthSlotTransform(
  anchorWorldXYZ: readonly [number, number, number],
  tilt: number,
  workingSurfaceHeightFromFloor: number,
  localXYZ: readonly [number, number, number],
  orientation: SlotOrientation = 'surface',
  localRotation?: THREE.Euler,
): { worldPosition: THREE.Vector3; worldRotation: THREE.Quaternion } {
  if (orientation === 'custom' && localRotation === undefined) {
    throw new Error(
      "computePlinthSlotTransform: orientation 'custom' requires localRotation",
    );
  }

  // Slot frame rotation (slot-local → plinth-local): −tilt about
  // world +X. Surface tilts so the back edge is higher and farther
  // from the user; slot-local +Y maps to (0, cos(tilt), −sin(tilt))
  // in plinth-local, which is up-and-back.
  const slotFrameRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -tilt,
  );

  // localXYZ → plinth-local offset from slot-frame origin.
  const localOffsetInPlinth = new THREE.Vector3(...localXYZ).applyQuaternion(
    slotFrameRotation,
  );

  // worldPosition = anchor + (front-edge translation up by working-
  // surface height) + rotated localXYZ.
  const worldPosition = new THREE.Vector3(...anchorWorldXYZ)
    .add(new THREE.Vector3(0, workingSurfaceHeightFromFloor, 0))
    .add(localOffsetInPlinth);

  let worldRotation: THREE.Quaternion;
  switch (orientation) {
    case 'surface':
      worldRotation = slotFrameRotation.clone();
      break;
    case 'world':
      worldRotation = new THREE.Quaternion();
      break;
    case 'custom': {
      // localRotation is expressed in slot-local frame; compose onto
      // the surface-tilt base so the final world rotation is
      // (surface tilt) * (slot-local custom rotation).
      const localRotQ = new THREE.Quaternion().setFromEuler(localRotation!);
      worldRotation = slotFrameRotation.clone().multiply(localRotQ);
      break;
    }
  }

  return { worldPosition, worldRotation };
}

export function createPlinth(opts: PlinthOptions): PlinthHandles {
  const workingSurfaceWidth =
    opts.workingSurfaceWidth ?? PLINTH_WORKING_WIDTH_DEFAULT;
  const workingSurfaceHeight =
    opts.workingSurfaceHeight ?? PLINTH_WORKING_HEIGHT_DEFAULT;
  const tilt = opts.tilt ?? PLINTH_TILT_DEFAULT;
  const workingSurfaceHeightFromFloor =
    opts.workingSurfaceHeightFromFloor ??
    PLINTH_WORKING_HEIGHT_FROM_FLOOR_DEFAULT;
  const anchor = new THREE.Vector3(...opts.anchorWorldXYZ);

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...PLINTH_BASE_COLOR_RGB),
  });

  const group = new THREE.Group();
  group.name = 'plinth';
  // plinth.group's position is the anchor in its parent's frame;
  // slot targets reparented under it then have plinth-local
  // positions naturally, and Three.js composes any non-identity
  // ancestor transform on top.
  group.position.copy(anchor);

  const geometries: THREE.BufferGeometry[] = [];

  // Body — a simple box from the floor (y = 0) up to the working
  // surface front edge (y = workingSurfaceHeightFromFloor), spanning
  // the full working-surface width on X and extending back (−Z) by
  // PLINTH_BODY_DEPTH. The user-facing front face sits at z = 0
  // (same Z as the working surface's front edge in plinth-local).
  // Box geometry is centered on origin, so we offset
  // `body.position` to place the bottom on the floor and the front
  // face at z = 0.
  const bodyGeometry = new THREE.BoxGeometry(
    workingSurfaceWidth,
    workingSurfaceHeightFromFloor,
    PLINTH_BODY_DEPTH,
  );
  geometries.push(bodyGeometry);
  const body = new THREE.Mesh(bodyGeometry, material);
  body.name = 'plinth-body';
  body.position.set(
    0,
    workingSurfaceHeightFromFloor / 2,
    -PLINTH_BODY_DEPTH / 2,
  );
  group.add(body);

  // Working-surface slab. Modelled in slot-local frame via a nested
  // group: slot-frame group sits at (0, workingSurfaceHeightFromFloor,
  // 0) in plinth-local, rotated by −tilt about world +X. The slab
  // mesh inside is centered at slot-local (0, workingSurfaceHeight/2,
  // −PLINTH_SLAB_THICKNESS/2) so the slab extends from the slot-
  // local origin (front-bottom-near edge) back-and-up to (0,
  // workingSurfaceHeight, 0) and "into" the table by the slab
  // thickness. This is purely a visual element of the plinth — slot
  // targets are NOT children of this group (they live directly under
  // plinth.group per the §3.3 reparenting model).
  const slotFrameGroup = new THREE.Group();
  slotFrameGroup.name = 'plinth-slot-frame';
  slotFrameGroup.position.set(0, workingSurfaceHeightFromFloor, 0);
  slotFrameGroup.rotation.set(-tilt, 0, 0);
  group.add(slotFrameGroup);

  const slabGeometry = new THREE.BoxGeometry(
    workingSurfaceWidth,
    workingSurfaceHeight,
    PLINTH_SLAB_THICKNESS,
  );
  geometries.push(slabGeometry);
  const slab = new THREE.Mesh(slabGeometry, material);
  slab.name = 'plinth-slab';
  slab.position.set(0, workingSurfaceHeight / 2, -PLINTH_SLAB_THICKNESS / 2);
  slotFrameGroup.add(slab);

  // Reparent slot targets + apply slot transforms.
  const seenIds = new Set<string>();
  for (const slot of opts.slots) {
    if (seenIds.has(slot.id)) {
      throw new Error(`createPlinth: duplicate slot id '${slot.id}'`);
    }
    seenIds.add(slot.id);

    if (slot.target.parent !== null) {
      throw new Error(
        `createPlinth: slot '${slot.id}' target.group already has a ` +
          `parent — callers must NOT add target.group to ctx.group ` +
          `before passing it to createPlinth. Add plinth.group to ` +
          `ctx.group instead; createPlinth reparents slot targets ` +
          `under plinth.group at construction.`,
      );
    }

    const { worldPosition, worldRotation } = computePlinthSlotTransform(
      opts.anchorWorldXYZ,
      tilt,
      workingSurfaceHeightFromFloor,
      slot.localXYZ,
      slot.orientation ?? 'surface',
      slot.localRotation,
    );

    // target.position is plinth.group-local — Three.js's
    // Object3D.position is parent-local. Subtract the anchor (which
    // is plinth.group.position in its parent's frame) to convert
    // the helper's parent-frame output to plinth.group-local.
    slot.target.position.copy(worldPosition).sub(anchor);
    slot.target.quaternion.copy(worldRotation);
    group.add(slot.target);
  }

  let disposed = false;
  return {
    group,
    workingSurfaceWidth,
    workingSurfaceHeight,
    anchorWorldXYZ: opts.anchorWorldXYZ,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      material.dispose();
      for (const g of geometries) g.dispose();
      geometries.length = 0;
    },
  };
}
