import * as THREE from 'three';
import { raySphereHit } from '@/scaffold/ui/rayHit';
import type { Pointer } from '@/shell/Pointer';

// Per-axis on/off toggle for the Cross sections slicing rack (#134).
// Sits at the inside end of each cross-section slider's track, lit in
// the slider's axis color when enabled, dim when disabled. Tap to flip.
//
// Kept as a quadrics-internal class rather than a `scaffold/ui/Toggle`
// primitive: the canonical-forms heading chevron is the first grabbable
// boolean affordance in the project (it's a SectionTab repurposed via
// active state + a label flip); this is the second, with a different
// visual idiom (small disk on a slider end). Per #134's design note,
// extraction waits for a third use case.
//
// Conceptually a sibling of SectionTab — same sphere + ray-hit + press-
// flash machinery — but the active state means "this axis renders" and
// the affordance is per-slider rather than per-row, so it doesn't
// share SectionTab's text label or its rack-wide active-clearing rule.

export interface AxisToggleOptions {
  // Axis color when enabled. Matches the slider's baseColor.
  baseColor: number;
  // Ray-hit sphere radius is `TOGGLE_RADIUS * grabRadiusMultiplier`.
  // Required so each scene declares the affordance scale; quadrics
  // passes 2.75 so it matches the rack's slider / preset / tab feel.
  grabRadiusMultiplier: number;
  // Initial enabled state. Defaults to true so the section opens with
  // all three rings visible — the introductory pose from #112.
  initialEnabled?: boolean;
}

// Smaller than the slider thumb (0.025) so the toggle reads as an
// ancillary affordance, not a primary one. Tuned for legibility at
// the rack's ~0.7 m viewing distance.
const TOGGLE_RADIUS = 0.012;

const HAPTIC_AMPLITUDE = 0.5;
const HAPTIC_DURATION_MS = 10;

// Disabled body color — slate-gray, intentionally drained of axis
// color so the off-state reads as "this ring is muted" rather than
// "this ring is colored differently". Matches SectionTab's idle slate
// for a consistent "off / inactive" vocabulary across the rack.
const TOGGLE_DISABLED_COLOR = 0x556677;

// Hover / press / enabled emissive scales, applied to the slider's
// baseColor when enabled. Hover is a soft pre-light; press is the
// brightest flash; enabled is a sustained mid-glow that doubles as
// the at-a-glance "this axis is on" indicator alongside the body
// color. Disabled emissive is 0 — the body slate carries the off
// state on its own.
const TOGGLE_HOVER_SCALE = 0.4;
const TOGGLE_PRESS_SCALE = 0.9;
const TOGGLE_ENABLED_SCALE = 0.5;

const PRESS_FLASH_DURATION_MS = 150;

export class AxisToggle {
  readonly group: THREE.Group;

  private readonly grabRadiusMultiplier: number;
  private readonly mesh: THREE.Mesh;
  private readonly enabledColor: THREE.Color;
  private readonly disabledColor: THREE.Color;
  private readonly hoverEmissive: THREE.Color;
  private readonly pressEmissive: THREE.Color;
  private readonly enabledEmissive: THREE.Color;
  private readonly worldPos = new THREE.Vector3();
  // Ray-sphere hit-test scratches (allocated once per AxisToggle).
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();

  private enabled: boolean;
  private hovered = false;
  private pressedUntilMs = 0;

  constructor(opts: AxisToggleOptions) {
    this.grabRadiusMultiplier = opts.grabRadiusMultiplier;
    this.enabled = opts.initialEnabled ?? true;

    this.group = new THREE.Group();
    this.group.name = 'axis-toggle';

    const base = new THREE.Color(opts.baseColor);
    this.enabledColor = base.clone();
    this.disabledColor = new THREE.Color(TOGGLE_DISABLED_COLOR);
    this.hoverEmissive = base.clone().multiplyScalar(TOGGLE_HOVER_SCALE);
    this.pressEmissive = base.clone().multiplyScalar(TOGGLE_PRESS_SCALE);
    this.enabledEmissive = base.clone().multiplyScalar(TOGGLE_ENABLED_SCALE);

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(TOGGLE_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: this.enabledColor.clone() }),
    );
    this.group.add(this.mesh);

    this.refreshVisual();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  /**
   * Test whether `pointer`'s ray hits the toggle. On hit, flip enabled,
   * fire haptics + press flash, and return true. The caller doesn't need
   * to know about peers — each toggle owns its own state.
   */
  tryToggle(pointer: Pointer): boolean {
    if (!this.rayHits(pointer)) return false;
    this.enabled = !this.enabled;
    this.pressedUntilMs = performance.now() + PRESS_FLASH_DURATION_MS;
    this.refreshVisual();
    pointer.pulse(HAPTIC_AMPLITUDE, HAPTIC_DURATION_MS);
    return true;
  }

  updateHover(pointers: readonly Pointer[]): void {
    const hovered = pointers.some((p) => this.rayHits(p));
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.refreshVisual();
  }

  /** Per-frame: clears the press flash once its window expires. */
  update(): void {
    if (this.pressedUntilMs > 0 && performance.now() >= this.pressedUntilMs) {
      this.pressedUntilMs = 0;
      this.refreshVisual();
    }
  }

  // Visual priority (highest first): press flash, hover, enabled-glow,
  // disabled-idle. Body color is enabled-axis vs. disabled-slate. Press
  // flash sits on top of all other states so the user gets a beat of
  // feedback even when toggling rapidly.
  private refreshVisual(): void {
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.color.copy(this.enabled ? this.enabledColor : this.disabledColor);
    if (this.pressedUntilMs > 0) {
      mat.emissive.copy(this.pressEmissive);
    } else if (this.hovered) {
      mat.emissive.copy(this.hoverEmissive);
    } else if (this.enabled) {
      mat.emissive.copy(this.enabledEmissive);
    } else {
      mat.emissive.setHex(0x000000);
    }
  }

  private rayHits(pointer: Pointer): boolean {
    pointer.getRayOrigin(this.rayOrigin);
    pointer.getRayDirection(this.rayDirection);
    this.mesh.getWorldPosition(this.worldPos);
    const r = TOGGLE_RADIUS * this.grabRadiusMultiplier;
    return raySphereHit(this.rayOrigin, this.rayDirection, this.worldPos, r);
  }
}
