import { Text } from 'troika-three-text';
import type { MathVec3 } from '@/scaffold/math/frames';
import { PanelReadout } from '@/scaffold/ui/PanelReadout';
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

// Plinth panel-backing dims (#252 / E1.4c). Computed from this readout's
// own em constants × READOUT_FONT_SIZE per plan §3.3 methodology — see
// the envelope-assertion test in PanelReadout.test.ts for the bound.
//
// Worst-case line: top — PREFIX_GRAD_EM(2.8) + 3 × NUMERIC_SIGNED_EM(2.6)
// + 2 × COMMA_EM(1.0) + CLOSE_PAREN_EM(1.0)
//                 = 2.8 + 7.8 + 2.0 + 1.0 = 13.6 em
//                 × 0.028 = 0.381 m
// Half-width = 0.381 / 2 + 0.012 padding = 0.202 → rounded 0.200.
//
// Worst-case top-line string corpus:
//   `∇f = ( -2.50 , -2.50 , -2.50 )`
//
// Bracket [0.195, 0.220]; first-pass smoke-tunable per
// feedback_staging_dimensions_first_pass. One dial per round.
export const READOUT_PANEL_HALF_WIDTH_GRADIENT_LEVELS = 0.2;

// 2-line layout, rows at ±LINE_PITCH/2 = ±0.03; glyph + padding → 0.055.
export const READOUT_PANEL_HALF_HEIGHT_GRADIENT_LEVELS = 0.055;

export class GradientLevelsReadout extends PanelReadout {
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
  // Visibility-bootstrap guard (#252 §3.6 cloak normalization). Boots
  // `group.visible = false` (set by PanelReadout base ctor); flips to
  // `true` AFTER the first `setValues` writes real text + .sync()s,
  // not before. Matches the EquationReadout / TangentPlaneReadout
  // throttle-bypass-on-first-call pattern. Avoids a first-frame paint
  // where the dark back-plate would render BEFORE the numeric Text
  // geometries resolve (#252 plan §3.6).
  private hasBootstrapped = false;

  constructor(opts: GradientLevelsReadoutOptions) {
    super('gradient-levels-readout');
    this.fontSize = opts.fontSize ?? READOUT_FONT_SIZE;

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

    // Plinth back-plate (#252 / E1.4c). See parent §3.5 v3 (option-c)
    // billboarding lock; back-plate inherits per-frame yaw transitively.
    this.createPanel({
      halfWidth: READOUT_PANEL_HALF_WIDTH_GRADIENT_LEVELS,
      halfHeight: READOUT_PANEL_HALF_HEIGHT_GRADIENT_LEVELS,
    });
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
   * Cloak normalization (#252 §3.6): `group.visible = true` flips AFTER
   * the first .sync()-resolving write — the throttle gate is bypassed
   * on the bootstrap call (`hasBootstrapped` is false) so the first
   * call always paints. Same shape as EquationReadout / TangentPlaneReadout.
   */
  setValues(gradient: MathVec3): void {
    const now = performance.now();
    // First call bypasses the throttle so the readout uncloaks with
    // real text on frame 1 even if `lastSyncMs` was set elsewhere (in
    // practice `lastSyncMs = 0` and `now - 0` is always >> 33 ms).
    if (
      this.hasBootstrapped &&
      now - this.lastSyncMs < READOUT_SYNC_INTERVAL_MS
    ) {
      return;
    }
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

    // First-call uncloak — after all .sync() writes above. Flipping
    // `group.visible = true` here paints the first real frame with
    // both panel + populated text, not panel + empty text.
    if (!this.hasBootstrapped) {
      this.group.visible = true;
      this.hasBootstrapped = true;
    }
  }

  // Yaw-only billboard inherited from PanelReadout base (#252).

  dispose(): void {
    for (const t of this.topNumerics) t.dispose();
    this.bottomNumeric.dispose();
    for (const t of this.separators) t.dispose();
    this.disposePanel();
  }
}
