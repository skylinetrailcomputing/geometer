import * as THREE from 'three';
import { Text } from 'troika-three-text';

// Compact math-frame axis indicator (#43). Pinned next to the slider rack;
// the caller positions the group. Three short lines + single-letter labels
// in the US-undergrad textbook convention: X right, Y forward (away from
// the user), Z up — right-handed (X × Y = Z).
//
// The shader still evaluates the implicit equation in the Three.js world
// frame; the caller is responsible for routing slider values to uniforms
// so that slider `a` drives X² (world-X), `b` drives Y² (world-Z), and
// `c` drives Z² (world-Y). The labels here are the visible half of that
// contract.

const AXIS_LENGTH = 0.15;
const AXIS_COLOR = 0xffffff;
const LINE_OPACITY = 0.7;

// Just larger than the per-slider labels' 0.04 primary, so the letters
// read as a distinct UI element rather than as another slider value.
const FONT_SIZE = 0.045;
const OUTLINE_WIDTH = '8%';
const OUTLINE_COLOR = 0x000000;

interface AxisSpec {
  readonly name: 'X' | 'Y' | 'Z';
  readonly dir: THREE.Vector3;
}

// Map math-frame axes to Three.js world directions:
//   math-X (right)   = +world-X
//   math-Y (forward) = -world-Z   (camera looks down -Z)
//   math-Z (up)      = +world-Y
const AXES: readonly AxisSpec[] = [
  { name: 'X', dir: new THREE.Vector3(1, 0, 0) },
  { name: 'Y', dir: new THREE.Vector3(0, 0, -1) },
  { name: 'Z', dir: new THREE.Vector3(0, 1, 0) },
];

/**
 * Compact axis indicator. Owns a `THREE.Group` you position and add to
 * the scene; call `faceCamera(camera)` per-frame to billboard the letter
 * labels (yaw-only, matching the family / per-slider labels — head pitch
 * and roll stay out for the same #29 reason).
 */
export class WorldAxes {
  readonly group: THREE.Group;

  private readonly labels: Text[];
  private readonly lineGeoms: THREE.BufferGeometry[];
  private readonly lineMat: THREE.LineBasicMaterial;

  // Hoisted out of `faceCamera` so per-frame billboarding does no allocation.
  private readonly camWorld = new THREE.Vector3();
  private readonly labelWorld = new THREE.Vector3();

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'world-axes';

    this.lineMat = new THREE.LineBasicMaterial({
      color: AXIS_COLOR,
      transparent: true,
      opacity: LINE_OPACITY,
    });

    this.labels = [];
    this.lineGeoms = [];

    for (const { name, dir } of AXES) {
      const end = dir.clone().multiplyScalar(AXIS_LENGTH);

      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        end,
      ]);
      this.lineGeoms.push(lineGeom);
      this.group.add(new THREE.Line(lineGeom, this.lineMat));

      const label = new Text();
      label.text = name;
      label.fontSize = FONT_SIZE;
      label.color = AXIS_COLOR;
      label.anchorX = 'center';
      label.anchorY = 'middle';
      label.outlineWidth = OUTLINE_WIDTH;
      label.outlineColor = OUTLINE_COLOR;
      label.position.copy(end);
      label.sync();
      this.group.add(label);
      this.labels.push(label);
    }
  }

  faceCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    for (const label of this.labels) {
      label.getWorldPosition(this.labelWorld);
      const dx = this.camWorld.x - this.labelWorld.x;
      const dz = this.camWorld.z - this.labelWorld.z;
      label.rotation.set(0, Math.atan2(dx, dz), 0);
    }
  }

  dispose(): void {
    for (const label of this.labels) label.dispose();
    for (const geom of this.lineGeoms) geom.dispose();
    this.lineMat.dispose();
  }
}
