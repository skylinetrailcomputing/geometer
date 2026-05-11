// Per-slider angular value formatter (#170). Renders a textbook
// π-fraction glyph when (and only when) the value is a snap point of the
// slider that produced it; otherwise renders as an `Xπ` decimal. Sign
// glyph is U+2212 MINUS for negatives.

const MINUS = '−'; // U+2212 — matches the cluster's signed-numeric glyph

// Map from a (snapped) angular value to its textbook π-fraction glyph.
// Comprehensive: covers ±0, ±π/4, ±π/2, ±3π/4, ±π even though no v0.7
// shipped slider snaps at ±π/4 / ±3π/4. Per-slider gating via the
// `snapPoints` argument means unused entries don't fire — the map is
// forward-compatible for v0.8+ scenes that may add those snaps.
const PI_FRACTION_LABELS: ReadonlyMap<number, string> = new Map([
  [0, '0'],
  [Math.PI / 4, 'π/4'],
  [-Math.PI / 4, `${MINUS}π/4`],
  [Math.PI / 2, 'π/2'],
  [-Math.PI / 2, `${MINUS}π/2`],
  [(3 * Math.PI) / 4, '3π/4'],
  [-(3 * Math.PI) / 4, `${MINUS}3π/4`],
  [Math.PI, 'π'],
  [-Math.PI, `${MINUS}π`],
]);

/**
 * Render an angle as a textbook π-fraction when (and only when) the
 * value is a snap point of the slider that produced it; otherwise
 * render as a `Xπ` decimal. Sign glyph is U+2212 MINUS for negatives.
 *
 * `snapPoints` is the caller slider's actual snap-points array.
 * Gating the label-map lookup on this avoids a false snap-detent
 * signal for an off-snap value that happens to equal a standard
 * π-fraction — e.g., `PHI_INITIAL = π/4` in scenes whose φ slider
 * doesn't snap at π/4 (closes the triple-CONVERGENT roundtable
 * finding documented in `_private/plans/170-slider-value-labels.md` §0).
 *
 * Contract preconditions (per `Slider.ts:159-161`): `rad` is
 * `slider.value` — either an exact snap point (matched via `===`
 * against `snapPoints`) or strictly outside every detent window.
 * Callers must pass the SAME `snapPoints` array the slider was
 * constructed with.
 */
export function formatAnglePiFraction(
  rad: number,
  snapPoints: readonly number[],
): string {
  if (snapPoints.includes(rad)) {
    const label = PI_FRACTION_LABELS.get(rad);
    if (label !== undefined) return label;
    // Snap point not in the label map (e.g., a future slider snapping
    // at π/6). Fall through to the Xπ decimal — graceful degradation.
  }
  // Off-snap (or snap not in label map). Convert to π-multiples and
  // format to two decimals; carry sign glyph manually so negatives
  // render with U+2212.
  const piMultiple = rad / Math.PI;
  const sign = piMultiple < 0 ? MINUS : '';
  const magnitude = Math.abs(piMultiple).toFixed(2);
  return `${sign}${magnitude}π`;
}
