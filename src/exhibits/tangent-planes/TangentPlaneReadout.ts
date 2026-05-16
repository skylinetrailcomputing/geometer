import * as THREE from 'three';
import { Text } from 'troika-three-text';
import type { MathVec3 } from '@/scaffold/math/frames';
import {
  formatTangentPlaneReadout,
  type TangentPlaneReadoutStrings,
} from './formatTangentPlaneReadout';

// Live readout for the tangent-planes scene (#149). Two-line layout:
//
//   line 1 (top):    `±N.NN (x ± N.NN) + ±N.NN (y ± N.NN) + ±N.NN (z ± N.NN) = 0`
//   line 2 (bottom): `n = ( ±N.NN , ±N.NN , ±N.NN )`
//
// The top line is the §11.4 textbook expanded form
// `n_x (x − x₀) + n_y (y − y₀) + n_z (z − z₀) = 0`; the bottom line is
// the geometric handle (the unit-normal vector). Both update live as
// θ / φ slide; numerics are colored to match the math-frame axis story
// (vermillion = math-X, bluish-green = math-Y, sky-blue = math-Z), with
// algebraic glue (`(`, `=`, `+`, `,`, `n`, `x`, `y`, `z`, `0`, `)`)
// rendered in neutral white.
//
// Sibling design choice (vs. extending `quadrics/EquationReadout.ts`):
// EquationReadout's slot model is hard-coded to seven slots [a,b,c,u,v,w,d]
// with a hide-on-zero reflow contract; this readout has nine slots in a
// two-line static structure with no reflow. Wrapping the troika-Text +
// yaw-billboard idioms here keeps the surface narrow and avoids
// coupling two scenes' UIs through a slot abstraction.
//
// Layout is computed once at construction and never reflowed — the
// equation form `(x − 0.00)` reads as the textbook identity at exact
// zero, so eliding zero terms (the way EquationReadout does) is not
// needed. Only the numeric .text values change per frame.
//
// troika-three-text doesn't support inline rich text / per-span color,
// so each numeric and each separator is its own Text instance. Numerics
// are pre-allocated; separators are static at construction.

export interface TangentPlaneReadoutOptions {
  /**
   * Diffuse colors for the three math-frame axis slots, in order
   * `[x, y, z]`. The same color is shared across the top-line normal
   * coefficient, the top-line point offset, and the bottom-line normal
   * component for each axis — so the readout tells the same color story
   * three times per axis, mirroring `quadrics/EquationReadout.ts`'s
   * convention where linear-term slots reuse axis colors.
   */
  axisColors: readonly [number, number, number];
  fontSize?: number;
}

const DEFAULT_FONT_SIZE = 0.028;

// Slot widths in em (multiples of fontSize). NUMERIC fits worst-case
// `−N.NN`; separator widths are sized to their string content with
// modest breathing room. Tunable in headset; these are the v0.6 lock.
const NUMERIC_SLOT_EM = 2.6;
// Top-line separators.
const OPEN_PAREN_EM = 1.8;        // " (x " / " (y " / " (z "
const CLOSE_PAREN_OP_EM = 1.6;    // ") + "
const CLOSE_PAREN_EQ_EM = 1.9;    // ") = 0"
// Bottom-line separators.
const EQ_OPEN_EM = 2.2;           // "n = ( "
const COMMA_EM = 1.0;             // " , "
const CLOSE_PAREN_EM = 1.0;       // " )"

// Vertical gap between the two lines. Larger than 1× fontSize so the
// lines read as visually distinct rows; smaller than 2.5× to keep the
// readout's total height under the gap to the slider rack at y ≈ 1.07
// (top of the θ slider).
const LINE_PITCH = 0.06;

const SEPARATOR_COLOR = 0xffffff;
const OUTLINE_WIDTH = '8%';
const OUTLINE_COLOR = 0x000000;

// Throttle the troika `.sync()` calls to ≈30 Hz, mirroring
// `EquationReadout.ts`. Bounds SDF rebuild work during fast drags;
// per-frame head-pose billboarding (faceCamera) still runs every frame
// so motion smoothness is unaffected.
const SYNC_INTERVAL_MS = 33;

// Per-axis slot indices into `axisColors`. The construction loops walk
// from AXIS_X through AXIS_Z; the AXIS_Y constant is implicit in that
// range and not referenced directly.
const AXIS_X = 0;
const AXIS_Z = 2;

export class TangentPlaneReadout {
  readonly group: THREE.Group;

  private readonly fontSize: number;

  // Six top-line numerics in visual reading order:
  //   topNumerics[0] = n_x  (axis-X color)
  //   topNumerics[1] = x₀   (axis-X color, inverted-sign)
  //   topNumerics[2] = n_y  (axis-Y color)
  //   topNumerics[3] = y₀   (axis-Y color, inverted-sign)
  //   topNumerics[4] = n_z  (axis-Z color)
  //   topNumerics[5] = z₀   (axis-Z color, inverted-sign)
  private readonly topNumerics: readonly Text[];

  // Three bottom-line numerics — n_x, n_y, n_z (one per axis).
  private readonly bottomNumerics: readonly Text[];

  // Static separators. Held only for disposal; never re-written.
  private readonly separators: Text[] = [];

  // Per-slot string cache so we don't re-write Text.text + re-trigger
  // troika .sync() when the value hasn't changed past the throttle.
  private readonly topNumericCache: string[] = new Array(6).fill('');
  private readonly bottomNumericCache: string[] = new Array(3).fill('');

  private lastSyncMs = 0;
  // Visibility-bootstrap guard (#201 PR 3). Boots `group.visible =
  // false`; flips to `true` after the first `setValues` writes real
  // text into the troika `Text` slots. Avoids a first-frame paint of
  // empty strings between mount and the first update() tick.
  private hasBootstrapped = false;

  // Hoisted out of `faceCamera` so per-frame billboarding does no
  // allocation. Same convention as `EquationReadout.ts:115-116`.
  private readonly camWorld = new THREE.Vector3();
  private readonly groupWorld = new THREE.Vector3();

  constructor(opts: TangentPlaneReadoutOptions) {
    this.fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;

    this.group = new THREE.Group();
    this.group.name = 'tangent-plane-readout';
    // Boot hidden — uncloaks on first setValues (#201 PR 3). Avoids
    // a first-frame paint of empty troika `Text` slots between mount
    // and the first update() tick.
    this.group.visible = false;

    const numericW = NUMERIC_SLOT_EM * this.fontSize;
    const openParenW = OPEN_PAREN_EM * this.fontSize;
    const closeParenOpW = CLOSE_PAREN_OP_EM * this.fontSize;
    const closeParenEqW = CLOSE_PAREN_EQ_EM * this.fontSize;
    const eqOpenW = EQ_OPEN_EM * this.fontSize;
    const commaW = COMMA_EM * this.fontSize;
    const closeParenW = CLOSE_PAREN_EM * this.fontSize;

    const topY = LINE_PITCH / 2;
    const bottomY = -LINE_PITCH / 2;

    // ─── Top line ────────────────────────────────────────────────
    // [n_x] " (x " [x₀] ") + " [n_y] " (y " [y₀] ") + " [n_z] " (z " [z₀] ") = 0"
    const totalTopW =
      6 * numericW +
      3 * openParenW +
      2 * closeParenOpW +
      closeParenEqW;
    let cursor = -totalTopW / 2;

    const topAxisLabels: readonly string[] = ['x', 'y', 'z'];
    const topNumerics: Text[] = new Array<Text>(6);
    for (let axis = AXIS_X; axis <= AXIS_Z; axis++) {
      const color = opts.axisColors[axis];

      // [n_axis] numeric.
      const nText = this.makeNumericText(this.fontSize, color);
      nText.position.set(cursor + numericW / 2, topY, 0);
      this.group.add(nText);
      topNumerics[axis * 2] = nText;
      cursor += numericW;

      // " (x " separator.
      const openSep = this.makeSeparatorText(this.fontSize);
      openSep.text = ` (${topAxisLabels[axis]} `;
      openSep.position.set(cursor + openParenW / 2, topY, 0);
      openSep.sync();
      this.group.add(openSep);
      this.separators.push(openSep);
      cursor += openParenW;

      // [axis₀] numeric.
      const pText = this.makeNumericText(this.fontSize, color);
      pText.position.set(cursor + numericW / 2, topY, 0);
      this.group.add(pText);
      topNumerics[axis * 2 + 1] = pText;
      cursor += numericW;

      // Closing separator: ") + " between terms, ") = 0" after the last.
      const closingSep = this.makeSeparatorText(this.fontSize);
      const isLast = axis === AXIS_Z;
      if (isLast) {
        closingSep.text = ') = 0';
        closingSep.position.set(cursor + closeParenEqW / 2, topY, 0);
        cursor += closeParenEqW;
      } else {
        closingSep.text = ') + ';
        closingSep.position.set(cursor + closeParenOpW / 2, topY, 0);
        cursor += closeParenOpW;
      }
      closingSep.sync();
      this.group.add(closingSep);
      this.separators.push(closingSep);
    }
    this.topNumerics = topNumerics;

    // ─── Bottom line ─────────────────────────────────────────────
    // "n = ( " [n_x] " , " [n_y] " , " [n_z] " )"
    const totalBottomW =
      eqOpenW + 3 * numericW + 2 * commaW + closeParenW;
    cursor = -totalBottomW / 2;

    const eqOpen = this.makeSeparatorText(this.fontSize);
    eqOpen.text = 'n = ( ';
    eqOpen.position.set(cursor + eqOpenW / 2, bottomY, 0);
    eqOpen.sync();
    this.group.add(eqOpen);
    this.separators.push(eqOpen);
    cursor += eqOpenW;

    const bottomNumerics: Text[] = new Array<Text>(3);
    for (let axis = AXIS_X; axis <= AXIS_Z; axis++) {
      const color = opts.axisColors[axis];
      const nText = this.makeNumericText(this.fontSize, color);
      nText.position.set(cursor + numericW / 2, bottomY, 0);
      this.group.add(nText);
      bottomNumerics[axis] = nText;
      cursor += numericW;

      const isLast = axis === AXIS_Z;
      const sep = this.makeSeparatorText(this.fontSize);
      if (isLast) {
        sep.text = ' )';
        sep.position.set(cursor + closeParenW / 2, bottomY, 0);
        cursor += closeParenW;
      } else {
        sep.text = ' , ';
        sep.position.set(cursor + commaW / 2, bottomY, 0);
        cursor += commaW;
      }
      sep.sync();
      this.group.add(sep);
      this.separators.push(sep);
    }
    this.bottomNumerics = bottomNumerics;
  }

  private makeNumericText(fontSize: number, color: number): Text {
    const t = new Text();
    t.fontSize = fontSize;
    t.color = color;
    t.anchorX = 'center';
    t.anchorY = 'middle';
    t.outlineWidth = OUTLINE_WIDTH;
    t.outlineColor = OUTLINE_COLOR;
    return t;
  }

  private makeSeparatorText(fontSize: number): Text {
    const t = new Text();
    t.fontSize = fontSize;
    t.color = SEPARATOR_COLOR;
    t.anchorX = 'center';
    t.anchorY = 'middle';
    t.outlineWidth = OUTLINE_WIDTH;
    t.outlineColor = OUTLINE_COLOR;
    return t;
  }

  /**
   * Update all nine numerics from the per-frame raymarch result. Throttled
   * to ≈30 Hz via SYNC_INTERVAL_MS — mirrors EquationReadout's cadence and
   * bounds troika SDF rebuild work during fast drags. Per-slot caching
   * skips the .text + .sync() write when the formatted string hasn't
   * changed (e.g. between sub-pixel slider motions that round to the
   * same `±N.NN`).
   */
  setValues(point: MathVec3, normal: MathVec3): void {
    const now = performance.now();
    // Bypass the throttle on the first call so the boot-hidden group
    // can uncloak with real text on frame 1 (#201 PR 3).
    if (this.hasBootstrapped && now - this.lastSyncMs < SYNC_INTERVAL_MS) {
      return;
    }
    this.lastSyncMs = now;

    const strings: TangentPlaneReadoutStrings = formatTangentPlaneReadout(
      point,
      normal,
    );

    // Top line: interleave [n, point] per axis to match the layout order
    // used at construction.
    for (let axis = AXIS_X; axis <= AXIS_Z; axis++) {
      const nIdx = axis * 2;
      const pIdx = axis * 2 + 1;
      const nStr = strings.topNormals[axis];
      const pStr = strings.topPoints[axis];
      if (nStr !== this.topNumericCache[nIdx]) {
        this.topNumericCache[nIdx] = nStr;
        this.topNumerics[nIdx].text = nStr;
        this.topNumerics[nIdx].sync();
      }
      if (pStr !== this.topNumericCache[pIdx]) {
        this.topNumericCache[pIdx] = pStr;
        this.topNumerics[pIdx].text = pStr;
        this.topNumerics[pIdx].sync();
      }
    }

    for (let axis = AXIS_X; axis <= AXIS_Z; axis++) {
      const nStr = strings.bottomNormals[axis];
      if (nStr !== this.bottomNumericCache[axis]) {
        this.bottomNumericCache[axis] = nStr;
        this.bottomNumerics[axis].text = nStr;
        this.bottomNumerics[axis].sync();
      }
    }

    // First-call uncloak (#201 PR 3). All cache-miss .sync() writes
    // above have completed; the boot-hidden group flips visible here.
    if (!this.hasBootstrapped) {
      this.group.visible = true;
      this.hasBootstrapped = true;
    }
  }

  // Yaw-only billboard, matching EquationReadout (#29) and Label.
  // World-up stays world-up; head pitch and roll don't tilt the readout.
  faceCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    this.group.getWorldPosition(this.groupWorld);
    const dx = this.camWorld.x - this.groupWorld.x;
    const dz = this.camWorld.z - this.groupWorld.z;
    this.group.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  dispose(): void {
    for (const t of this.topNumerics) t.dispose();
    for (const t of this.bottomNumerics) t.dispose();
    for (const t of this.separators) t.dispose();
  }
}
