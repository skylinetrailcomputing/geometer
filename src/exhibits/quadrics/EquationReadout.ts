import { Text } from 'troika-three-text';
import { formatSignedMagnitude } from '@/scaffold/ui/formatSignedMagnitude';
import { PanelReadout } from '@/scaffold/ui/PanelReadout';
import {
  READOUT_FONT_SIZE,
  READOUT_LINE_PITCH,
  READOUT_OUTLINE_COLOR,
  READOUT_OUTLINE_WIDTH,
  READOUT_SYNC_INTERVAL_MS,
} from '@/scaffold/ui/readoutTokens';

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
// Hide-on-zero (#95): when a slider sits at exactly 0 (snap-to-zero detent
// in Slider.ts guarantees exact equality, no epsilon needed), the
// corresponding numeric and its adjacent connector drop out and the
// surviving terms reflow + re-center. Reflow only fires when the
// visibility mask actually changes, which — thanks to the detent — happens
// at grab/release boundaries (and tween completion), not per-frame
// mid-drag. Slot `d` is the one exception: hiding the equation's RHS
// reads as broken, so a zero d still renders as `= +0.00`. v1 trial
// choice for the design questions in #95; revisit in headset.
//
// troika-three-text doesn't support inline rich text / per-span color, so
// the equation is built from independent Text instances. Numerics are
// pre-allocated one per slot; separators are pooled (max 3 per line) and
// repurposed dynamically across reflows so we don't allocate / dispose
// during interaction.

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

// Slot widths in em (multiples of fontSize), tuned to Roboto-ish defaults
// in troika. NUMERIC fits the worst-case `−N.NN`; SEPARATOR fits a full
// connector like ` x² + ` / ` z = ` with breathing room; SEPARATOR_TAIL is
// the truncated trailing slot on the top line — ` z²` only, no trailing
// operator. Refine in headset if pieces look crowded or splayed.
const NUMERIC_SLOT_EM = 2.6;
const SEPARATOR_SLOT_EM = 2.4;
const SEPARATOR_TAIL_EM = 1.2;

const SEPARATOR_COLOR = 0xffffff;

// Numeric-slot indices in visual reading order. Indexes into numericTexts,
// numericValues, visibilityMask, and the coefficientColors array.
const SLOT_A = 0;
const SLOT_B = 1;
const SLOT_C = 2;
const SLOT_U = 3;
const SLOT_V = 4;
const SLOT_W = 5;
const SLOT_D = 6;
const NUMERIC_SLOT_COUNT = 7;

// Per-numeric variable label, used to assemble dynamic separators. d has
// no following variable — its separator-to-self position is the line's
// end, terminated by `=` from the preceding connector.
const NUMERIC_VAR_LABEL: readonly string[] = ['x²', 'y²', 'z²', 'x', 'y', 'z', ''];

// Top line carries the squared coefficients; bottom line carries linear
// coefficients + the RHS constant.
const TOP_SLOTS: readonly number[] = [SLOT_A, SLOT_B, SLOT_C];
const BOTTOM_NON_D_SLOTS: readonly number[] = [SLOT_U, SLOT_V, SLOT_W];

// Maximum separators needed per line: top is 2 connectors + 1 tail; bottom
// is 2 connectors + 1 connector-to-d. Pool sized once at construction so
// reflow never allocates.
const TOP_SEPARATOR_POOL = 3;
const BOTTOM_SEPARATOR_POOL = 3;

// Plinth panel-backing dims (#252 / E1.4c). Computed from this readout's
// own em constants × READOUT_FONT_SIZE per plan §3.3 methodology — see
// the envelope-assertion test in PanelReadout.test.ts for the bound.
//
// Worst-case line: bottom, all-non-d slots visible — 4 numerics + 3
// separators = 4 × NUMERIC_SLOT_EM(2.6) + 3 × SEPARATOR_SLOT_EM(2.4)
//             = 10.4 + 7.2 = 17.6 em × 0.028 m/em = 0.493 m
// Half-width = 0.493 / 2 + 0.012 padding = 0.258 → rounded 0.260.
//
// Worst-case strings (corpus this constant covers):
//   bottom: `-2.50 u + -2.50 v + -2.50 w = -2.50`
//   top:    `-2.50 x² + -2.50 y² + -2.50 z²` (narrower than bottom)
//
// First-pass smoke-tunable per feedback_staging_dimensions_first_pass.
// Bracket [0.255, 0.280]; one dial per round (feedback_binary_search_
// visual_constants). If smoke shows clipping → bump up; if too loose →
// shrink; if a formatter changes worst-case width, the envelope test
// fires.
export const READOUT_PANEL_HALF_WIDTH_EQUATION = 0.26;

// 2-line layout: rows at ±LINE_PITCH/2 = ±0.03; glyph half-height
// ~0.014; padding 0.008. Total = 0.052 → rounded 0.055.
export const READOUT_PANEL_HALF_HEIGHT_EQUATION = 0.055;

export class EquationReadout extends PanelReadout {
  private readonly fontSize: number;
  private readonly numericTexts: readonly Text[];
  private readonly numericValues: number[] = new Array<number>(
    NUMERIC_SLOT_COUNT,
  ).fill(NaN);
  private readonly topSeparators: readonly Text[];
  private readonly bottomSeparators: readonly Text[];
  // True = numeric slot is currently rendered; false = hidden because its
  // value is exactly 0. d is forced true regardless of value.
  private readonly visibilityMask: boolean[] = new Array<boolean>(
    NUMERIC_SLOT_COUNT,
  ).fill(true);
  private lastSyncMs = 0;
  // Visibility-bootstrap guard (#201 PR 3). The readout boots with
  // `group.visible = false` (set by PanelReadout base ctor) so the
  // first frame doesn't paint empty troika `Text` slots. The first
  // `setValues` call writes real values and then flips
  // `group.visible = true`; subsequent calls are no-op on visibility.
  private hasBootstrapped = false;

  constructor(opts: EquationReadoutOptions) {
    super('equation-readout');
    this.fontSize = opts.fontSize ?? READOUT_FONT_SIZE;

    // Numerics — one per slot, color baked in. Position is assigned by
    // applyLayout(); kept at origin until the first layout pass.
    const numericTexts: Text[] = new Array<Text>(NUMERIC_SLOT_COUNT);
    for (let i = 0; i < NUMERIC_SLOT_COUNT; i++) {
      const t = this.makeNumericText(this.fontSize, opts.coefficientColors[i]);
      this.group.add(t);
      numericTexts[i] = t;
    }
    this.numericTexts = numericTexts;

    // Separator pools — content + position assigned by applyLayout().
    // Repurposed across reflows so layout transitions don't allocate.
    const topSeparators: Text[] = new Array<Text>(TOP_SEPARATOR_POOL);
    for (let i = 0; i < TOP_SEPARATOR_POOL; i++) {
      const t = this.makeSeparatorText(this.fontSize);
      this.group.add(t);
      topSeparators[i] = t;
    }
    this.topSeparators = topSeparators;

    const bottomSeparators: Text[] = new Array<Text>(BOTTOM_SEPARATOR_POOL);
    for (let i = 0; i < BOTTOM_SEPARATOR_POOL; i++) {
      const t = this.makeSeparatorText(this.fontSize);
      this.group.add(t);
      bottomSeparators[i] = t;
    }
    this.bottomSeparators = bottomSeparators;

    // Initial layout — visibilityMask defaults to all-true. The first
    // setValues call will flip u/v/w to hidden (their initial value is 0)
    // and reflow once; that's a deliberately small cost paid at startup.
    this.applyLayout();

    // Plinth back-plate (#252 / E1.4c). Per parent §3.5 v3 lock
    // (option-c), the panel mesh is a child of `group` and inherits
    // the per-frame yaw-billboard from PanelReadout.faceCamera()
    // transitively. Sized to the readout's widest-line worst case +
    // padding; see READOUT_PANEL_HALF_WIDTH_EQUATION above.
    this.createPanel({
      halfWidth: READOUT_PANEL_HALF_WIDTH_EQUATION,
      halfHeight: READOUT_PANEL_HALF_HEIGHT_EQUATION,
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
   * Recompute positions + visibility based on `visibilityMask`. Called
   * from the constructor and from setValues whenever a slot crosses zero.
   * Reflow at this granularity is cheap because the snap-to-zero detent
   * (Slider.ts ZERO_DETENT) makes mask transitions acyclic — once a
   * slider hits 0 it stays there until re-grabbed, so this fires at
   * grab/release boundaries (and tween completion), never per-frame
   * mid-drag.
   *
   * Each line is independently centered on x=0. Top line's invisible-when-
   * empty contract: if a/b/c are all zero, the top line drops out entirely
   * (no reserved height). Bottom line always renders at minimum `= ±N.NN`
   * because d is forced visible — keeps the equation's RHS anchor.
   */
  private applyLayout(): void {
    const numericW = NUMERIC_SLOT_EM * this.fontSize;
    const separatorW = SEPARATOR_SLOT_EM * this.fontSize;
    const separatorTailW = SEPARATOR_TAIL_EM * this.fontSize;
    const topY = READOUT_LINE_PITCH / 2;
    const bottomY = -READOUT_LINE_PITCH / 2;

    const topVisible = TOP_SLOTS.filter((s) => this.visibilityMask[s]);
    const bottomNonDVisible = BOTTOM_NON_D_SLOTS.filter(
      (s) => this.visibilityMask[s],
    );

    // Hide numerics that are masked out — applies to both lines uniformly.
    // d is masked-in (always-visible), so this loop never touches it.
    for (let i = 0; i < NUMERIC_SLOT_COUNT; i++) {
      if (!this.visibilityMask[i]) this.numericTexts[i].visible = false;
    }

    // --- Top line ---
    if (topVisible.length === 0) {
      for (const t of this.topSeparators) t.visible = false;
    } else {
      const totalTopW =
        topVisible.length * numericW +
        Math.max(0, topVisible.length - 1) * separatorW +
        separatorTailW;
      let cursor = -totalTopW / 2;
      let sepIdx = 0;
      for (let i = 0; i < topVisible.length; i++) {
        const slot = topVisible[i];
        const isLast = i === topVisible.length - 1;
        // Numeric.
        const nText = this.numericTexts[slot];
        nText.position.set(cursor + numericW / 2, topY, 0);
        nText.visible = true;
        cursor += numericW;
        // Following separator — connector for non-last, tail for last.
        const sep = this.topSeparators[sepIdx++];
        if (isLast) {
          sep.text = ` ${NUMERIC_VAR_LABEL[slot]}`;
          sep.position.set(cursor + separatorTailW / 2, topY, 0);
          cursor += separatorTailW;
        } else {
          sep.text = ` ${NUMERIC_VAR_LABEL[slot]} + `;
          sep.position.set(cursor + separatorW / 2, topY, 0);
          cursor += separatorW;
        }
        sep.visible = true;
        sep.sync();
      }
      for (let i = sepIdx; i < this.topSeparators.length; i++) {
        this.topSeparators[i].visible = false;
      }
    }

    // --- Bottom line ---
    // d is always visible. Three structural cases:
    //   * non-d empty       → ` = ` + d
    //   * non-d 1+ visible  → [non-d numerics with between-connectors] +
    //                          ` <last-var> = ` + d
    const bottomNumericCount = bottomNonDVisible.length + 1;
    const bottomSepCount = Math.max(1, bottomNonDVisible.length);
    const totalBottomW =
      bottomNumericCount * numericW + bottomSepCount * separatorW;
    let cursor = -totalBottomW / 2;
    let bSepIdx = 0;

    if (bottomNonDVisible.length === 0) {
      const sep = this.bottomSeparators[bSepIdx++];
      sep.text = ' = ';
      sep.position.set(cursor + separatorW / 2, bottomY, 0);
      sep.visible = true;
      sep.sync();
      cursor += separatorW;
    } else {
      for (let i = 0; i < bottomNonDVisible.length; i++) {
        const slot = bottomNonDVisible[i];
        const isLast = i === bottomNonDVisible.length - 1;
        // Numeric.
        const nText = this.numericTexts[slot];
        nText.position.set(cursor + numericW / 2, bottomY, 0);
        nText.visible = true;
        cursor += numericW;
        // Following separator — connector to next non-d, or to d if last.
        const sep = this.bottomSeparators[bSepIdx++];
        sep.text = isLast
          ? ` ${NUMERIC_VAR_LABEL[slot]} = `
          : ` ${NUMERIC_VAR_LABEL[slot]} + `;
        sep.position.set(cursor + separatorW / 2, bottomY, 0);
        sep.visible = true;
        sep.sync();
        cursor += separatorW;
      }
    }

    // d (always rendered).
    const dText = this.numericTexts[SLOT_D];
    dText.position.set(cursor + numericW / 2, bottomY, 0);
    dText.visible = true;

    for (let i = bSepIdx; i < this.bottomSeparators.length; i++) {
      this.bottomSeparators[i].visible = false;
    }
  }

  /**
   * Update the seven numeric values. Throttled to ≈30 Hz; pre-throttle the
   * work would dominate troika SDF rebuild cost during fast drags (#38
   * rationale, ported from Slider's per-slider label cap). Sign is always
   * shown explicitly (matching the per-slider label format) so transitions
   * across zero are unambiguous on every slot, top line and bottom alike.
   *
   * Reflow path (#95): if any slot's exact-zero state changed since the
   * last update, the visibility mask flips and applyLayout() re-runs.
   * Hidden slots skip the numeric-text write — the cached value stays
   * stale, but that's fine: the next un-hide is by definition a value
   * change (0 → non-zero), so the cache mismatch retriggers the write.
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
    // Bypass the throttle on the first call so the boot-hidden group
    // can uncloak with real text on frame 1 even if `lastSyncMs` was
    // somehow within the throttle window at construction (defensive —
    // in practice `lastSyncMs = 0` and `now - 0` is always >> 33 ms).
    if (
      this.hasBootstrapped &&
      now - this.lastSyncMs < READOUT_SYNC_INTERVAL_MS
    ) {
      return;
    }
    this.lastSyncMs = now;

    // Indexed in visual reading order [a, b, c, u, v, w, d] to match the
    // slot constants and coefficientColors array.
    const values = [a, b, c, u, v, w, d];

    let maskChanged = false;
    for (let i = 0; i < NUMERIC_SLOT_COUNT; i++) {
      const visible = i === SLOT_D ? true : values[i] !== 0;
      if (visible !== this.visibilityMask[i]) {
        this.visibilityMask[i] = visible;
        maskChanged = true;
      }
    }
    if (maskChanged) this.applyLayout();

    for (let i = 0; i < NUMERIC_SLOT_COUNT; i++) {
      if (!this.visibilityMask[i]) continue;
      const value = values[i];
      if (value === this.numericValues[i]) continue;
      this.numericValues[i] = value;
      this.numericTexts[i].text = formatSignedMagnitude(value);
      this.numericTexts[i].sync();
    }

    // First-call uncloak (#201 PR 3). All numeric `.sync()` writes
    // above have completed for any dirty slot; `applyLayout` (if it
    // ran on a mask change) has also fired its inline separator syncs.
    // Flipping `group.visible = true` here paints the first real frame.
    if (!this.hasBootstrapped) {
      this.group.visible = true;
      this.hasBootstrapped = true;
    }
  }

  // Yaw-only billboard inherited from PanelReadout base (#252).

  dispose(): void {
    for (const t of this.numericTexts) t.dispose();
    for (const t of this.topSeparators) t.dispose();
    for (const t of this.bottomSeparators) t.dispose();
    this.disposePanel();
  }
}
