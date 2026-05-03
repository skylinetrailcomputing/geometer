import * as THREE from 'three';

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  initial: number;
  trackLength?: number;
  thumbRadius?: number;
}

const DEFAULT_TRACK_LENGTH = 0.3;
const DEFAULT_THUMB_RADIUS = 0.025;

// Snap-to-zero detent half-width, per quadrics SPEC.md "Slider model".
// Lets the user park exactly on a degeneracy boundary instead of approximating.
const ZERO_DETENT = 0.05;

const HAPTIC_AMPLITUDE = 0.5;
const HAPTIC_DURATION_MS = 10;

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

  private currentValue: number;
  private grabbedBy: THREE.Object3D | null = null;

  constructor(options: SliderOptions) {
    this.opts = {
      trackLength: DEFAULT_TRACK_LENGTH,
      thumbRadius: DEFAULT_THUMB_RADIUS,
      ...options,
    };
    this.currentValue = clamp(options.initial, options.min, options.max);

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
      new THREE.MeshStandardMaterial({ color: 0xeeaa33 }),
    );
    this.group.add(this.thumb);

    this.syncThumbPosition();
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

    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    controller.getWorldPosition(rayOrigin);
    rayDir.set(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));

    this.thumb.getWorldPosition(this.thumbWorld);
    const r = this.opts.thumbRadius * 1.5;
    if (!raySphereHit(rayOrigin, rayDir, this.thumbWorld, r)) return false;

    this.grabbedBy = controller;
    pulse(controller);
    return true;
  }

  releaseFromController(controller: THREE.Object3D): void {
    if (this.grabbedBy !== controller) return;
    this.grabbedBy = null;
    pulse(controller);
  }

  /**
   * Per-frame tick. If grabbed, project the controller's world position onto
   * the slider's local X axis, clamp to range, apply zero-detent, sync thumb.
   */
  update(): void {
    if (!this.grabbedBy) return;
    this.grabbedBy.getWorldPosition(this.controllerWorld);
    this.group.worldToLocal(this.localPoint.copy(this.controllerWorld));

    const halfLen = this.opts.trackLength / 2;
    const localX = clamp(this.localPoint.x, -halfLen, halfLen);
    const t = (localX + halfLen) / this.opts.trackLength;
    let v = this.opts.min + t * (this.opts.max - this.opts.min);
    if (Math.abs(v) < ZERO_DETENT) v = 0;

    this.currentValue = v;
    this.syncThumbPosition();
  }

  private syncThumbPosition(): void {
    const halfLen = this.opts.trackLength / 2;
    const t =
      (this.currentValue - this.opts.min) /
      (this.opts.max - this.opts.min);
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
