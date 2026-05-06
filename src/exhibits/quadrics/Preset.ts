import * as THREE from 'three';
import { Text } from 'troika-three-text';

// One canonical-pose preset button (#46). A small sphere with a text label
// below it; pressing snaps the slider rack to a named family member
// (Sphere, Cylinder, Cone, Hyperboloid 1- or 2-sheet, …). Read as a tap-
// affordance distinct from the warm slider thumbs by use of a cool fill
// color and a brief press flash on activation.
//
// Label placement is below-button rather than right-of-button (#93): the
// preset rack is a horizontal sub-row beneath the section tabs, so right-
// of-button labels would collide with the next preset's button. Mirrors
// SectionTab's above-button label arrangement (with the offset flipped so
// labels fall toward the family classifier rather than crowding the tabs
// above).

export type PresetValues = readonly [number, number, number, number];

export interface PresetOptions {
  name: string;
  values: PresetValues;
}

const BUTTON_RADIUS = 0.02;

// Mirrors Slider's grab-radius multiplier so the hover/hit region feels the
// same when sweeping the controller across the rack.
const GRAB_RADIUS_MULTIPLIER = 2.75;

const HAPTIC_AMPLITUDE = 0.5;
const HAPTIC_DURATION_MS = 10;

// Cool fill so presets read as "tap to apply" rather than "drag" — the
// slider thumbs use a warm orange for drag affordance.
const BUTTON_BASE_COLOR = 0x44aabb;
const BUTTON_HOVER_EMISSIVE = 0x224455;
const BUTTON_PRESS_EMISSIVE = 0x88ddff;

// Momentary press flash duration. Long enough to register as feedback,
// short enough not to read as a sticky toggle.
const PRESS_FLASH_DURATION_MS = 150;

const LABEL_FONT_SIZE = 0.03;
// Offset just clears the button (radius 0.02) plus a small breathing gap.
// Negative because the label sits *below* the button.
const LABEL_OFFSET_Y = -0.025;
const LABEL_COLOR = 0xffffff;
const LABEL_OUTLINE_WIDTH = '8%';
const LABEL_OUTLINE_COLOR = 0x000000;

interface ControllerWithGamepad extends THREE.Object3D {
  userData: { gamepad?: Gamepad };
}

export class Preset {
  readonly group: THREE.Group;
  readonly name: string;
  readonly values: PresetValues;

  private readonly button: THREE.Mesh;
  private readonly label: Text;
  private readonly buttonWorld = new THREE.Vector3();
  private readonly camWorld = new THREE.Vector3();
  private readonly labelWorld = new THREE.Vector3();
  private hovered = false;
  private pressedUntilMs = 0;

  constructor(opts: PresetOptions) {
    this.name = opts.name;
    this.values = opts.values;

    this.group = new THREE.Group();
    this.group.name = `preset:${opts.name}`;

    this.button = new THREE.Mesh(
      new THREE.SphereGeometry(BUTTON_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: BUTTON_BASE_COLOR }),
    );
    this.group.add(this.button);

    this.label = new Text();
    this.label.text = opts.name;
    this.label.fontSize = LABEL_FONT_SIZE;
    this.label.color = LABEL_COLOR;
    this.label.anchorX = 'center';
    this.label.anchorY = 'top';
    this.label.outlineWidth = LABEL_OUTLINE_WIDTH;
    this.label.outlineColor = LABEL_OUTLINE_COLOR;
    this.label.position.set(0, LABEL_OFFSET_Y, 0);
    this.label.sync();
    this.group.add(this.label);
  }

  /**
   * Test whether `controller`'s forward ray hits the button. On hit, fire
   * haptics, kick off the press flash, and return true. The caller owns
   * applying `values` to the slider rack — keeping the dispatch out here
   * means the preset itself doesn't need a reference to the sliders.
   */
  tryActivate(controller: THREE.Object3D): boolean {
    if (!this.rayHitsButton(controller)) return false;
    this.pressedUntilMs = performance.now() + PRESS_FLASH_DURATION_MS;
    this.refreshButtonEmissive();
    pulse(controller);
    return true;
  }

  updateHover(controllers: readonly THREE.Object3D[]): void {
    const hovered = controllers.some((c) => this.rayHitsButton(c));
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

  // Yaw-only billboard for the text label, matching the family / per-slider
  // labels — head pitch and roll stay out (#29).
  faceCamera(camera: THREE.Camera): void {
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

  private refreshButtonEmissive(): void {
    const mat = this.button.material as THREE.MeshStandardMaterial;
    const hex =
      this.pressedUntilMs > 0
        ? BUTTON_PRESS_EMISSIVE
        : this.hovered
          ? BUTTON_HOVER_EMISSIVE
          : 0x000000;
    mat.emissive.setHex(hex);
  }

  private rayHitsButton(controller: THREE.Object3D): boolean {
    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    controller.getWorldPosition(rayOrigin);
    rayDir.set(0, 0, -1).applyQuaternion(
      controller.getWorldQuaternion(new THREE.Quaternion()),
    );
    this.button.getWorldPosition(this.buttonWorld);
    const r = BUTTON_RADIUS * GRAB_RADIUS_MULTIPLIER;
    return raySphereHit(rayOrigin, rayDir, this.buttonWorld, r);
  }
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
  (actuator as { pulse?: (a: number, d: number) => void }).pulse?.(
    HAPTIC_AMPLITUDE,
    HAPTIC_DURATION_MS,
  );
}
