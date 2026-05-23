import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { raySphereHit } from '@/scaffold/ui/rayHit';
import type { Pointer } from '@/shell/Pointer';

// Shared base for the project's tap-button-like primitives — `Preset`
// (#46), `SectionTab` (#57), and `SceneTab` (#150). Owns the bits that
// every variant has had verbatim since first instance: a sphere mesh,
// a yaw-billboarded text label, ray-from-pointer hit-testing, a
// haptic pulse on activation, a press-flash emissive that decays after
// PRESS_FLASH_DURATION_MS, and an optional sticky-active emissive
// layered underneath the press flash.
//
// Lifted out per #156 once the project hit the rule-of-three trigger
// called out across two prior PRs (`SectionTab.ts` for two instances,
// `SceneTab.ts` for three). Each subclass picks its visual identity
// (radius / colors / label size / label placement) via the `visuals`
// option block; the machinery here is identical across all three.
//
// Subclasses are thin: they call `super()` with their visual config
// and add any per-primitive extra fields (e.g., `Preset` carries
// `values` / `linearValues`). The full inherited method set
// (`tryActivate`, `updateHover`, `update`, `faceCamera`, `dispose`,
// `setActive`, `setName`, `isActive`) is available on all three —
// Preset doesn't call sticky-active in practice, and `setActive` is a
// silent visual no-op when `activeEmissive` is omitted from `visuals`
// (the active branch falls through to hover-or-idle).

export interface TapButtonVisuals {
  // Prefix for the THREE.Group.name; the full name is
  // `${groupNamePrefix}:${tap-button name}`. Matches the per-primitive
  // naming the three originals used (`preset:`, `tab:`, `scene-tab:`).
  groupNamePrefix: string;
  buttonRadius: number;
  baseColor: number;
  hoverEmissive: number;
  pressEmissive: number;
  // Sticky-active emissive. Omit for one-shot tap affordances (Preset)
  // — `setActive` still flips the internal flag but the active branch
  // in `refreshButtonEmissive` won't fire, so the visual is unchanged.
  activeEmissive?: number;
  labelFontSize: number;
  // Vertical offset of the label from the button center. Pair with
  // `labelAnchorY`: 'top' anchor + negative offset places the label
  // below; 'bottom' anchor + positive offset places it above.
  labelOffsetY: number;
  labelAnchorY: 'top' | 'bottom';
  // Label-rendering policy (#255 PR2). Default `'face-camera'` —
  // `faceCamera` yaw-billboards the label every frame so text stays
  // facing the user; matches the §225 §3.3 billboarded-primitive
  // carve-out and is desired for mid-air mounts (Preset, SceneTab)
  // where the button group has no surface tilt or is in mid-air
  // above any tilted slab.
  //
  // `'surface'` — used by primitives mounted on a tilted plinth
  // working surface (today: SectionTab). When the button's parent
  // group is rotated by the plinth slot transform to align with
  // the surface (`R_x(-tilt)`), yaw-billboarding the label rotates
  // it about an already-tilted local-Y axis. The result is a
  // compound rotation: label inherits the surface tilt AND yaws
  // about the tilted axis, producing a plane that diverges from
  // both the slab plane and the user-facing plane — text visibly
  // clips into the slab volume from typical viewing angles.
  //
  // `'surface'` resolves this by leaving the label in the button's
  // local frame (identity rotation). The label co-tilts with the
  // slab through the parent group's transform; no plane divergence.
  // Worst-case viewer-relative foreshortening at the plinth's
  // ~20° tilt is ~8% across plausible head poses (per
  // `_private/plans/255-section-tab-anchoring-labels.md` §3.2) —
  // accepted as a legibility cost well below the
  // "facing-but-clipping" alternative.
  //
  // The ctor explicitly sets `label.rotation = (0, 0, 0)` when this
  // is `'surface'`, so the surface-aligned orientation is established
  // at construction (not implicitly via skipped `faceCamera` writes).
  // `faceCamera` early-returns on `'surface'` so per-frame ticks
  // are cheap and don't drift the label off identity.
  labelOrientation?: 'face-camera' | 'surface';
}

export interface TapButtonOptions {
  name: string;
  // Ray–button hit-test sphere radius is `buttonRadius *
  // grabRadiusMultiplier`. Required so each scene declares the
  // affordance scale rather than inheriting a primitive-internal
  // default; quadrics passes 2.75 across its rack so Slider /
  // Preset / SectionTab / SceneTab all share the same feel.
  grabRadiusMultiplier: number;
  visuals: TapButtonVisuals;
}

const HAPTIC_AMPLITUDE = 0.5;
const HAPTIC_DURATION_MS = 10;

// Momentary press flash duration. Long enough to register as feedback,
// short enough not to read as a sticky toggle.
const PRESS_FLASH_DURATION_MS = 150;

const LABEL_COLOR = 0xffffff;
const LABEL_OUTLINE_WIDTH = '8%';
const LABEL_OUTLINE_COLOR = 0x000000;

// Standoff (in label-local +Z, meters) applied to surface-oriented
// labels (#255 PR2 smoke follow-up). Without this, the text quad sits
// at z = 0 in button-local — and because the button group is rotated
// by the plinth slot's `R_x(-tilt)`, that's coplanar with the slab
// top face in slot-local Z. A static camera renders cleanly, but
// per-pixel depth-buffer comparisons flip under camera rotation and
// produce a z-fight aliasing / shimmer that reads as the label
// "clipping into the plinth." Lifting 1 mm in button-local +Z
// (= surface-normal direction in plinth-local after the parent
// rotation) sits the label JUST in front of the slab and resolves the
// z-fight. 1 mm is well below the pixel size of a Quest 3S panel at
// arm's-length viewing distance (~0.7 m), so the gap is not visible.
// Bracket [0.0005, 0.003] if further tuning is needed (one dial per
// round, per `feedback_binary_search_visual_constants`).
const SURFACE_LABEL_STANDOFF_M = 0.001;

export class TapButton {
  readonly group: THREE.Group;
  readonly name: string;

  private readonly grabRadiusMultiplier: number;
  private readonly buttonRadius: number;
  private readonly hoverEmissive: number;
  private readonly pressEmissive: number;
  private readonly activeEmissive: number | undefined;
  private readonly labelOrientation: 'face-camera' | 'surface';

  private readonly button: THREE.Mesh;
  private readonly label: Text;
  private readonly buttonWorld = new THREE.Vector3();
  private readonly camWorld = new THREE.Vector3();
  private readonly labelWorld = new THREE.Vector3();
  // Ray-sphere hit-test scratches (allocated once per TapButton).
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();

  private hovered = false;
  private active = false;
  private pressedUntilMs = 0;

  constructor(opts: TapButtonOptions) {
    this.name = opts.name;
    this.grabRadiusMultiplier = opts.grabRadiusMultiplier;
    this.buttonRadius = opts.visuals.buttonRadius;
    this.hoverEmissive = opts.visuals.hoverEmissive;
    this.pressEmissive = opts.visuals.pressEmissive;
    this.activeEmissive = opts.visuals.activeEmissive;
    this.labelOrientation = opts.visuals.labelOrientation ?? 'face-camera';

    this.group = new THREE.Group();
    this.group.name = `${opts.visuals.groupNamePrefix}:${opts.name}`;

    this.button = new THREE.Mesh(
      new THREE.SphereGeometry(this.buttonRadius, 16, 12),
      new THREE.MeshStandardMaterial({ color: opts.visuals.baseColor }),
    );
    this.group.add(this.button);

    this.label = new Text();
    this.label.text = opts.name;
    this.label.fontSize = opts.visuals.labelFontSize;
    this.label.color = LABEL_COLOR;
    this.label.anchorX = 'center';
    this.label.anchorY = opts.visuals.labelAnchorY;
    this.label.outlineWidth = LABEL_OUTLINE_WIDTH;
    this.label.outlineColor = LABEL_OUTLINE_COLOR;
    this.label.position.set(0, opts.visuals.labelOffsetY, 0);
    // Establish surface-aligned orientation at construction (not
    // implicitly via skipped `faceCamera` writes). troika's `Text` ctor
    // defaults rotation to identity, but writing it explicitly closes
    // the convergent C1 + C2 finding window from the #255 roundtable:
    // tests can verify identity directly (via the non-identity StubText
    // default in TapButton.test.ts), and a future runtime switch from
    // 'face-camera' to 'surface' won't strand the label at a stale
    // yaw-billboard rotation.
    //
    // Also lift the label off the slab by SURFACE_LABEL_STANDOFF_M in
    // label-local +Z (#255 PR2 smoke follow-up). The label is coplanar
    // with the slab top face without this lift — see the constant's
    // doc comment for the z-fight rationale.
    if (this.labelOrientation === 'surface') {
      this.label.rotation.set(0, 0, 0);
      this.label.position.z = SURFACE_LABEL_STANDOFF_M;
    }
    this.label.sync();
    this.group.add(this.label);
  }

  // Gated on `activeEmissive` so one-shot tap affordances (Preset, which
  // omits `activeEmissive` from its visuals) can never report a sticky-
  // active state — `setActive(true)` flips the internal flag but the
  // emissive priority skips the active branch, so externally there is
  // nothing "active" to report. Tightens the API/visual contract: if the
  // button can't *show* active, it can't *be* active.
  get isActive(): boolean {
    return this.active && this.activeEmissive !== undefined;
  }

  // True while any pointer's ray is within the hit-test sphere. Exposed
  // for tests (and would-be debug overlays); the emissive material change
  // is the user-facing signal.
  get isHovered(): boolean {
    return this.hovered;
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.refreshButtonEmissive();
  }

  // Dynamic label update — used by the canonical-forms heading's
  // chevron flip on expand / collapse (#93). Issues a troika sync;
  // the cost is a one-frame text re-layout, fine on a press cadence.
  setName(name: string): void {
    if (this.label.text === name) return;
    this.label.text = name;
    this.label.sync();
  }

  /**
   * Test whether `pointer`'s ray hits the button. On hit, fire haptics,
   * kick off the press flash, and return true. The caller owns any
   * sticky-active bookkeeping (clearing the previously-active peer,
   * setting this one) — keeping the dispatch out here means a button
   * doesn't need a reference to its peers.
   */
  tryActivate(pointer: Pointer): boolean {
    if (!this.rayHitsButton(pointer)) return false;
    this.pressedUntilMs = performance.now() + PRESS_FLASH_DURATION_MS;
    this.refreshButtonEmissive();
    pointer.pulse(HAPTIC_AMPLITUDE, HAPTIC_DURATION_MS);
    return true;
  }

  updateHover(pointers: readonly Pointer[]): void {
    const hovered = pointers.some((p) => this.rayHitsButton(p));
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.refreshButtonEmissive();
  }

  /** Per-frame: clears the press flash once its window expires. */
  update(): void {
    if (this.pressedUntilMs > 0 && performance.now() >= this.pressedUntilMs) {
      this.pressedUntilMs = 0;
      this.refreshButtonEmissive();
    }
  }

  // Yaw-only billboard for the text label, matching the family / per-
  // slider labels — head pitch and roll stay out (#29).
  //
  // Early-return on `labelOrientation === 'surface'` (#255 PR2): the
  // label was identity-set at construction and is meant to inherit the
  // parent group's surface tilt unmodified. Per-frame ticks stay
  // symmetric — consumers dispatch `faceCamera` on every TapButton
  // regardless of orientation; the branch just becomes a cheap no-op.
  faceCamera(camera: THREE.Camera): void {
    if (this.labelOrientation === 'surface') return;
    camera.getWorldPosition(this.camWorld);
    this.label.getWorldPosition(this.labelWorld);
    const dx = this.camWorld.x - this.labelWorld.x;
    const dz = this.camWorld.z - this.labelWorld.z;
    this.label.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  dispose(): void {
    this.label.dispose();
    this.button.geometry.dispose();
    (this.button.material as THREE.Material).dispose();
  }

  // Emissive priority (highest first): press flash, active, hover, idle.
  // Press flash sits on top of active so the user gets a beat of feedback
  // even when re-tapping the already-active button. When `activeEmissive`
  // is omitted (one-shot tap affordances), the active branch falls
  // through and `setActive(true)` is a visual no-op.
  private refreshButtonEmissive(): void {
    const mat = this.button.material as THREE.MeshStandardMaterial;
    let hex: number;
    if (this.pressedUntilMs > 0) {
      hex = this.pressEmissive;
    } else if (this.active && this.activeEmissive !== undefined) {
      hex = this.activeEmissive;
    } else if (this.hovered) {
      hex = this.hoverEmissive;
    } else {
      hex = 0x000000;
    }
    mat.emissive.setHex(hex);
  }

  private rayHitsButton(pointer: Pointer): boolean {
    pointer.getRayOrigin(this.rayOrigin);
    pointer.getRayDirection(this.rayDirection);
    this.button.getWorldPosition(this.buttonWorld);
    const r = this.buttonRadius * this.grabRadiusMultiplier;
    return raySphereHit(this.rayOrigin, this.rayDirection, this.buttonWorld, r);
  }
}
