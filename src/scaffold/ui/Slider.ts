import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { raySphereHit } from '@/scaffold/ui/rayHit';
import type { Pointer } from '@/shell/Pointer';

// `arrow-{x,y,z}` are bidirectional 3D arrows aligned with their respective
// world axis. The slider group has no rotation, so slider-local frame =
// world frame; pick the variant whose axis matches the math-frame axis the
// slider drives (arrow-x for slider 'a' → math-X, arrow-y for slider 'b' →
// math-Y, arrow-z for slider 'c' → math-Z). `sphere` is reserved for
// slider 'd' (the constant term — no spatial direction, so a directionless
// thumb reads as pedagogically truthful).
export type ThumbShape = 'sphere' | 'arrow-x' | 'arrow-y' | 'arrow-z';

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  initial: number;
  // Snap-detent half-width. When the slider's continuous position
  // satisfies `|v - p| < snapDetent` for any `p` in `snapPoints`, the
  // emitted value clamps to exactly `p`. 0 disables snapping (or pass
  // an empty `snapPoints`). The quadrics exhibit passes 0.05 (per its
  // SPEC.md "Slider model") so the user can park precisely on
  // degeneracy boundaries and canonical-form coordinates. Required so
  // each scene declares the design choice rather than inheriting it
  // implicitly.
  snapDetent: number;
  // Detent target positions, paired with `snapDetent`. Common values:
  // `[0]` for a single zero detent (degeneracy boundary parking);
  // `[-1, 0, 1]` adds the canonical unit-form coefficients (#139) so
  // textbook poses like the unit sphere park exactly at integer 1.
  // Adjacent points must be at least `2 * snapDetent` apart or their
  // capture windows will overlap. Required for the same reason as
  // `snapDetent`: detent placement is a design-feel choice that varies
  // by scene and slider role (e.g., cross-section sliders span ±2.5
  // and don't hit canonical poses at ±1, so they pass `[0]` only).
  snapPoints: readonly number[];
  // Ray–thumb hit-test sphere radius is `thumbRadius *
  // grabRadiusMultiplier`. Wider than the visual thumb makes re-grab
  // forgiving when the hand drifts off-aim during release; especially
  // important after a zero-snap, where the thumb jumps while the
  // controller is still pointed where the drag ended. Required.
  grabRadiusMultiplier: number;
  trackLength?: number;
  thumbRadius?: number;
  // Multiplier on per-frame pointer motion → value change. >1 means
  // less hand travel per unit value (i.e. the slider feels more sensitive).
  // 1 = thumb tracks pointer 1:1 across the visible track length.
  dragGain?: number;
  // Base diffuse color for the thumb. Hover/grab emissives are scaled
  // copies of this (see THUMB_HOVER_SCALE / THUMB_GRAB_SCALE), so a single
  // base color suffices to retune per-slider visuals (#58).
  baseColor?: number;
  // Geometry of the thumb. Color is the at-a-glance hint; shape is the
  // unambiguous redundancy cue per #58 / Q4 — readable even with the
  // colors stripped (e.g. on a colorblind viewer's display).
  thumbShape?: ThumbShape;
}

const DEFAULT_TRACK_LENGTH = 0.3;
const DEFAULT_THUMB_RADIUS = 0.025;
const DEFAULT_DRAG_GAIN = 1.75;
const DEFAULT_BASE_COLOR = 0xeeaa33;
const DEFAULT_THUMB_SHAPE: ThumbShape = 'sphere';

const HAPTIC_AMPLITUDE = 0.5;
const HAPTIC_DURATION_MS = 10;

// Hover/grab emissive = base × scale. Uniform scale across hues keeps the
// affordance ("subtle glow" / "strong glow") consistent regardless of the
// base color (#58). Hover is a soft pre-light; grab clearly reads as
// engaged. Tune in headset; per-color overrides are easy to add if any
// hue (e.g. yellow) ends up reading washed out at these scales.
const THUMB_HOVER_SCALE = 0.4;
const THUMB_GRAB_SCALE = 0.7;

// Denominator floor for the skew-line projection in
// `pointerAxisProjection`. When the pointer ray is nearly parallel to the
// slider's local X axis (`aDotR ≈ ±1`), `denom = 1 - aDotR² → 0` and the
// projection blows up. The fallback below this floor returns the ray
// origin's axis-projection — bit-identical to the v1 `controllerLocalX`
// behavior, which was the same projection of the controller's world
// position. In VR `aDotR ≈ 0` and `denom ≈ 1`, well above the floor.
const PROJECTION_DENOM_FLOOR = 1e-4;

export class Slider {
  readonly group: THREE.Group;

  private readonly opts: Required<SliderOptions>;
  private readonly track: THREE.Mesh;
  private readonly thumb: THREE.Mesh;
  private readonly thumbWorld = new THREE.Vector3();
  // Skew-line projection scratches (allocated once per Slider). Shared
  // between `rayHitsThumb` (ray-sphere hit-test) and
  // `pointerAxisProjection` (drag math) — both write `rayOrigin` /
  // `rayDirection` and neither is re-entrant within a single frame's
  // call stack.
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly sliderOrigin = new THREE.Vector3();
  private readonly axisDir = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly hoverEmissive: THREE.Color;
  private readonly grabEmissive: THREE.Color;

  // `rawValue` integrates hand motion every frame, untouched by detents.
  // `currentValue` is the emitted value — snapped to the nearest
  // `snapPoints` entry inside its detent half-width — and is what
  // `get value()` returns to the shader. Splitting the two lets slow
  // drags accumulate underneath the detent instead of being re-pinned
  // each frame (#24).
  private rawValue: number;
  private currentValue: number;
  private grabbedBy: Pointer | null = null;
  private lastPointerAxisX = 0;
  private hovered = false;

  constructor(options: SliderOptions) {
    const validatedSnapPoints = validateSnapPoints(
      options.snapPoints,
      options.snapDetent,
      options.min,
      options.max,
    );
    this.opts = {
      trackLength: DEFAULT_TRACK_LENGTH,
      thumbRadius: DEFAULT_THUMB_RADIUS,
      dragGain: DEFAULT_DRAG_GAIN,
      baseColor: DEFAULT_BASE_COLOR,
      thumbShape: DEFAULT_THUMB_SHAPE,
      ...options,
      // Load-bearing: this trailing override swaps the raw
      // `options.snapPoints` (pulled in by the spread above) for the
      // sorted+validated copy. Do not "simplify" by removing — without
      // this line `this.opts.snapPoints` would be the unsorted,
      // unvalidated input array.
      snapPoints: validatedSnapPoints,
    };
    this.rawValue = clamp(options.initial, options.min, options.max);
    this.currentValue = applySnap(
      this.rawValue,
      this.opts.snapPoints,
      this.opts.snapDetent,
    );

    this.group = new THREE.Group();
    this.group.name = `slider:${options.label}`;

    // Track is a thin cylinder oriented along local +X. Default cylinder
    // axis is +Y, so rotate -Z by 90°.
    const trackGeom = new THREE.CylinderGeometry(
      0.005,
      0.005,
      this.opts.trackLength,
      12,
    );
    trackGeom.rotateZ(Math.PI / 2);
    this.track = new THREE.Mesh(
      trackGeom,
      new THREE.MeshStandardMaterial({ color: 0x556677 }),
    );
    this.group.add(this.track);

    const baseColor = new THREE.Color(this.opts.baseColor);
    this.hoverEmissive = baseColor.clone().multiplyScalar(THUMB_HOVER_SCALE);
    this.grabEmissive = baseColor.clone().multiplyScalar(THUMB_GRAB_SCALE);

    this.thumb = new THREE.Mesh(
      buildThumbGeometry(this.opts.thumbShape, this.opts.thumbRadius),
      new THREE.MeshStandardMaterial({ color: baseColor }),
    );
    this.group.add(this.thumb);

    this.syncThumbPosition();
    // Initial emissive via the centralized state machine, not by relying on
    // MeshStandardMaterial's default `0x000000` happening to match idle.
    this.refreshThumbEmissive();
  }

  get label(): string {
    return this.opts.label;
  }

  get value(): number {
    return this.currentValue;
  }

  get isGrabbed(): boolean {
    return this.grabbedBy !== null;
  }

  // True while any pointer's ray is within the grab region and the slider
  // isn't already grabbed. Exposed for tests (and would-be debug overlays)
  // so the hover transition driven by `updateHover` can be asserted
  // directly; the emissive material change is the user-facing signal.
  get isHovered(): boolean {
    return this.hovered;
  }

  dispose(): void {
    this.track.geometry.dispose();
    (this.track.material as THREE.Material).dispose();
    this.thumb.geometry.dispose();
    (this.thumb.material as THREE.Material).dispose();
  }

  /**
   * Programmatically set the value (e.g. from a preset, #46). Snaps the raw
   * accumulator and applies the zero detent identically to a drag tick, then
   * updates the visible thumb. Safe mid-drag: rebases
   * `lastPointerAxisX` so the next `update()` computes deltas from the
   * new state, not the pre-jump one.
   */
  setValue(v: number): void {
    this.rawValue = clamp(v, this.opts.min, this.opts.max);
    this.currentValue = applySnap(
      this.rawValue,
      this.opts.snapPoints,
      this.opts.snapDetent,
    );
    if (this.grabbedBy) {
      this.lastPointerAxisX = this.pointerAxisProjection(this.grabbedBy);
    }
    this.syncThumbPosition();
  }

  /**
   * Detent-bypassing variant of `setValue`, used by programmatic tweens
   * (#56). The detents' purpose is to let the user park *deliberately* on a
   * canonical pose (degeneracy boundary, unit-form coefficient); during a
   * multi-frame morph each detent just creates a dead window across
   * ±snapDetent where the thumb visibly sticks. The tween caller is
   * expected to finish with a normal `setValue` so the detents re-engage
   * at rest.
   */
  setValueRaw(v: number): void {
    this.rawValue = clamp(v, this.opts.min, this.opts.max);
    this.currentValue = this.rawValue;
    if (this.grabbedBy) {
      this.lastPointerAxisX = this.pointerAxisProjection(this.grabbedBy);
    }
    this.syncThumbPosition();
  }

  /**
   * Update the slider's value range. The raw and emitted values are
   * clamped into the new range; the visible thumb position re-syncs to
   * the clamped value, with snap re-applied. Used by scenes whose domain
   * shifts at runtime — e.g., saddle-extrema's per-preset (x, y)
   * windows (#178). `snapDetent` and `snapPoints` are unchanged; callers
   * are responsible for keeping snap points inside the new range.
   * Throws if `min >= max` or either bound is non-finite.
   *
   * Note: shrinking the range below an existing in-range snap point
   * leaves the snap point stored but no longer satisfying the in-range
   * invariant the constructor + `setSnapPoints` enforce. Scenes that
   * combine `setRange` with `setSnapPoints` (e.g., saddle-extrema's
   * `applyPreset`) should pass a fresh array via `setSnapPoints` after
   * the `setRange` call to keep the invariant whole.
   */
  setRange(min: number, max: number): void {
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max)) {
      throw new Error(
        `Slider.setRange: min (${min}) must be finite and < max (${max})`,
      );
    }
    this.opts.min = min;
    this.opts.max = max;
    this.rawValue = clamp(this.rawValue, min, max);
    this.currentValue = applySnap(
      this.rawValue,
      this.opts.snapPoints,
      this.opts.snapDetent,
    );
    this.syncThumbPosition();
  }

  /**
   * Update the slider's snap-point set. The current value re-snaps in
   * place — a value inside a new detent window snaps to that point; a
   * value that had been snapped to an old point releases if the new
   * set no longer contains that point. The new array is sorted and
   * validated through `validateSnapPoints` (#200); same throw
   * conditions as the constructor.
   *
   * Used by scenes whose snap-point set shifts at runtime — e.g.,
   * saddle-extrema's per-preset critical points. `snapDetent` is
   * unchanged; callers retune detent width at construction.
   *
   * Throws if any point is non-finite, outside the current `[min, max]`,
   * or within `2 * snapDetent` of an adjacent point (detent windows
   * would overlap; see `applySnap`'s no-overlap invariant). Pass a
   * deduplicated array — duplicate values trip the overlap check
   * (gap = 0).
   *
   * Safe mid-drag: does NOT rebase `lastPointerAxisX`. The drag-tick
   * integrates pointer motion into `rawValue` independently of snap
   * state, so no projection baseline shift is needed. In multi-pointer
   * VR a controller-B preset tap during a controller-A slider drag IS
   * reachable; the visible thumb may jump to a new snap point if
   * `rawValue` lands inside a new detent window. The drag continues
   * smoothly; only `currentValue` and the thumb render change.
   */
  setSnapPoints(points: readonly number[]): void {
    this.opts.snapPoints = validateSnapPoints(
      points,
      this.opts.snapDetent,
      this.opts.min,
      this.opts.max,
    );
    this.currentValue = applySnap(
      this.rawValue,
      this.opts.snapPoints,
      this.opts.snapDetent,
    );
    this.syncThumbPosition();
  }

  /**
   * Test whether `pointer`'s ray hits the thumb. On hit, attach the grab
   * to that pointer and pulse haptics. Returns whether grabbed.
   */
  tryGrab(pointer: Pointer): boolean {
    if (this.grabbedBy) return false;
    if (!this.rayHitsThumb(pointer)) return false;

    this.grabbedBy = pointer;
    this.lastPointerAxisX = this.pointerAxisProjection(pointer);
    this.refreshThumbEmissive();
    pointer.pulse(HAPTIC_AMPLITUDE, HAPTIC_DURATION_MS);
    return true;
  }

  releaseFromPointer(pointer: Pointer): void {
    // Reference-equality grab/release contract per pancake plan v3 S4 —
    // `Pointer` instances are stable across frames, so `!==` is sufficient.
    if (this.grabbedBy !== pointer) return;
    this.grabbedBy = null;
    // `hovered` is frozen at whatever it was at grab time — `updateHover`
    // short-circuits while grabbed, so it can't go false during the drag.
    // Clear it here so a release after the pointer drifted off the thumb
    // doesn't flash the hover-yellow color until the next `updateHover`
    // frame corrects it.
    this.hovered = false;
    this.refreshThumbEmissive();
    pointer.pulse(HAPTIC_AMPLITUDE, HAPTIC_DURATION_MS);
  }

  /**
   * Per-frame hover update. Lights the thumb's emissive when any pointer's
   * ray is within the grab region — a "you can grab now" affordance that also
   * exposes the wider hit radius to the user. No-op on the hover bit while
   * grabbed (the grab visual takes precedence and is set elsewhere).
   */
  updateHover(pointers: readonly Pointer[]): void {
    const hovered =
      this.grabbedBy === null &&
      pointers.some((p) => this.rayHitsThumb(p));
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.refreshThumbEmissive();
  }

  // Thumb emissive is a deterministic function of {grabbed, hovered, idle}.
  // Called from each transition point — `tryGrab`, `releaseFromPointer`,
  // and `updateHover` — so the visual always matches state.
  private refreshThumbEmissive(): void {
    const mat = this.thumb.material as THREE.MeshStandardMaterial;
    if (this.grabbedBy) {
      mat.emissive.copy(this.grabEmissive);
    } else if (this.hovered) {
      mat.emissive.copy(this.hoverEmissive);
    } else {
      mat.emissive.setHex(0x000000);
    }
  }

  private rayHitsThumb(pointer: Pointer): boolean {
    pointer.getRayOrigin(this.rayOrigin);
    pointer.getRayDirection(this.rayDirection);
    this.thumb.getWorldPosition(this.thumbWorld);
    const r = this.opts.thumbRadius * this.opts.grabRadiusMultiplier;
    return raySphereHit(this.rayOrigin, this.rayDirection, this.thumbWorld, r);
  }

  /**
   * Per-frame tick. Integrates pointer motion (relative drag) into the
   * raw value with `dragGain` as the sensitivity multiplier — the user's
   * hand doesn't have to traverse the full track to span the full range.
   * The detent is applied only to `currentValue` (the emitted/shader value),
   * so per-frame motion always accumulates in `rawValue` and slow drags
   * escape the snap.
   */
  update(): void {
    if (!this.grabbedBy) return;
    const x = this.pointerAxisProjection(this.grabbedBy);
    const delta = x - this.lastPointerAxisX;
    this.lastPointerAxisX = x;

    const range = this.opts.max - this.opts.min;
    const valueDelta = delta * this.opts.dragGain * (range / this.opts.trackLength);
    this.rawValue = clamp(
      this.rawValue + valueDelta,
      this.opts.min,
      this.opts.max,
    );
    this.currentValue = applySnap(
      this.rawValue,
      this.opts.snapPoints,
      this.opts.snapDetent,
    );
    this.syncThumbPosition();
  }

  // Slider-local X of the closest point on the pointer's world ray to the
  // slider's drag line (skew-line projection). Bit-identical to the v1
  // `controllerLocalX` in VR: there the ray is roughly perpendicular to
  // the slider axis, `aDotR ≈ 0`, and the formula reduces to
  // `(rayOrigin − sliderOrigin) · sliderXAxis` — exactly v1's projection
  // of the controller world position into the slider's local frame.
  // Per pancake plan v3 §3.5 N1; per the no-scale assertion at §5 step
  // 3.5, the slider group is never scaled, so `axisDir` is unit-length
  // after `transformDirection`.
  private pointerAxisProjection(pointer: Pointer): number {
    pointer.getRayOrigin(this.rayOrigin);
    pointer.getRayDirection(this.rayDirection);
    this.axisDir.set(1, 0, 0).transformDirection(this.group.matrixWorld);
    this.group.getWorldPosition(this.sliderOrigin);
    this.v.subVectors(this.rayOrigin, this.sliderOrigin);
    const vDotA = this.v.dot(this.axisDir);
    const vDotR = this.v.dot(this.rayDirection);
    const aDotR = this.axisDir.dot(this.rayDirection);
    const denom = 1 - aDotR * aDotR;
    if (Math.abs(denom) < PROJECTION_DENOM_FLOOR) {
      // Ray nearly parallel to the axis: skew-line projection ill-
      // conditioned. Fall back to projecting the ray origin onto the
      // axis — bit-identical to v1's `controllerLocalX` behavior.
      return vDotA;
    }
    return (vDotA - vDotR * aDotR) / denom;
  }

  // Thumb tracks `currentValue` — the emitted/shader value with detents
  // already applied (or bypassed, for setValueRaw). Inside any detent
  // during a drag the thumb parks at that detent's snap point so it stays
  // aligned with what the equation readout will display (per SPEC.md
  // "Slider model"). The slow-drag-escape behavior of #24 is preserved
  // by `rawValue` accumulating in `update()` underneath — once raw clears
  // the ±snapDetent window around a snap point, currentValue tracks it
  // again. Tween-time setValueRaw bypasses the detents so the thumb
  // sweeps through them rather than visibly sticking at each one across
  // their ±snapDetent windows mid-morph (#56).
  private syncThumbPosition(): void {
    const halfLen = this.opts.trackLength / 2;
    const t =
      (this.currentValue - this.opts.min) / (this.opts.max - this.opts.min);
    this.thumb.position.x = -halfLen + t * this.opts.trackLength;
  }
}

// `sphere` matches the hit-test radius exactly. The arrow variants extend
// past `thumbRadius` along their axis (~1.475r at the cone tip); a
// caller-supplied `grabRadiusMultiplier` (commonly 2.75) covers the full
// visible arrow plus margin so the entire shape stays grabbable.
function buildThumbGeometry(
  shape: ThumbShape,
  thumbRadius: number,
): THREE.BufferGeometry {
  if (shape === 'sphere') {
    return new THREE.SphereGeometry(thumbRadius, 16, 12);
  }
  return buildArrowGeometry(thumbRadius, shape);
}

// Bidirectional 3D arrow (`<->`) for the axis-coefficient sliders. Built
// along +Y as a merged geometry (shaft cylinder + two outward-pointing
// cones), then rotated to the requested world axis. Single mesh + single
// material via `mergeGeometries` keeps Slider's hover/grab emissive logic
// untouched.
function buildArrowGeometry(
  thumbRadius: number,
  axis: 'arrow-x' | 'arrow-y' | 'arrow-z',
): THREE.BufferGeometry {
  const r = thumbRadius;
  // Arrow proportions retuned post-headset (#65 follow-up). Shaft thicker
  // and longer, cones wider — arrows now read as substantive 3D objects
  // rather than thin sticks at the ~0.7 m viewing distance from the
  // user's spawn pose. coneRadius = 0.75r keeps the arrowheads
  // recognizably pointy (h/r = 0.8) after a brief headset pass at 1.0r
  // showed the cones reading too disc-like at full thumbRadius.
  const shaftLength = 1.75 * r;
  const shaftRadius = 0.35 * r;
  const coneHeight = 0.7 * r;
  const coneRadius = 0.5 * r;
  // Cone center sits at half-shaft + half-cone along Y so its base flushes
  // against the shaft's end.
  const coneCenter = shaftLength / 2 + coneHeight / 2;

  const shaft = new THREE.CylinderGeometry(
    shaftRadius,
    shaftRadius,
    shaftLength,
    12,
  );

  const upperCone = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
  upperCone.translate(0, coneCenter, 0);

  // Lower cone: flip 180° around Z so apex points -Y, then translate to
  // mirror the upper cone across the origin.
  const lowerCone = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
  lowerCone.rotateZ(Math.PI);
  lowerCone.translate(0, -coneCenter, 0);

  const merged = mergeGeometries([shaft, upperCone, lowerCone]);
  // Sources have identical attribute layouts (position/normal/uv) — merge
  // can't fail in practice, but the type signature requires the check.
  if (!merged) {
    throw new Error('Failed to merge arrow thumb geometries');
  }
  shaft.dispose();
  upperCone.dispose();
  lowerCone.dispose();

  // Rotate from +Y default to the target world axis. Slider local frame =
  // world frame (the slider group is positioned but not rotated):
  //   arrow-x → ±world-X (parallel to track; slider 'a' / math-X)
  //   arrow-y → ±world-Z (toward/away from viewer; slider 'b' / math-Y per #43,
  //                       which routes math-Y to world-Z; bidirectional, so
  //                       sign of the rotation doesn't matter pedagogically)
  //   arrow-z → ±world-Y (up/down; slider 'c' / math-Z, no rotation needed)
  if (axis === 'arrow-x') {
    merged.rotateZ(-Math.PI / 2);
  } else if (axis === 'arrow-y') {
    merged.rotateX(Math.PI / 2);
  }

  return merged;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

// Snap `v` to the first `snapPoints` entry whose distance to `v` is
// strictly less than `halfWidth`; otherwise pass `v` through. Strict `<`
// matches the pre-#139 single-zero detent contract. Detent windows must
// not overlap (callers space points by at least `2 * halfWidth`); if
// they did, the *first* matching point wins, which keeps behavior
// deterministic but rewards keeping snap points well-separated.
function applySnap(
  v: number,
  snapPoints: readonly number[],
  halfWidth: number,
): number {
  for (const p of snapPoints) {
    if (Math.abs(v - p) < halfWidth) return p;
  }
  return v;
}

// Validate a snap-points array against `[min, max]` and `snapDetent`.
// Returns a sorted copy. Throws on non-finite, out-of-range, or
// detent-overlapping points. Shared between the Slider constructor
// and `setSnapPoints` so the same invariants hold at both lifecycle
// points (#200). Adjacent points spaced *exactly* `2 * snapDetent`
// apart are accepted — at the boundary the capture windows touch but
// don't overlap, matching `applySnap`'s strict-`<` semantics.
function validateSnapPoints(
  points: readonly number[],
  snapDetent: number,
  min: number,
  max: number,
): readonly number[] {
  for (const p of points) {
    if (!Number.isFinite(p)) {
      throw new Error(`Slider snap point ${p} is non-finite`);
    }
    if (p < min || p > max) {
      throw new Error(
        `Slider snap point ${p} is outside range [${min}, ${max}]`,
      );
    }
  }
  const sorted = [...points].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap < 2 * snapDetent) {
      throw new Error(
        `Slider snap points ${sorted[i - 1]} and ${sorted[i]} are ${gap} ` +
          `apart; detent windows of half-width ${snapDetent} would ` +
          `overlap (need gap >= ${2 * snapDetent}).`,
      );
    }
  }
  return sorted;
}
