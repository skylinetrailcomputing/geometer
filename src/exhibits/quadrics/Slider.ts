import * as THREE from 'three';

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
}

const DEFAULT_TRACK_LENGTH = 0.3;
const DEFAULT_THUMB_RADIUS = 0.025;
const DEFAULT_DRAG_GAIN = 1.75;

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

const THUMB_BASE_COLOR = 0xeeaa33;
const THUMB_HOVER_EMISSIVE = 0x884422;
// Same warm hue as hover, brighter — reads as "engaged" rather than a
// different affordance. Cool/contrasting hues risked looking like a
// separate UI element.
const THUMB_GRAB_EMISSIVE = 0xffaa44;

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

    this.thumb = new THREE.Mesh(
      new THREE.SphereGeometry(this.opts.thumbRadius, 16, 12),
      new THREE.MeshStandardMaterial({ color: THUMB_BASE_COLOR }),
    );
    this.group.add(this.thumb);

    this.syncThumbPosition();
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
    const hex = this.grabbedBy
      ? THUMB_GRAB_EMISSIVE
      : this.hovered
        ? THUMB_HOVER_EMISSIVE
        : 0x000000;
    mat.emissive.setHex(hex);
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

  // Thumb tracks `rawValue`, not `currentValue`. Inside the detent the
  // shader still sees the snapped 0 (correct surface form), but the thumb
  // moves smoothly with the user's hand so a slow drag past the detent
  // edge is visibly rewarded. Without this, the thumb appears stuck at 0
  // until rawValue escapes ±0.05 — which is exactly the symptom #24
  // exists to fix on the value side.
  private syncThumbPosition(): void {
    const halfLen = this.opts.trackLength / 2;
    const t =
      (this.rawValue - this.opts.min) / (this.opts.max - this.opts.min);
    this.thumb.position.x = -halfLen + t * this.opts.trackLength;
  }
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
