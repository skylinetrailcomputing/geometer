import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { raySphereHit } from '@/scaffold/ui/rayHit';

// Tap button for the SceneRack — the in-app navigation surface that
// lets the user move between sibling exhibits in a cluster (#150).
// Visually a sibling of `SectionTab` (sticky-active sphere + yaw-
// billboard label + ray-hit + press-flash machinery), but tuned a step
// larger and recolored warm amber so the SceneRack reads as a higher-
// level affordance than the SectionTab row beneath it.
//
// Light intentional duplication of `SectionTab` rather than a shared
// base class (matching SectionTab's own copy-of-Preset stance). With
// SceneTab landing, the project now has three tap-button-like
// primitives — `Preset`, `SectionTab`, `SceneTab` — which trips the
// rule-of-three trigger called out in `SectionTab.ts`. Consolidation
// onto a shared `TapButton` base is filed as a #150 follow-up; this
// file ships the third concrete instance first so the abstraction can
// be designed against three real call-sites instead of two.

export interface SceneTabOptions {
  name: string;
  // Ray–button hit-test sphere radius is `BUTTON_RADIUS *
  // grabRadiusMultiplier`. Required so each scene declares the
  // affordance scale rather than inheriting a primitive-internal
  // default; the calculus3 cluster's SceneRack passes 2.75 so the
  // SceneTabs feel like the rack's Slider / Preset / SectionTab.
  grabRadiusMultiplier: number;
}

// Larger than SectionTab's 0.022 so the SceneRack reads as the
// outer / higher-priority navigation layer when the two racks share
// the user's field of view.
const BUTTON_RADIUS = 0.028;

const HAPTIC_AMPLITUDE = 0.5;
const HAPTIC_DURATION_MS = 10;

// Same slate base as SectionTab so the off / inactive vocabulary
// stays consistent across rack tiers (cf. AxisToggle's matching
// disabled slate). Active emissive is warm amber, distinct from
// SectionTab's sky-blue, so users can tell at a glance which rack
// owns the currently-glowing tab. Hover / press scale the same way
// SectionTab's do — soft pre-light → bright press flash on top of
// any sustained active glow.
const BUTTON_BASE_COLOR = 0x556677;
const BUTTON_HOVER_EMISSIVE = 0x442200;
const BUTTON_ACTIVE_EMISSIVE = 0xddaa66;
const BUTTON_PRESS_EMISSIVE = 0xffeebb;

const PRESS_FLASH_DURATION_MS = 150;

// Larger than SectionTab's 0.035 to match the larger button.
const LABEL_FONT_SIZE = 0.04;
const LABEL_OFFSET_Y = 0.04;
const LABEL_COLOR = 0xffffff;
const LABEL_OUTLINE_WIDTH = '8%';
const LABEL_OUTLINE_COLOR = 0x000000;

interface ControllerWithGamepad extends THREE.Object3D {
  userData: { gamepad?: Gamepad };
}

export class SceneTab {
  readonly group: THREE.Group;
  readonly name: string;

  private readonly grabRadiusMultiplier: number;
  private readonly button: THREE.Mesh;
  private readonly label: Text;
  private readonly buttonWorld = new THREE.Vector3();
  private readonly camWorld = new THREE.Vector3();
  private readonly labelWorld = new THREE.Vector3();
  private hovered = false;
  private active = false;
  private pressedUntilMs = 0;

  constructor(opts: SceneTabOptions) {
    this.name = opts.name;
    this.grabRadiusMultiplier = opts.grabRadiusMultiplier;

    this.group = new THREE.Group();
    this.group.name = `scene-tab:${opts.name}`;

    this.button = new THREE.Mesh(
      new THREE.SphereGeometry(BUTTON_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: BUTTON_BASE_COLOR }),
    );
    this.group.add(this.button);

    // Label sits above the button rather than to the right: the
    // SceneRack lays out horizontally, so right-of-button labels
    // would collide with the next tab's button. Same rationale as
    // SectionTab.
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

  // Dynamic label update — kept on the API for parity with SectionTab,
  // even though SceneRack tabs don't currently rename mid-session.
  // Issues a troika sync; the cost is a one-frame text re-layout.
  setName(name: string): void {
    if (this.label.text === name) return;
    this.label.text = name;
    this.label.sync();
  }

  /**
   * Test whether `controller`'s forward ray hits the button. On hit, fire
   * haptics, kick off the press flash, and return true. The caller
   * (SceneRack) owns the active-state bookkeeping (clearing the
   * previously-active tab, setting this one) — keeps the tab itself
   * unaware of its peers, matching SectionTab's contract.
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
    const r = BUTTON_RADIUS * this.grabRadiusMultiplier;
    return raySphereHit(rayOrigin, rayDir, this.buttonWorld, r);
  }
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
