import * as THREE from 'three';
import { Text } from 'troika-three-text';

// Live equation readout above the slider rack (#58). Renders the equation
// `±N.NN x² + ±N.NN y² + ±N.NN z² = ±N.NN` with the four coefficient
// numerics colored to match their sliders, and the static algebraic
// glue (variables, operators) neutral white. The whole thing is yaw-only
// billboarded as a single unit so the equation reads from one consistent
// direction.
//
// troika-three-text doesn't support inline rich text / per-span color, so
// the equation is built from seven independent Text instances laid out
// at fixed offsets: 4 numeric slots interleaved with 3 separators.
// Numeric slots are sized to comfortably hold the worst-case value
// `−N.NN` / `+N.NN`; separator slots size to their fixed content. The
// constants are em-based so retuning fontSize stays self-consistent.

export interface EquationReadoutOptions {
  // Per-coefficient diffuse colors, indexed (a, b, c, d). Match the slider
  // thumb colors so the user can read the equation top-to-bottom or
  // left-to-right and see the same color story either way.
  coefficientColors: readonly [number, number, number, number];
  fontSize?: number;
}

const DEFAULT_FONT_SIZE = 0.028;

// Slot widths in em (multiples of fontSize), tuned to Roboto-ish defaults
// in troika. Numeric slot accommodates the worst-case `−N.NN`; separator
// slot fits ` x² + ` / ` z² = ` with a touch of breathing room. Refine in
// headset if pieces look crowded or splayed.
const NUMERIC_SLOT_EM = 2.6;
const SEPARATOR_SLOT_EM = 2.4;

const SEPARATOR_CONTENT = [' x² + ', ' y² + ', ' z² = '] as const;
const SEPARATOR_COLOR = 0xffffff;
const OUTLINE_WIDTH = '8%';
const OUTLINE_COLOR = 0x000000;

// Throttle the numeric .sync() calls to ≈30 Hz, mirroring the per-slider
// value-label cap in #38 (and now retired alongside it). Bounds troika SDF
// re-build work; head-pose billboarding (faceCamera) still runs every
// frame so motion smoothness is unaffected.
const SYNC_INTERVAL_MS = 33;

export class EquationReadout {
  readonly group: THREE.Group;

  private readonly numericTexts: readonly Text[];
  private readonly numericValues: number[] = [NaN, NaN, NaN, NaN];
  private readonly separatorTexts: readonly Text[];
  private lastSyncMs = 0;

  // Hoisted out of `faceCamera` so per-frame billboarding does no allocation.
  private readonly camWorld = new THREE.Vector3();
  private readonly groupWorld = new THREE.Vector3();

  constructor(opts: EquationReadoutOptions) {
    const fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;
    const numericW = NUMERIC_SLOT_EM * fontSize;
    const separatorW = SEPARATOR_SLOT_EM * fontSize;
    const totalW = 4 * numericW + 3 * separatorW;

    this.group = new THREE.Group();
    this.group.name = 'equation-readout';

    // Slot centers, left-to-right: a, " x² + ", b, " y² + ", c, " z² = ", d.
    // Slot indices alternate numeric (even) and separator (odd).
    const slotCentersX: number[] = [];
    let cursor = -totalW / 2;
    for (let i = 0; i < 7; i++) {
      const w = i % 2 === 0 ? numericW : separatorW;
      slotCentersX.push(cursor + w / 2);
      cursor += w;
    }

    const numericTexts: Text[] = [];
    for (let i = 0; i < 4; i++) {
      const t = new Text();
      t.fontSize = fontSize;
      t.color = opts.coefficientColors[i];
      t.anchorX = 'center';
      t.anchorY = 'middle';
      t.outlineWidth = OUTLINE_WIDTH;
      t.outlineColor = OUTLINE_COLOR;
      t.position.set(slotCentersX[i * 2], 0, 0);
      this.group.add(t);
      numericTexts.push(t);
    }
    this.numericTexts = numericTexts;

    const separatorTexts: Text[] = [];
    for (let i = 0; i < 3; i++) {
      const t = new Text();
      t.fontSize = fontSize;
      t.color = SEPARATOR_COLOR;
      t.anchorX = 'center';
      t.anchorY = 'middle';
      t.outlineWidth = OUTLINE_WIDTH;
      t.outlineColor = OUTLINE_COLOR;
      t.position.set(slotCentersX[i * 2 + 1], 0, 0);
      t.text = SEPARATOR_CONTENT[i];
      t.sync();
      this.group.add(t);
      separatorTexts.push(t);
    }
    this.separatorTexts = separatorTexts;
  }

  /**
   * Update the four coefficient values. Throttled to ≈30 Hz; pre-throttle
   * the work would dominate troika SDF rebuild cost during fast drags
   * (#38 rationale, ported from Slider's per-slider label cap). Sign is
   * always shown explicitly (matching the old per-slider label format)
   * so transitions across zero are unambiguous.
   */
  setValues(a: number, b: number, c: number, d: number): void {
    const now = performance.now();
    if (now - this.lastSyncMs < SYNC_INTERVAL_MS) return;
    this.lastSyncMs = now;

    const values = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      const v = values[i];
      if (v === this.numericValues[i]) continue;
      this.numericValues[i] = v;
      const sign = v < 0 ? '−' : '+';
      this.numericTexts[i].text = `${sign}${Math.abs(v).toFixed(2)}`;
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
