import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { mathToWorld } from '@/scaffold/math/frames';

// Compact math-frame axis indicator (#43). Pinned next to wherever the
// caller wants it; the caller positions the group. Three short lines +
// single-letter labels in the US-undergrad textbook convention: X right,
// Y forward (away from the user), Z up — right-handed (X × Y = Z).
//
// The math ↔ world frame mapping is shared across the geometer scene
// cluster and lives in scaffold/math/frames.ts. WorldAxes uses the
// mathToWorld helper for its three basis directions; consumers that
// route values into shader uniforms or other math-frame quantities use
// the same helper to stay consistent.
//
// Axis line + letter colors are per-axis and supplied by the caller
// (#58); see scaffold/design/tokens.ts for the geometer house tints
// (DEFAULT_AXIS_COLORS).

export type AxisName = 'X' | 'Y' | 'Z';

export interface WorldAxesOptions {
  // Per-axis line + label color, keyed by axis name.
  axisColors: Record<AxisName, number>;
}

const AXIS_LENGTH = 0.15;
const LINE_OPACITY = 0.85;

// Just larger than the per-slider labels' 0.04 primary, so the letters
// read as a distinct UI element rather than as another slider value.
const FONT_SIZE = 0.045;
const OUTLINE_WIDTH = '8%';
const OUTLINE_COLOR = 0x000000;

interface AxisSpec {
  readonly name: AxisName;
  readonly dir: THREE.Vector3;
}

// Math basis vectors mapped through scaffold/math/frames.ts. The
// helper is the single source of truth for the math ↔ world routing
// (in particular, math-Y → −world-Z because Three.js's camera looks
// down −Z); a sign-flip regression here would now be caught by the
// frames.ts basis-vector tests.
const AXES: readonly AxisSpec[] = [
  { name: 'X', dir: mathToWorld([1, 0, 0]) },
  { name: 'Y', dir: mathToWorld([0, 1, 0]) },
  { name: 'Z', dir: mathToWorld([0, 0, 1]) },
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
  private readonly lineMats: THREE.LineBasicMaterial[];

  // Hoisted out of `faceCamera` so per-frame billboarding does no allocation.
  private readonly camWorld = new THREE.Vector3();
  private readonly labelWorld = new THREE.Vector3();

  constructor(opts: WorldAxesOptions) {
    this.group = new THREE.Group();
    this.group.name = 'world-axes';

    this.labels = [];
    this.lineGeoms = [];
    this.lineMats = [];

    for (const { name, dir } of AXES) {
      const color = opts.axisColors[name];
      const end = dir.clone().multiplyScalar(AXIS_LENGTH);

      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        end,
      ]);
      this.lineGeoms.push(lineGeom);

      // One material per axis so each carries its own color. Cheap — three
      // line materials, no per-frame allocation.
      const lineMat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: LINE_OPACITY,
      });
      this.lineMats.push(lineMat);
      this.group.add(new THREE.Line(lineGeom, lineMat));

      const label = new Text();
      label.text = name;
      label.fontSize = FONT_SIZE;
      label.color = color;
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
    for (const mat of this.lineMats) mat.dispose();
  }
}
