import * as THREE from 'three';
import { Text } from 'troika-three-text';

// World-anchored X / Y / Z axis indicator (#43). Three thin lines from world
// origin out along +X, +Y, +Z, with a single-letter troika label at each end.
// Lets the viewer map a slider (a/b/c) to a spatial direction without having
// to infer it from surface morphing alone — and stays a stable reference if
// the v0.2 comfort pass (#44) rotates the world or shifts the surface.

const AXIS_LENGTH = 2.0;
const AXIS_COLOR = 0xffffff;
const LINE_OPACITY = 0.5;

// Lifts the floor-grazing X and Z lines off y=0 so they don't z-fight with
// the floor plane. Y line extends purely upward from the same offset so the
// triad meets at a single visible point above the floor.
const FLOOR_OFFSET = 0.005;

// Sized for readability across the three viewing distances from the spawn
// pose (~1.9 m for Z, ~3.0 m for Y, ~3.9 m for X). A bit larger than Label's
// 0.16 primary default so the longest leg still reads clearly.
const FONT_SIZE = 0.18;
const OUTLINE_WIDTH = '6%';
const OUTLINE_COLOR = 0x000000;

interface AxisSpec {
  readonly name: 'X' | 'Y' | 'Z';
  readonly dir: THREE.Vector3;
}

const AXES: readonly AxisSpec[] = [
  { name: 'X', dir: new THREE.Vector3(1, 0, 0) },
  { name: 'Y', dir: new THREE.Vector3(0, 1, 0) },
  { name: 'Z', dir: new THREE.Vector3(0, 0, 1) },
];

/**
 * Persistent world-axis indicator. Owns a `THREE.Group` you add to the
 * scene; call `faceCamera(camera)` per-frame to billboard the letter
 * labels (yaw-only, matching the family / per-slider labels — head pitch
 * and roll stay out of the labels for the same #29 reason).
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
    this.group.position.set(0, FLOOR_OFFSET, 0);

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
