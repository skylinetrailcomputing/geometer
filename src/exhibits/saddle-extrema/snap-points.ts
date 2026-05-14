// Per-axis snap-point list for the saddle-extrema scene's x / y sliders
// (#200). Each preset's critical-point list `(x, y)[]` projects onto the
// two slider axes; the projection plus the canonical origin seed becomes
// the slider's `snapPoints` array.
//
// Lives in its own sub-file (not in `index.ts`) so the corresponding
// Vitest spec can import the pure helper without triggering the
// `registerExhibit` side-effect at module load. Same precedent as
// `presets.ts` / `quadrics/classify.ts`.

/**
 * Project a list of analytically-known 2D critical points onto one
 * slider axis, seed the canonical origin detent, dedupe via exact
 * equality, and return a sorted ascending array.
 *
 * `axis` selects which CP coordinate is projected:
 *   - `0` for the x-axis slider (reads `cp[0]`)
 *   - `1` for the y-axis slider (reads `cp[1]`)
 *
 * Near-equal-but-not-exact CPs (e.g., `0.5` and `0.5000001` from an
 * analytic solve) are NOT collapsed here — `Slider.setSnapPoints`'s
 * validator catches that case via the overlap-throw with a diagnostic
 * naming the two offending values.
 */
export function buildAxisSnapPoints(
  criticalPoints: readonly (readonly [number, number])[],
  axis: 0 | 1,
): readonly number[] {
  const set = new Set<number>([0]);
  for (const cp of criticalPoints) set.add(cp[axis]);
  return [...set].sort((a, b) => a - b);
}
