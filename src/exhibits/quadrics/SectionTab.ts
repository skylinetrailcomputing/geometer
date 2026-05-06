import * as THREE from 'three';
import { Text } from 'troika-three-text';

// Tap button for the rack section selector (#57). Visually a sibling of
// `Preset` — same sphere + label + ray-hit + yaw-billboard machinery —
// but with a *sustained* "active" emissive that persists until another
// tab claims active. Press flash still fires on tap as feedback that the
// switch was registered, layered on top of the active state.
//
// Light intentional duplication of Preset rather than a shared base
// class: the two serve different mental models (Preset = one-shot
// "snap to this configuration", Tab = sticky "switch to this section"),
// and the issue explicitly recommends "build concretely first; generalize
// only if a second instance shows up." A third tap-button-like primitive
// would be the trigger for refactoring all three onto a shared base.

export interface SectionTabOptions {
  name: string;
}

const BUTTON_RADIUS = 0.022;

const GRAB_RADIUS_MULTIPLIER = 2.75;

const HAPTIC_AMPLITUDE = 0.5;
const HAPTIC_DURATION_MS = 10;

// Slate base reads as a "mode" affordance, distinct from Preset's cool
// blue ("snap to family member") and the warm orange slider thumbs
// ("drag to change a value"). Active emissive is bright enough to read
// at a glance which section is current; hover is a softer pre-light;
// press flash is the brightest, layered momentarily on top of active.
const BUTTON_BASE_COLOR = 0x556677;
const BUTTON_HOVER_EMISSIVE = 0x223344;
const BUTTON_ACTIVE_EMISSIVE = 0x88bbdd;
const BUTTON_PRESS_EMISSIVE = 0xddeeff;

const PRESS_FLASH_DURATION_MS = 150;

const LABEL_FONT_SIZE = 0.035;
const LABEL_OFFSET_Y = 0.04;
const LABEL_COLOR = 0xffffff;
const LABEL_OUTLINE_WIDTH = '8%';
const LABEL_OUTLINE_COLOR = 0x000000;

interface ControllerWithGamepad extends THREE.Object3D {
  userData: { gamepad?: Gamepad };
}

export class SectionTab {
  readonly group: THREE.Group;
  readonly name: string;

  private readonly button: THREE.Mesh;
  private readonly label: Text;
  private readonly buttonWorld = new THREE.Vector3();
  private readonly camWorld = new THREE.Vector3();
  private readonly labelWorld = new THREE.Vector3();
  private hovered = false;
  private active = false;
  private pressedUntilMs = 0;

  constructor(opts: SectionTabOptions) {
    this.name = opts.name;

    this.group = new THREE.Group();
    this.group.name = `tab:${opts.name}`;

    this.button = new THREE.Mesh(
      new THREE.SphereGeometry(BUTTON_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: BUTTON_BASE_COLOR }),
    );
    this.group.add(this.button);

    // Label sits above the button rather than to the right (Preset's
    // layout): the tab row is horizontal, so right-of-button labels
    // would collide with the next tab's button.
    this.label = new Text();
    this.label.text = opts.name;
    this.label.fontSize = LABEL_FONT_SIZE;
    this.label.color = LABEL_COLOR;
    this.label.anchorX = 'center';
    this.label.anchorY = 'bottom';
    this.label.outlineWidth = LABEL_OUTLINE_WIDTH;
    this.label.outlineColor = LABEL_OUTLINE_COLOR;
    this.label.position.set(0, LABEL_OFFSET_Y, 0);
    this.label.sync();
    this.group.add(this.label);
  }

  get isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.refreshButtonEmissive();
  }

  // Dynamic label update — used for the canonical-forms heading's
  // chevron flip on expand / collapse (#93). Issues a troika sync;
  // the cost is a one-frame text re-layout, fine on a press cadence.
  setName(name: string): void {
    if (this.label.text === name) return;
    this.label.text = name;
    this.label.sync();
  }

  /**
   * Test whether `controller`'s forward ray hits the button. On hit, fire
   * haptics, kick off the press flash, and return true. The caller owns
   * the active-state bookkeeping (clearing the previously-active tab,
   * setting this one) — keeps the tab itself unaware of its peers.
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

  // Emissive priority (highest first): press flash, active, hover, idle.
  // Press flash sits on top of active so the user gets a beat of feedback
  // even when re-tapping the already-active tab.
  private refreshButtonEmissive(): void {
    const mat = this.button.material as THREE.MeshStandardMaterial;
    let hex: number;
    if (this.pressedUntilMs > 0) {
      hex = BUTTON_PRESS_EMISSIVE;
    } else if (this.active) {
      hex = BUTTON_ACTIVE_EMISSIVE;
    } else if (this.hovered) {
      hex = BUTTON_HOVER_EMISSIVE;
    } else {
      hex = 0x000000;
    }
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
