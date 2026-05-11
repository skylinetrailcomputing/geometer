import { describe, expect, it } from 'vitest';
import {
  classifySaddleExtrema,
  formatSaddleExtremaReadout,
} from '@/exhibits/saddle-extrema/formatSaddleExtremaReadout';
import { PRESETS } from '@/exhibits/saddle-extrema/presets';

// Pure-formatter + classifier coverage for the saddle-extrema readout
// (#181). Numeric formatting follows `formatSignedMagnitude` (covered
// at scaffold level); the per-archetype classification verdicts are
// the load-bearing logic here.

const MINUS = '−'; // U+2212

describe('classifySaddleExtrema — second-derivative test branches', () => {
  it('D > 0 and f_xx > 0 ⇒ local min', () => {
    // f = x² + y² at origin ⇒ H = [[2, 0], [0, 2]], D = 4.
    expect(classifySaddleExtrema([2, 0, 2])).toBe('local min');
  });

  it('D > 0 and f_xx < 0 ⇒ local max', () => {
    // f = -(x² + y²) at origin ⇒ H = [[-2, 0], [0, -2]], D = 4.
    expect(classifySaddleExtrema([-2, 0, -2])).toBe('local max');
  });

  it('D < 0 ⇒ saddle', () => {
    // f = x² - y² at origin ⇒ H = [[2, 0], [0, -2]], D = -4.
    expect(classifySaddleExtrema([2, 0, -2])).toBe('saddle');
  });

  it('D == 0 (monkey saddle at origin) ⇒ inconclusive', () => {
    // f = x³ - 3xy² at origin ⇒ H = 0 ⇒ D = 0 ⇒ test fails.
    expect(classifySaddleExtrema([0, 0, 0])).toBe('inconclusive');
  });

  it('D == 0 (x⁴ + y⁴ at origin, surface IS a local min) ⇒ inconclusive', () => {
    // The §11.7–11.8 punch-line case: D = 0 but surface is unambiguously
    // a local min. The verdict honors the test's silence rather than
    // promoting it to 'local min' via knowledge the test doesn't have.
    expect(classifySaddleExtrema([0, 0, 0])).toBe('inconclusive');
  });

  it('|D| < eps default (1e-9) ⇒ inconclusive', () => {
    // f_xx · f_yy − f_xy² ≈ 1e-10 — below the default band.
    expect(classifySaddleExtrema([1e-5, 0, 1e-5])).toBe('inconclusive');
  });

  it('non-zero cross term still classifies via D sign', () => {
    // f_xx = 3, f_xy = 1, f_yy = 2 ⇒ D = 6 - 1 = 5 > 0, f_xx > 0 ⇒ min.
    expect(classifySaddleExtrema([3, 1, 2])).toBe('local min');
  });

  it('caller-supplied eps band widens the inconclusive region', () => {
    // D = 0.5; default eps would classify as 'local min' (D > 0, f_xx > 0).
    // Caller eps = 1 reclassifies as inconclusive.
    expect(classifySaddleExtrema([1, 0, 0.5])).toBe('local min');
    expect(classifySaddleExtrema([1, 0, 0.5], 1)).toBe('inconclusive');
  });
});

describe('formatSaddleExtremaReadout — string slot formatting', () => {
  it('positive entries → leading "+" sign', () => {
    const r = formatSaddleExtremaReadout([2, 0, 2]);
    expect(r.hessianEntries).toEqual(['+2.00', '+0.00', '+2.00']);
    expect(r.determinant).toBe('+4.00');
  });

  it('negative entries → leading "−" sign (U+2212)', () => {
    const r = formatSaddleExtremaReadout([-2, 0, -2]);
    expect(r.hessianEntries).toEqual([
      `${MINUS}2.00`,
      '+0.00',
      `${MINUS}2.00`,
    ]);
    expect(r.determinant).toBe('+4.00');
  });

  it('saddle (D < 0) → negative determinant string', () => {
    const r = formatSaddleExtremaReadout([2, 0, -2]);
    expect(r.determinant).toBe(`${MINUS}4.00`);
    expect(r.verdict).toBe('saddle');
  });

  it('non-zero cross term contributes to D = f_xx·f_yy − f_xy²', () => {
    // f_xx = 3, f_xy = 1, f_yy = 2 ⇒ D = 5.
    const r = formatSaddleExtremaReadout([3, 1, 2]);
    expect(r.hessianEntries).toEqual(['+3.00', '+1.00', '+2.00']);
    expect(r.determinant).toBe('+5.00');
  });
});

describe('formatSaddleExtremaReadout — composition with preset library at origin', () => {
  // Each preset's critical point sits at the origin (SPEC §"Pedagogical
  // observation — all critical points at origin"). Feeding `hessF(0, 0)`
  // into the formatter must produce the SPEC's tabulated verdict.

  it('paraboloid at origin ⇒ local min, D = +4', () => {
    const preset = PRESETS.find((p) => p.id === 'paraboloid')!;
    const r = formatSaddleExtremaReadout(preset.hessF(0, 0));
    expect(r.verdict).toBe('local min');
    expect(r.determinant).toBe('+4.00');
  });

  it('inv-paraboloid at origin ⇒ local max, D = +4', () => {
    const preset = PRESETS.find((p) => p.id === 'inv-paraboloid')!;
    const r = formatSaddleExtremaReadout(preset.hessF(0, 0));
    expect(r.verdict).toBe('local max');
    expect(r.determinant).toBe('+4.00');
  });

  it('saddle at origin ⇒ saddle, D = −4', () => {
    const preset = PRESETS.find((p) => p.id === 'saddle')!;
    const r = formatSaddleExtremaReadout(preset.hessF(0, 0));
    expect(r.verdict).toBe('saddle');
    expect(r.determinant).toBe(`${MINUS}4.00`);
  });

  it('monkey-saddle at origin ⇒ inconclusive (D = 0)', () => {
    const preset = PRESETS.find((p) => p.id === 'monkey-saddle')!;
    const r = formatSaddleExtremaReadout(preset.hessF(0, 0));
    expect(r.verdict).toBe('inconclusive');
    expect(r.determinant).toBe('+0.00');
  });

  it('quartic-min at origin ⇒ inconclusive (D = 0, but surface IS min — test failure case)', () => {
    const preset = PRESETS.find((p) => p.id === 'quartic-min')!;
    const r = formatSaddleExtremaReadout(preset.hessF(0, 0));
    // The second-derivative test is *silent* here even though the
    // surface is a local min — surfacing this case is the pedagogical
    // point of including the preset.
    expect(r.verdict).toBe('inconclusive');
    expect(r.determinant).toBe('+0.00');
  });
});

describe('formatSaddleExtremaReadout — off-origin classification (verdict applies to displayed Hessian, not just critical points)', () => {
  // The readout displays the second-derivative-test verdict at whatever
  // (x, y) is selected. Strictly the test classifies *critical* points,
  // but the readout treats the Hessian-based verdict as the displayed
  // claim — matching the always-on quadratic-overlay (#180) approach.
  // These cases pin the contract that the verdict tracks H, not
  // criticality.

  it('paraboloid at (0.5, 0.3): H = [[2,0],[0,2]] everywhere ⇒ local min', () => {
    const preset = PRESETS.find((p) => p.id === 'paraboloid')!;
    // Paraboloid Hessian is constant — same verdict everywhere.
    const r = formatSaddleExtremaReadout(preset.hessF(0.5, 0.3));
    expect(r.verdict).toBe('local min');
  });

  it('monkey-saddle at (0.5, 0.3): H = [[3, -1.8], [-1.8, -3]] ⇒ saddle (D = -12.24)', () => {
    const preset = PRESETS.find((p) => p.id === 'monkey-saddle')!;
    // hessF(0.5, 0.3) = [6·0.5, -6·0.3, -6·0.5] = [3, -1.8, -3].
    // D = 3 · (-3) - (-1.8)² = -9 - 3.24 = -12.24 ⇒ saddle.
    const r = formatSaddleExtremaReadout(preset.hessF(0.5, 0.3));
    expect(r.verdict).toBe('saddle');
    expect(r.determinant).toBe(`${MINUS}12.24`);
  });
});
