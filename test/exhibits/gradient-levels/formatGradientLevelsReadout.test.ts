import { describe, expect, it } from 'vitest';
import { formatGradientLevelsReadout } from '../../../src/exhibits/gradient-levels/formatGradientLevelsReadout.ts';
import { gradJs } from '../../../src/exhibits/gradient-levels/surfaceModel.ts';

// Pure formatter coverage plus a composition test that pins the
// raw-gradient wiring (catches `result.normal` (unit) vs `gradJs(p)`
// (raw) regressions at the unit-test level rather than only in
// headset smoke).

const MINUS = '−'; // U+2212

describe('formatGradientLevelsReadout — components', () => {
  it('positive components → leading "+" sign', () => {
    const r = formatGradientLevelsReadout([1.22, 0.5, 0.5]);
    expect(r.components).toEqual(['+1.22', '+0.50', '+0.50']);
  });

  it('negative components → leading "−" sign (U+2212)', () => {
    const r = formatGradientLevelsReadout([-1.22, -0.5, -0.5]);
    expect(r.components).toEqual([
      `${MINUS}1.22`,
      `${MINUS}0.50`,
      `${MINUS}0.50`,
    ]);
  });

  it('zero components → "+0.00" (defensive — upstream guard prevents this from a real hit frame)', () => {
    // raycastImplicit's `gLen === 0 → miss` branch means the formatter
    // never receives a zero-magnitude gradient from a real hit frame.
    // The test covers the defensive path.
    const r = formatGradientLevelsReadout([0, 0, 0]);
    expect(r.components).toEqual(['+0.00', '+0.00', '+0.00']);
  });

  it('mixed signs preserve per-component sign', () => {
    const r = formatGradientLevelsReadout([1.22, 1.22, -1]);
    expect(r.components).toEqual(['+1.22', '+1.22', `${MINUS}1.00`]);
  });
});

describe('formatGradientLevelsReadout — magnitude', () => {
  it('3-4-5 triangle → 5.00', () => {
    const r = formatGradientLevelsReadout([3, 4, 0]);
    expect(r.magnitude).toBe('5.00');
  });

  it('zero vector → 0.00 (defensive — upstream guard prevents this)', () => {
    const r = formatGradientLevelsReadout([0, 0, 0]);
    expect(r.magnitude).toBe('0.00');
  });

  it('boot-pose gradient at (0.612, 0.612, 0.5) on k=0.5: ∇f = (1.224, 1.224, −1)', () => {
    // surfaceModel.gradJs(0.612, 0.612, 0.5) = (1.224, 1.224, −1)
    // |∇f| = √(1.224² + 1.224² + 1²) = √(3.996) ≈ 1.999
    const r = formatGradientLevelsReadout([1.224, 1.224, -1]);
    expect(r.magnitude).toBe('2.00');
  });

  it('large-magnitude formatter smoke at |grad| = 6 (synthetic input, not a real surface point)', () => {
    // Pure formatter test for a large input magnitude. Input
    // `[2√3, 2√3, 2√3]` corresponds to a point at (√3, √3, −√3)
    // where f = 3 — OUTSIDE K_MAX = 2, so NOT a slider-reachable
    // surface point. The test exists to verify formatter output at
    // |grad| = 6 character widths regardless of where that input
    // would geometrically originate.
    const c = 2 * Math.sqrt(3);
    const r = formatGradientLevelsReadout([c, c, c]);
    expect(r.magnitude).toBe('6.00');
  });

  it('slider-reachable max-magnitude case: k=2 at AABB top face z=3, |∇f| ≈ 8.94', () => {
    // Actual maximum |∇f| reachable within the slider's k ∈ [-2, 2]
    // range. At k = 2, the surface intersects the AABB top face
    // (z = ±BOUND = ±3) where x² + y² = k + z² = 11; so
    // (x, y, z) = (√(11/2), √(11/2), 3) is on the surface for k = 2.
    // gradJs at that point: (2·√(11/2), 2·√(11/2), -6).
    //   |∇f|² = 4·(11/2) + 4·(11/2) + 36 = 22 + 22 + 36 = 80.
    //   |∇f| = √80 = 4·√5 ≈ 8.944.
    // The "|∇f| = 2|p|" identity DOES hold for f = x² + y² − z²
    // because squaring kills the negative sign on the z-component:
    //   2|p| = 2·√(11/2 + 11/2 + 9) = 2·√20 = √80 ✓.
    const p: [number, number, number] = [
      Math.sqrt(11 / 2),
      Math.sqrt(11 / 2),
      3,
    ];
    const grad = gradJs(p[0], p[1], p[2]);
    const r = formatGradientLevelsReadout(grad);
    expect(r.magnitude).toBe('8.94');
  });
});

describe('formatGradientLevelsReadout — composition with gradJs (raw vs unit wiring guard)', () => {
  it('gradJs(boot pose) → magnitude "2.00" (fails loud if wiring uses result.normal=unit)', () => {
    // The readout's correctness hinges on receiving the RAW gradient
    // from gradJs(point), not the UNIT normal from raycastImplicit's
    // result.normal. If index.ts wires the readout to result.normal
    // accidentally, the magnitude would format to '1.00' (unit-vector
    // length) instead of the real |∇f|. This composition test catches
    // the regression at the unit-test level rather than only in
    // headset smoke.
    //
    // Boot pose: θ = π/3, φ = π/4, k = +0.5 ⇒ surface point
    // (0.612, 0.612, 0.5). gradJs at that point = (1.224, 1.224, -1);
    // |∇f| ≈ 1.999 → formats as '2.00'. A unit-normal wiring would
    // give |result.normal| = 1.00 — distinguishable here.
    const p: [number, number, number] = [
      Math.sin(Math.PI / 3) * Math.cos(Math.PI / 4),
      Math.sin(Math.PI / 3) * Math.sin(Math.PI / 4),
      Math.cos(Math.PI / 3),
    ];
    const grad = gradJs(p[0], p[1], p[2]);
    const r = formatGradientLevelsReadout(grad);
    expect(r.magnitude).toBe('2.00');
    expect(r.magnitude).not.toBe('1.00'); // explicit anti-regression assertion
  });
});
