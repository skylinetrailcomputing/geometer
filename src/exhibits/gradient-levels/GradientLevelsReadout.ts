import * as THREE from 'three';
import { Text } from 'troika-three-text';
import type { MathVec3 } from '@/scaffold/math/frames';
import {
  READOUT_FONT_SIZE,
  READOUT_LINE_PITCH,
  READOUT_OUTLINE_COLOR,
  READOUT_OUTLINE_WIDTH,
  READOUT_SYNC_INTERVAL_MS,
} from '@/scaffold/ui/readoutTokens';
import {
  formatGradientLevelsReadout,
  type GradientLevelsReadoutStrings,
} from './formatGradientLevelsReadout';

// Live readout for the gradient-levels scene (#166). Two-line layout:
//
//   line 1 (top):    `∇f = ( ±N.NN , ±N.NN , ±N.NN )`
//   line 2 (bottom): `|∇f| = N.NN`
//
// The top line decomposes ∇f into its math-frame components, each
// axis-coded (vermillion = math-X, bluish-green = math-Y, sky-blue =
// math-Z). The bottom line is the scalar magnitude, tinted YELLOW to
// pair visually with the gradient-arrow primitive in the scene — both
// elements describe the same gradient vector (direction = arrow,
// magnitude = numeric); the YELLOW pairing communicates "facets of one
// vector" rather than "the number is the arrow's rendered length"
// (which would build the misconception #165's unit-length arrow lock
// was designed to prevent — see SPEC.md "Readout" section).
//
// Sibling design choice (vs. extending `tangent-planes/TangentPlaneReadout`):
// TangentPlaneReadout has nine slots in a specific top-line structure
// (`±n_x (x − x₀) + ...`); this readout has four slots (3 ∇f components
// + 1 |∇f|) in a different structure. Wrapping the troika-Text +
// yaw-billboard idioms here keeps the surface narrow.
//
// Layout is computed once at construction and never reflowed. Only the
// numeric .text values change per frame, throttled to ≈30 Hz like
// `TangentPlaneReadout` and `EquationReadout`.
//
// Initial-text policy: Text instances boot empty; `group.visible = false`
// until the first `setValues()` call populates the numerics. The boot
// pose guarantees a first-frame hit (per SPEC.md), so under normal
// mount the readout uncloaks within one tick; deep-link/state-restore
// to a miss state stays hidden gracefully.

export interface GradientLevelsReadoutOptions {
  /**
   * Diffuse colors for the three math-frame axis slots (∂f/∂x, ∂f/∂y, ∂f/∂z),
   * in order [x, y, z]. Same convention as TangentPlaneReadout.
   */
  axisColors: readonly [number, number, number];
  /**
   * Diffuse color for the |∇f| numeric value. Locked to YELLOW
   * (0xf0e442) at the call site in `index.ts`; constructor accepts the
   * value so the class stays presentation-agnostic.
   */
  magnitudeColor: number;
  fontSize?: number;
}

// Slot widths in em (multiples of fontSize). NUMERIC_SIGNED fits
// worst-case `−6.00`; NUMERIC_UNSIGNED fits worst-case `10.39`
// (analytic ceiling — slider-reachable max is ~8.94, see plan §2.1).
const NUMERIC_SIGNED_EM = 2.6;
const NUMERIC_UNSIGNED_EM = 2.0;
// Top-line separators.
const PREFIX_GRAD_EM = 2.8; // `∇f = ( ` — nabla glyph is wider than Latin.
const COMMA_EM = 1.0;       // ` , `
const CLOSE_PAREN_EM = 1.0; // ` )`
// Bottom-line prefix — sized to match PREFIX_GRAD_EM so the equals
// signs roughly align between the two lines.
const PREFIX_MAG_EM = 2.8;  // `|∇f| = `

const SEPARATOR_COLOR = 0xffffff;

// Per-axis slot indices for the top-line component triple.
const AXIS_X = 0;
const AXIS_Z = 2;

export class GradientLevelsReadout {
  readonly group: THREE.Group;

  private readonly fontSize: number;

  // Top-line component numerics: [∂f/∂x, ∂f/∂y, ∂f/∂z].
  private readonly topNumerics: readonly Text[];

  // Bottom-line |∇f| numeric.
  private readonly bottomNumeric: Text;

  // Static separators. Held only for disposal; never re-written.
  private readonly separators: Text[] = [];

  // Per-slot string cache so we don't re-write Text.text + re-trigger
  // troika .sync() when the value hasn't changed past the throttle.
  private readonly topNumericCache: string[] = new Array(3).fill('');
  private bottomNumericCache = '';

  private lastSyncMs = 0;

  // Hoisted out of `faceCamera` so per-frame billboarding does no
  // allocation. Same convention as `TangentPlaneReadout`.
  private readonly camWorld = new THREE.Vector3();
  private readonly groupWorld = new THREE.Vector3();

  constructor(opts: GradientLevelsReadoutOptions) {
    this.fontSize = opts.fontSize ?? READOUT_FONT_SIZE;

    this.group = new THREE.Group();
    this.group.name = 'gradient-levels-readout';
    // Stay hidden until the first setValues() populates the numerics.
    // The first update() tick uncloaks; deep-link/state-restore to a
    // miss state stays hidden gracefully.
    this.group.visible = false;

    const numericSignedW = NUMERIC_SIGNED_EM * this.fontSize;
    const numericUnsignedW = NUMERIC_UNSIGNED_EM * this.fontSize;
    const prefixGradW = PREFIX_GRAD_EM * this.fontSize;
    const commaW = COMMA_EM * this.fontSize;
    const closeParenW = CLOSE_PAREN_EM * this.fontSize;
    const prefixMagW = PREFIX_MAG_EM * this.fontSize;

    const topY = READOUT_LINE_PITCH / 2;
    const bottomY = -READOUT_LINE_PITCH / 2;

    // ─── Top line ────────────────────────────────────────────────
    // `∇f = ( ` [n_x] ` , ` [n_y] ` , ` [n_z] ` )`
    const totalTopW =
      prefixGradW + 3 * numericSignedW + 2 * commaW + closeParenW;
    let cursor = -totalTopW / 2;

    const gradPrefix = this.makeSeparatorText(this.fontSize);
    gradPrefix.text = '∇f = ( ';
    gradPrefix.position.set(cursor + prefixGradW / 2, topY, 0);
    gradPrefix.sync();
    this.group.add(gradPrefix);
    this.separators.push(gradPrefix);
    cursor += prefixGradW;

    const topNumerics: Text[] = new Array<Text>(3);
    for (let axis = AXIS_X; axis <= AXIS_Z; axis++) {
      const color = opts.axisColors[axis];

      const nText = this.makeNumericText(this.fontSize, color);
      nText.position.set(cursor + numericSignedW / 2, topY, 0);
      this.group.add(nText);
      topNumerics[axis] = nText;
      cursor += numericSignedW;

      const isLast = axis === AXIS_Z;
      const sep = this.makeSeparatorText(this.fontSize);
      if (isLast) {
        sep.text = ' )';
        sep.position.set(cursor + closeParenW / 2, topY, 0);
        cursor += closeParenW;
      } else {
        sep.text = ' , ';
        sep.position.set(cursor + commaW / 2, topY, 0);
        cursor += commaW;
      }
      sep.sync();
      this.group.add(sep);
      this.separators.push(sep);
    }
    this.topNumerics = topNumerics;

    // ─── Bottom line ─────────────────────────────────────────────
    // `|∇f| = ` [mag]
    //
    // Both lines anchor at the same x=0 center per the layout below.
    // Width asymmetry (~13.6 em top vs ~4.8 em bottom) is the documented
    // open question — validates in headset smoke per plan §3.4.
    const totalBottomW = prefixMagW + numericUnsignedW;
    cursor = -totalBottomW / 2;

    const magPrefix = this.makeSeparatorText(this.fontSize);
    magPrefix.text = '|∇f| = ';
    magPrefix.position.set(cursor + prefixMagW / 2, bottomY, 0);
    magPrefix.sync();
    this.group.add(magPrefix);
    this.separators.push(magPrefix);
    cursor += prefixMagW;

    this.bottomNumeric = this.makeNumericText(this.fontSize, opts.magnitudeColor);
    this.bottomNumeric.position.set(cursor + numericUnsignedW / 2, bottomY, 0);
    this.group.add(this.bottomNumeric);
  }

  private makeNumericText(fontSize: number, color: number): Text {
    const t = new Text();
    t.fontSize = fontSize;
    t.color = color;
    t.anchorX = 'center';
    t.anchorY = 'middle';
    t.outlineWidth = READOUT_OUTLINE_WIDTH;
    t.outlineColor = READOUT_OUTLINE_COLOR;
    return t;
  }

  private makeSeparatorText(fontSize: number): Text {
    const t = new Text();
    t.fontSize = fontSize;
    t.color = SEPARATOR_COLOR;
    t.anchorX = 'center';
    t.anchorY = 'middle';
    t.outlineWidth = READOUT_OUTLINE_WIDTH;
    t.outlineColor = READOUT_OUTLINE_COLOR;
    return t;
  }

  /**
   * Update all four numerics from the per-frame raymarch result. Throttled
   * to ≈30 Hz via READOUT_SYNC_INTERVAL_MS — mirrors TangentPlaneReadout's cadence
   * and bounds troika SDF rebuild work during fast drags. Per-slot caching
   * skips the .text + .sync() write when the formatted string hasn't
   * changed.
   *
   * On first call, uncloaks `group.visible = true` — the readout boots
   * hidden so it can't paint empty strings before the first hit frame.
   */
  setValues(gradient: MathVec3): void {
    // First-call uncloak: before throttle gate so the readout becomes
    // visible on the first tick regardless of throttle timing.
    if (!this.group.visible) this.group.visible = true;

    const now = performance.now();
    if (now - this.lastSyncMs < READOUT_SYNC_INTERVAL_MS) return;
    this.lastSyncMs = now;

    const strings: GradientLevelsReadoutStrings = formatGradientLevelsReadout(gradient);

    for (let axis = AXIS_X; axis <= AXIS_Z; axis++) {
      const s = strings.components[axis];
      if (s !== this.topNumericCache[axis]) {
        this.topNumericCache[axis] = s;
        this.topNumerics[axis].text = s;
        this.topNumerics[axis].sync();
      }
    }

    if (strings.magnitude !== this.bottomNumericCache) {
      this.bottomNumericCache = strings.magnitude;
      this.bottomNumeric.text = strings.magnitude;
      this.bottomNumeric.sync();
    }
  }

  // Yaw-only billboard, matching TangentPlaneReadout / EquationReadout /
  // Label. World-up stays world-up; head pitch and roll don't tilt.
  faceCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    this.group.getWorldPosition(this.groupWorld);
    const dx = this.camWorld.x - this.groupWorld.x;
    const dz = this.camWorld.z - this.groupWorld.z;
    this.group.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  dispose(): void {
    for (const t of this.topNumerics) t.dispose();
    this.bottomNumeric.dispose();
    for (const t of this.separators) t.dispose();
  }
}
