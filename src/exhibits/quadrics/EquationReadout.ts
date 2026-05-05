import * as THREE from 'three';
import { Text } from 'troika-three-text';

// Live equation readout above the slider rack (#58). Two-line layout (#89)
// renders the full quadric with linear terms:
//   line 1 (top):    `±N.NN x² + ±N.NN y² + ±N.NN z²`
//   line 2 (bottom): `±N.NN x + ±N.NN y + ±N.NN z = ±N.NN`
// Numerics are colored to match their slider thumbs (vermillion = math-X,
// bluish-green = math-Y, sky-blue = math-Z; yellow for the constant `d`),
// so a vermillion numeric on the top line means "coefficient on x²" and
// a vermillion numeric on the bottom line means "coefficient on x" — same
// color story across both lines. Algebraic glue (variables, operators) is
// neutral white. Yaw-only billboarded as one unit so the whole equation
// reads from a consistent direction.
//
// troika-three-text doesn't support inline rich text / per-span color, so
// the equation is built from independent Text instances laid out at fixed
// offsets. Each line is independently centered on the readout group's x=0,
// which leaves the wider bottom line (with its trailing `= d`) extending
// slightly further right than the top line — natural reading flow for a
// continued equation. Constants are em-based so retuning fontSize stays
// self-consistent.

export interface EquationReadoutOptions {
  // Diffuse colors for the seven numeric slots in visual reading order:
  // [a, b, c, u, v, w, d]. Match the slider thumb colors so the user can
  // cross-reference equation ↔ rack at a glance. Linear-term slots
  // (u, v, w) reuse a/b/c's axis-coded colors, since both quadratic and
  // linear coefficients on the same axis share the same math-frame meaning.
  coefficientColors: readonly [
    number, number, number, number, number, number, number,
  ];
  fontSize?: number;
}

const DEFAULT_FONT_SIZE = 0.028;

// Slot widths in em (multiples of fontSize), tuned to Roboto-ish defaults
// in troika. NUMERIC fits the worst-case `−N.NN`; SEPARATOR fits a full
// connector like ` x² + ` / ` z = ` with breathing room; SEPARATOR_TAIL is
// the truncated trailing slot on the top line — ` z²` only, no trailing
// operator. Refine in headset if pieces look crowded or splayed.
const NUMERIC_SLOT_EM = 2.6;
const SEPARATOR_SLOT_EM = 2.4;
const SEPARATOR_TAIL_EM = 1.2;

// Top line (3 numerics + 3 separators): a, ` x² + `, b, ` y² + `, c, ` z²`.
// Bottom line (4 numerics + 3 separators): u, ` x + `, v, ` y + `, w, ` z = `, d.
// The trailing `+` on the top line's final separator is dropped — the
// bottom line's first numeric carries an explicit sign (always-show-sign
// convention) which serves as the implicit continuation marker.
const TOP_SEPARATOR_CONTENT = [' x² + ', ' y² + ', ' z²'] as const;
const BOTTOM_SEPARATOR_CONTENT = [' x + ', ' y + ', ' z = '] as const;

// Vertical gap between the two lines. Larger than 1× fontSize so the lines
// read as visually distinct rows; smaller than 2.5× to keep the readout's
// total height under the gap to the family-classifier label at y=1.5.
const LINE_PITCH = 0.06;

const SEPARATOR_COLOR = 0xffffff;
const OUTLINE_WIDTH = '8%';
const OUTLINE_COLOR = 0x000000;

// Throttle the numeric .sync() calls to ≈30 Hz, mirroring the per-slider
// value-label cap in #38 (and now retired alongside it). Bounds troika SDF
// re-build work; head-pose billboarding (faceCamera) still runs every
// frame so motion smoothness is unaffected.
const SYNC_INTERVAL_MS = 33;

// Numeric-slot indices in visual reading order, used by both the layout
// loop in the constructor and the value-write loop in setValues.
const SLOT_A = 0;
const SLOT_B = 1;
const SLOT_C = 2;
const SLOT_U = 3;
const SLOT_V = 4;
const SLOT_W = 5;
const SLOT_D = 6;
const NUMERIC_SLOT_COUNT = 7;

export class EquationReadout {
  readonly group: THREE.Group;

  private readonly numericTexts: readonly Text[];
  private readonly numericValues: number[] = new Array<number>(
    NUMERIC_SLOT_COUNT,
  ).fill(NaN);
  private readonly separatorTexts: readonly Text[];
  private lastSyncMs = 0;

  // Hoisted out of `faceCamera` so per-frame billboarding does no allocation.
  private readonly camWorld = new THREE.Vector3();
  private readonly groupWorld = new THREE.Vector3();

  constructor(opts: EquationReadoutOptions) {
    const fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;
    const numericW = NUMERIC_SLOT_EM * fontSize;
    const separatorW = SEPARATOR_SLOT_EM * fontSize;
    const separatorTailW = SEPARATOR_TAIL_EM * fontSize;

    // Top line: 3 numerics + 2 full separators + 1 tail separator.
    // Bottom line: 4 numerics + 3 full separators.
    const topLineW = 3 * numericW + 2 * separatorW + separatorTailW;
    const bottomLineW = 4 * numericW + 3 * separatorW;
    const topY = LINE_PITCH / 2;
    const bottomY = -LINE_PITCH / 2;

    this.group = new THREE.Group();
    this.group.name = 'equation-readout';

    const numericTexts: Text[] = new Array<Text>(NUMERIC_SLOT_COUNT);
    const separatorTexts: Text[] = [];

    // Top line layout — slots alternate N S N S N S' (S' = tail separator).
    // Slot ordering: N(a) S(' x² + ') N(b) S(' y² + ') N(c) S(' z²').
    let cursor = -topLineW / 2;
    const topSlotIndex = (i: number): number => [SLOT_A, SLOT_B, SLOT_C][i];
    for (let i = 0; i < 6; i++) {
      const isNumeric = i % 2 === 0;
      const isTail = i === 5;
      const w = isNumeric ? numericW : isTail ? separatorTailW : separatorW;
      const centerX = cursor + w / 2;
      cursor += w;

      if (isNumeric) {
        const slot = topSlotIndex(i / 2);
        const t = this.makeNumericText(
          fontSize,
          opts.coefficientColors[slot],
        );
        t.position.set(centerX, topY, 0);
        this.group.add(t);
        numericTexts[slot] = t;
      } else {
        const t = this.makeSeparatorText(fontSize);
        t.text = TOP_SEPARATOR_CONTENT[(i - 1) / 2];
        t.position.set(centerX, topY, 0);
        t.sync();
        this.group.add(t);
        separatorTexts.push(t);
      }
    }

    // Bottom line layout — same alternation as the original single-line
    // readout: N S N S N S N. Slot ordering: N(u) S(' x + ') N(v)
    // S(' y + ') N(w) S(' z = ') N(d).
    cursor = -bottomLineW / 2;
    const bottomSlotIndex = (i: number): number =>
      [SLOT_U, SLOT_V, SLOT_W, SLOT_D][i];
    for (let i = 0; i < 7; i++) {
      const isNumeric = i % 2 === 0;
      const w = isNumeric ? numericW : separatorW;
      const centerX = cursor + w / 2;
      cursor += w;

      if (isNumeric) {
        const slot = bottomSlotIndex(i / 2);
        const t = this.makeNumericText(
          fontSize,
          opts.coefficientColors[slot],
        );
        t.position.set(centerX, bottomY, 0);
        this.group.add(t);
        numericTexts[slot] = t;
      } else {
        const t = this.makeSeparatorText(fontSize);
        t.text = BOTTOM_SEPARATOR_CONTENT[(i - 1) / 2];
        t.position.set(centerX, bottomY, 0);
        t.sync();
        this.group.add(t);
        separatorTexts.push(t);
      }
    }

    this.numericTexts = numericTexts;
    this.separatorTexts = separatorTexts;
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
   * Update the seven numeric values. Throttled to ≈30 Hz; pre-throttle the
   * work would dominate troika SDF rebuild cost during fast drags (#38
   * rationale, ported from Slider's per-slider label cap). Sign is always
   * shown explicitly (matching the per-slider label format) so transitions
   * across zero are unambiguous on every slot, top line and bottom alike.
   */
  setValues(
    a: number,
    b: number,
    c: number,
    d: number,
    u: number,
    v: number,
    w: number,
  ): void {
    const now = performance.now();
    if (now - this.lastSyncMs < SYNC_INTERVAL_MS) return;
    this.lastSyncMs = now;

    // Indexed in visual reading order [a, b, c, u, v, w, d] to match the
    // slot constants above and the coefficientColors array.
    const values = [a, b, c, u, v, w, d];
    for (let i = 0; i < NUMERIC_SLOT_COUNT; i++) {
      const value = values[i];
      if (value === this.numericValues[i]) continue;
      this.numericValues[i] = value;
      const sign = value < 0 ? '−' : '+';
      this.numericTexts[i].text = `${sign}${Math.abs(value).toFixed(2)}`;
      this.numericTexts[i].sync();
    }
  }

  // Yaw-only billboard, matching the family-classifier label behavior
  // (#29). The whole equation reads from one consistent direction — head
  // pitch and roll stay out.
  faceCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    this.group.getWorldPosition(this.groupWorld);
    const dx = this.camWorld.x - this.groupWorld.x;
    const dz = this.camWorld.z - this.groupWorld.z;
    this.group.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  dispose(): void {
    for (const t of this.numericTexts) t.dispose();
    for (const t of this.separatorTexts) t.dispose();
  }
}
