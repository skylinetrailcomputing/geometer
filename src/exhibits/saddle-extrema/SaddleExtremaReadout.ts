import * as THREE from 'three';
import { Text } from 'troika-three-text';
import {
  READOUT_FONT_SIZE,
  READOUT_LINE_PITCH,
  READOUT_OUTLINE_COLOR,
  READOUT_OUTLINE_WIDTH,
  READOUT_SYNC_INTERVAL_MS,
} from '@/scaffold/ui/readoutTokens';
import {
  formatSaddleExtremaReadout,
  type SaddleExtremaReadoutStrings,
} from './formatSaddleExtremaReadout';
import type { Hessian } from './presets';

// Live classification readout for the saddle-extrema scene (#181).
// Three-line layout:
//
//   line 1 (top): `f_xx = ±N.NN   f_xy = ±N.NN   f_yy = ±N.NN`
//   line 2 (mid): `D = ±N.NN`
//   line 3 (bot): `<verdict>`
//
// The top line spells out the three symmetric-Hessian entries; the
// diagonal entries are tinted with the cluster's math-X / math-Y axis
// colors (vermillion / bluish-green) to reinforce "f_xx is the pure-x²
// term, f_yy is the pure-y² term," while the off-diagonal f_xy stays
// white to read as "neither pure axis — it's the mix." Line 2's `D`
// and line 3's verdict are YELLOW accents, matching the cluster's
// "interpretive numeric" convention from gradient-levels (#166).
//
// Per-entry prefixes (`f_xx = `, etc.) are kept literal here rather
// than unicode subscripts — Unicode lacks a subscript-`y`, so the
// `fₓₓ / fᵧᵧ` form would be asymmetric (`fₓₓ / f_yy`). The literal
// underscore form reads consistently across all three.
//
// Sibling design choice (vs. extending `GradientLevelsReadout`):
// GradientLevelsReadout has 4 slots in a 2-line layout (3 components +
// 1 magnitude); this readout has 5 slots in a 3-line layout (3 H
// entries + D + verdict). The slot wiring, line layout, and per-slot
// label-vs-value treatment all differ enough that wrapping the
// troika-Text + yaw-billboard idioms here keeps the surface narrow,
// matching the rationale gradient-levels' readout used to justify
// not extending tangent-planes'.
//
// Layout is computed once at construction; only numeric .text values
// (and the verdict string) change per frame, throttled to ≈30 Hz like
// `GradientLevelsReadout` / `TangentPlaneReadout`.
//
// Initial-text policy: Text instances boot empty; `group.visible =
// false` until the first `setValues()` call populates the slots. The
// saddle-extrema scene's boot pose hits valid Hessian data on the
// first tick, so the readout uncloaks within one frame.

export interface SaddleExtremaReadoutOptions {
  /**
   * Diffuse color for the f_xx entry (math-X axis tint at the call
   * site). Constructor accepts the value so the class stays
   * presentation-agnostic.
   */
  fxxColor: number;
  /**
   * Diffuse color for the f_xy cross-term entry. White at the call
   * site — no single axis association.
   */
  fxyColor: number;
  /**
   * Diffuse color for the f_yy entry (math-Y axis tint at the call
   * site).
   */
  fyyColor: number;
  /** Diffuse color for the D value and verdict text (YELLOW accent). */
  accentColor: number;
  fontSize?: number;
}

// Slot widths in em (multiples of fontSize). NUMERIC_ENTRY_EM fits
// worst-case `−12.00` (monkey saddle / quartic at domain corners);
// NUMERIC_D_EM fits worst-case `−103.68` (monkey saddle at corner
// `(1.2, 1.2)`: D = 36·(x² + y²) ≈ 103.68 with sign from sliders).
const NUMERIC_ENTRY_EM = 3.2;
const NUMERIC_D_EM = 4.2;

// Top-line per-entry prefix `f_xx = ` (and `f_xy = `, `f_yy = `).
const PREFIX_ENTRY_EM = 3.5;
// Between adjacent entry pairs on the top line.
const TOP_ENTRY_GAP_EM = 1.2;
// `D = ` on the middle line.
const PREFIX_D_EM = 2.0;

const SEPARATOR_COLOR = 0xffffff;

// Entry-slot index range — `for i = ENTRY_XX; i <= ENTRY_YY` covers
// [f_xx, f_xy, f_yy] in math reading order. The middle index (f_xy)
// has no symbolic name; the loop body indexes the per-slot arrays
// directly.
const ENTRY_XX = 0;
const ENTRY_YY = 2;

export class SaddleExtremaReadout {
  readonly group: THREE.Group;

  private readonly fontSize: number;

  // Top-line entry numerics: [f_xx, f_xy, f_yy].
  private readonly entryNumerics: readonly Text[];

  // Middle-line D numeric.
  private readonly dNumeric: Text;

  // Bottom-line verdict text.
  private readonly verdictText: Text;

  // Static prefixes / separators. Held for disposal; never re-written.
  private readonly separators: Text[] = [];

  // Per-slot string cache so .text + .sync() doesn't fire when the
  // formatted string hasn't changed across the throttle gate.
  private readonly entryCache: string[] = new Array(3).fill('');
  private dCache = '';
  private verdictCache = '';

  private lastSyncMs = 0;

  // Hoisted scratch for per-frame yaw billboarding — no allocation.
  private readonly camWorld = new THREE.Vector3();
  private readonly groupWorld = new THREE.Vector3();

  constructor(opts: SaddleExtremaReadoutOptions) {
    this.fontSize = opts.fontSize ?? READOUT_FONT_SIZE;

    this.group = new THREE.Group();
    this.group.name = 'saddle-extrema-readout';
    // Hidden until first setValues() populates the numerics. Avoids
    // painting empty strings on the first frame between mount and
    // first update().
    this.group.visible = false;

    const numericEntryW = NUMERIC_ENTRY_EM * this.fontSize;
    const numericDW = NUMERIC_D_EM * this.fontSize;
    const prefixEntryW = PREFIX_ENTRY_EM * this.fontSize;
    const prefixDW = PREFIX_D_EM * this.fontSize;
    const topGapW = TOP_ENTRY_GAP_EM * this.fontSize;

    const topY = READOUT_LINE_PITCH;
    const midY = 0;
    const bottomY = -READOUT_LINE_PITCH;

    // ─── Top line ──────────────────────────────────────────────────
    // `f_xx = ` [n_xx] `   f_xy = ` [n_xy] `   f_yy = ` [n_yy]
    const totalTopW =
      3 * prefixEntryW + 3 * numericEntryW + 2 * topGapW;
    let cursor = -totalTopW / 2;

    const entryColors: readonly [number, number, number] = [
      opts.fxxColor,
      opts.fxyColor,
      opts.fyyColor,
    ];
    const entryPrefixes: readonly [string, string, string] = [
      'f_xx = ',
      'f_xy = ',
      'f_yy = ',
    ];

    const entryNumerics: Text[] = new Array<Text>(3);
    for (let i = ENTRY_XX; i <= ENTRY_YY; i++) {
      const prefix = this.makeSeparatorText(this.fontSize);
      prefix.text = entryPrefixes[i];
      prefix.position.set(cursor + prefixEntryW / 2, topY, 0);
      prefix.sync();
      this.group.add(prefix);
      this.separators.push(prefix);
      cursor += prefixEntryW;

      const nText = this.makeNumericText(this.fontSize, entryColors[i]);
      nText.position.set(cursor + numericEntryW / 2, topY, 0);
      this.group.add(nText);
      entryNumerics[i] = nText;
      cursor += numericEntryW;

      if (i !== ENTRY_YY) cursor += topGapW;
    }
    this.entryNumerics = entryNumerics;

    // ─── Middle line ───────────────────────────────────────────────
    // `D = ` [d]
    const totalMidW = prefixDW + numericDW;
    cursor = -totalMidW / 2;

    const dPrefix = this.makeSeparatorText(this.fontSize);
    dPrefix.text = 'D = ';
    dPrefix.position.set(cursor + prefixDW / 2, midY, 0);
    dPrefix.sync();
    this.group.add(dPrefix);
    this.separators.push(dPrefix);
    cursor += prefixDW;

    this.dNumeric = this.makeNumericText(this.fontSize, opts.accentColor);
    this.dNumeric.position.set(cursor + numericDW / 2, midY, 0);
    this.group.add(this.dNumeric);

    // ─── Bottom line ───────────────────────────────────────────────
    // verdict (single centered text slot). Anchored at x = 0 with
    // `anchorX: 'center'` so it stays centered as the verdict-text
    // length changes — 'saddle' (6 chars) ↔ 'inconclusive' (12 chars).
    this.verdictText = this.makeNumericText(this.fontSize, opts.accentColor);
    this.verdictText.position.set(0, bottomY, 0);
    this.group.add(this.verdictText);
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
   * Update all five slots from the per-frame Hessian. Throttled to
   * ≈30 Hz via READOUT_SYNC_INTERVAL_MS, with per-slot caching so unchanged
   * strings don't re-trigger troika's `.sync()`.
   *
   * On first call, uncloaks `group.visible = true` — the readout
   * boots hidden so empty-string frames never paint.
   */
  setValues(hessian: Hessian): void {
    if (!this.group.visible) this.group.visible = true;

    const now = performance.now();
    if (now - this.lastSyncMs < READOUT_SYNC_INTERVAL_MS) return;
    this.lastSyncMs = now;

    const s: SaddleExtremaReadoutStrings = formatSaddleExtremaReadout(hessian);

    for (let i = ENTRY_XX; i <= ENTRY_YY; i++) {
      const entry = s.hessianEntries[i];
      if (entry !== this.entryCache[i]) {
        this.entryCache[i] = entry;
        this.entryNumerics[i].text = entry;
        this.entryNumerics[i].sync();
      }
    }

    if (s.determinant !== this.dCache) {
      this.dCache = s.determinant;
      this.dNumeric.text = s.determinant;
      this.dNumeric.sync();
    }

    if (s.verdict !== this.verdictCache) {
      this.verdictCache = s.verdict;
      this.verdictText.text = s.verdict;
      this.verdictText.sync();
    }
  }

  // Yaw-only billboard. World-up stays world-up; head pitch/roll don't
  // tilt the readout. Mirrors GradientLevelsReadout / TangentPlaneReadout
  // / Label.
  faceCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    this.group.getWorldPosition(this.groupWorld);
    const dx = this.camWorld.x - this.groupWorld.x;
    const dz = this.camWorld.z - this.groupWorld.z;
    this.group.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  dispose(): void {
    for (const t of this.entryNumerics) t.dispose();
    this.dNumeric.dispose();
    this.verdictText.dispose();
    for (const t of this.separators) t.dispose();
  }
}
