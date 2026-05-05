import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  trackLength?: number;
  thumbRadius?: number;
  // Multiplier on per-frame controller motion → value change. >1 means
  // less hand travel per unit value (i.e. the slider feels more sensitive).
  // 1 = thumb tracks controller 1:1 across the visible track length.
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

// Snap-to-zero detent half-width, per quadrics SPEC.md "Slider model".
// Lets the user park exactly on a degeneracy boundary instead of approximating.
const ZERO_DETENT = 0.05;

// Ray–thumb hit-test radius is this multiple of the thumb's visual radius.
// Wider than the visual makes re-grab forgiving when the hand drifts off-aim
// during release — especially after a zero-snap, where the thumb jumps to
// `value = 0` while the controller is still pointed where the drag ended.
// Used identically by `tryGrab` and `updateHover` so the highlight region
// equals the actual grabbable region.
const GRAB_RADIUS_MULTIPLIER = 2.75;

const HAPTIC_AMPLITUDE = 0.5;
const HAPTIC_DURATION_MS = 10;

// Hover/grab emissive = base × scale. Uniform scale across hues keeps the
// affordance ("subtle glow" / "strong glow") consistent regardless of the
// base color (#58). Hover is a soft pre-light; grab clearly reads as
// engaged. Tune in headset; per-color overrides are easy to add if any
// hue (e.g. yellow) ends up reading washed out at these scales.
const THUMB_HOVER_SCALE = 0.4;
const THUMB_GRAB_SCALE = 0.7;

interface ControllerWithGamepad extends THREE.Object3D {
  userData: { gamepad?: Gamepad };
}

export class Slider {
  readonly group: THREE.Group;

  private readonly opts: Required<SliderOptions>;
  private readonly track: THREE.Mesh;
  private readonly thumb: THREE.Mesh;
  private readonly thumbWorld = new THREE.Vector3();
  private readonly controllerWorld = new THREE.Vector3();
  private readonly localPoint = new THREE.Vector3();
  private readonly hoverEmissive: THREE.Color;
  private readonly grabEmissive: THREE.Color;

  // `rawValue` integrates hand motion every frame, untouched by the detent.
  // `currentValue` is the emitted value — snapped to exactly 0 inside the
  // detent — and is what `get value()` returns to the shader. Splitting the
  // two lets slow drags accumulate underneath the detent instead of being
  // re-pinned to 0 each frame (#24).
  private rawValue: number;
  private currentValue: number;
  private grabbedBy: THREE.Object3D | null = null;
  private lastControllerLocalX = 0;
  private hovered = false;

  constructor(options: SliderOptions) {
    this.opts = {
      trackLength: DEFAULT_TRACK_LENGTH,
      thumbRadius: DEFAULT_THUMB_RADIUS,
      dragGain: DEFAULT_DRAG_GAIN,
      baseColor: DEFAULT_BASE_COLOR,
      thumbShape: DEFAULT_THUMB_SHAPE,
      ...options,
    };
    this.rawValue = clamp(options.initial, options.min, options.max);
    this.currentValue =
      Math.abs(this.rawValue) < ZERO_DETENT ? 0 : this.rawValue;

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

  /**
   * Programmatically set the value (e.g. from a preset, #46). Snaps the raw
   * accumulator and applies the zero detent identically to a drag tick, then
   * updates the visible thumb. Safe mid-drag: rebases
   * `lastControllerLocalX` so the next `update()` computes deltas from the
   * new state, not the pre-jump one.
   */
  setValue(v: number): void {
    this.rawValue = clamp(v, this.opts.min, this.opts.max);
    this.currentValue =
      Math.abs(this.rawValue) < ZERO_DETENT ? 0 : this.rawValue;
    if (this.grabbedBy) {
      this.lastControllerLocalX = this.controllerLocalX(this.grabbedBy);
    }
    this.syncThumbPosition();
  }

  /**
   * Test whether `controller`'s forward ray hits the thumb. On hit, attach
   * the grab to that controller and pulse haptics. Returns whether grabbed.
   */
  tryGrab(controller: THREE.Object3D): boolean {
    if (this.grabbedBy) return false;
    if (!this.rayHitsThumb(controller)) return false;

    this.grabbedBy = controller;
    this.lastControllerLocalX = this.controllerLocalX(controller);
    this.refreshThumbEmissive();
    pulse(controller);
    return true;
  }

  releaseFromController(controller: THREE.Object3D): void {
    if (this.grabbedBy !== controller) return;
    this.grabbedBy = null;
    // `hovered` is frozen at whatever it was at grab time — `updateHover`
    // short-circuits while grabbed, so it can't go false during the drag.
    // Clear it here so a release after the controller drifted off the thumb
    // doesn't flash the hover-yellow color until the next `updateHover`
    // frame corrects it.
    this.hovered = false;
    this.refreshThumbEmissive();
    pulse(controller);
  }

  /**
   * Per-frame hover update. Lights the thumb's emissive when any controller's
   * ray is within the grab region — a "you can grab now" affordance that also
   * exposes the wider hit radius to the user. No-op on the hover bit while
   * grabbed (the grab visual takes precedence and is set elsewhere).
   */
  updateHover(controllers: readonly THREE.Object3D[]): void {
    const hovered =
      this.grabbedBy === null &&
      controllers.some((c) => this.rayHitsThumb(c));
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.refreshThumbEmissive();
  }

  // Thumb emissive is a deterministic function of {grabbed, hovered, idle}.
  // Called from each transition point — `tryGrab`, `releaseFromController`,
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

  private rayHitsThumb(controller: THREE.Object3D): boolean {
    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    controller.getWorldPosition(rayOrigin);
    rayDir.set(0, 0, -1).applyQuaternion(
      controller.getWorldQuaternion(new THREE.Quaternion()),
    );
    this.thumb.getWorldPosition(this.thumbWorld);
    const r = this.opts.thumbRadius * GRAB_RADIUS_MULTIPLIER;
    return raySphereHit(rayOrigin, rayDir, this.thumbWorld, r);
  }

  /**
   * Per-frame tick. Integrates controller motion (relative drag) into the
   * raw value with `dragGain` as the sensitivity multiplier — the user's
   * hand doesn't have to traverse the full track to span the full range.
   * The detent is applied only to `currentValue` (the emitted/shader value),
   * so per-frame motion always accumulates in `rawValue` and slow drags
   * escape the snap.
   */
  update(): void {
    if (!this.grabbedBy) return;
    const x = this.controllerLocalX(this.grabbedBy);
    const delta = x - this.lastControllerLocalX;
    this.lastControllerLocalX = x;

    const range = this.opts.max - this.opts.min;
    const valueDelta = delta * this.opts.dragGain * (range / this.opts.trackLength);
    this.rawValue = clamp(
      this.rawValue + valueDelta,
      this.opts.min,
      this.opts.max,
    );
    this.currentValue =
      Math.abs(this.rawValue) < ZERO_DETENT ? 0 : this.rawValue;
    this.syncThumbPosition();
  }

  private controllerLocalX(controller: THREE.Object3D): number {
    controller.getWorldPosition(this.controllerWorld);
    this.group.worldToLocal(this.localPoint.copy(this.controllerWorld));
    return this.localPoint.x;
  }

  // Thumb tracks the *displayed* value (i.e. `currentValue`'s would-be
  // snapped projection of `rawValue`), not raw. Inside the detent the thumb
  // parks at zero so it stays aligned with what the equation readout will
  // display (per SPEC.md "Slider model"). The slow-drag-escape behavior of
  // #24 is preserved by `rawValue` accumulating in `update()` underneath —
  // once raw clears ±ZERO_DETENT, the thumb tracks it again. Bonus: the
  // visible "park at zero on approach" is part of the detent's affordance —
  // the user feels the boundary before reading the equation.
  private syncThumbPosition(): void {
    const halfLen = this.opts.trackLength / 2;
    const displayValue =
      Math.abs(this.rawValue) < ZERO_DETENT ? 0 : this.rawValue;
    const t =
      (displayValue - this.opts.min) / (this.opts.max - this.opts.min);
    this.thumb.position.x = -halfLen + t * this.opts.trackLength;
  }
}

// `sphere` matches the hit-test radius exactly. The arrow variants extend
// past `thumbRadius` along their axis (~1.475r at the cone tip), but the
// grab zone (`thumbRadius * GRAB_RADIUS_MULTIPLIER` = 2.75r) covers the
// full visible arrow plus margin, so the entire shape stays grabbable.
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
  const coneHeight = 0.6 * r;
  const coneRadius = 0.38 * r;
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

function raySphereHit(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): boolean {
  const oc = new THREE.Vector3().subVectors(origin, center);
  const b = oc.dot(dir);
  const c = oc.dot(oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return false;
  const sqrtDisc = Math.sqrt(disc);
  const t = -b - sqrtDisc;
  return t >= 0 || -b + sqrtDisc >= 0;
}

function pulse(controller: THREE.Object3D): void {
  const gamepad = (controller as ControllerWithGamepad).userData.gamepad;
  const actuator = gamepad?.hapticActuators?.[0];
  if (!actuator) return;
  // hapticActuators is part of the Gamepad Extensions draft; pulse() is the
  // widely-shipped surface on Quest, so the type narrowing here is permissive.
  (actuator as { pulse?: (a: number, d: number) => void }).pulse?.(
    HAPTIC_AMPLITUDE,
    HAPTIC_DURATION_MS,
  );
}
