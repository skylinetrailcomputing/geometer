import { describe, expect, it } from 'vitest';
import { formatAnglePiFraction } from '../../../src/scaffold/ui/formatAnglePiFraction.ts';

const MINUS = '−'; // U+2212
const PI = Math.PI;

// Match the snap sets actually shipped in the cluster's angular sliders.
// Tests pin against these specific arrays so a future scene change that
// drops or adds a snap surfaces here.
const TANGENT_THETA_SNAPS = [0, PI / 2, PI];
const GRADIENT_THETA_SNAPS = [0, PI / 2, PI];
const PHI_SNAPS = [-PI, -PI / 2, 0, PI / 2, PI];

describe('formatAnglePiFraction — labeled snap values', () => {
  it.each([
    [0, [0, PI / 2, PI], '0'],
    [PI / 2, [0, PI / 2, PI], 'π/2'],
    [PI, [0, PI / 2, PI], 'π'],
    [-PI, PHI_SNAPS, `${MINUS}π`],
    [-PI / 2, PHI_SNAPS, `${MINUS}π/2`],
    [PI / 2, PHI_SNAPS, 'π/2'],
  ])('snapped %f with given snapPoints → %s', (rad, snaps, expected) => {
    expect(formatAnglePiFraction(rad, snaps)).toBe(expected);
  });

  it('renders π/4 / 3π/4 fractions when slider DOES snap there (forward-compat)', () => {
    // No v0.7 shipped slider snaps at π/4 — but the label map covers it
    // for v0.8+ scenes that may add it. This pins the forward-compat path.
    expect(formatAnglePiFraction(PI / 4, [0, PI / 4, PI / 2])).toBe('π/4');
    expect(formatAnglePiFraction(-(3 * PI) / 4, [-(3 * PI) / 4, 0])).toBe(
      `${MINUS}3π/4`,
    );
  });
});

describe('formatAnglePiFraction — off-snap (Xπ decimal)', () => {
  it('positive off-snap → Xπ decimal', () => {
    expect(formatAnglePiFraction(0.6 * PI, GRADIENT_THETA_SNAPS)).toBe('0.60π');
  });

  it('negative off-snap → −Xπ with U+2212', () => {
    expect(formatAnglePiFraction(-0.6 * PI, PHI_SNAPS)).toBe(`${MINUS}0.60π`);
  });

  it('boot pose for tangent-planes θ (π/3) — off-snap → 0.33π', () => {
    expect(formatAnglePiFraction(PI / 3, TANGENT_THETA_SNAPS)).toBe('0.33π');
  });

  it('boot pose for gradient-levels θ (π/3) — off-snap → 0.33π', () => {
    expect(formatAnglePiFraction(PI / 3, GRADIENT_THETA_SNAPS)).toBe('0.33π');
  });

  it('boot pose for tangent-planes φ (π/4) — off-snap → 0.25π (NOT π/4)', () => {
    // PHI_SNAP_POINTS = [-π, -π/2, 0, π/2, π] — π/4 not a snap.
    // Closes the triple-CONVERGENT roundtable finding: a false-snap glyph
    // would render "π/4" via exact-float match in the v1 design.
    expect(formatAnglePiFraction(PI / 4, PHI_SNAPS)).toBe('0.25π');
    expect(formatAnglePiFraction(PI / 4, PHI_SNAPS)).not.toBe('π/4');
  });

  it('boot pose for gradient-levels φ (π/4) — off-snap → 0.25π (NOT π/4)', () => {
    // Same regression as tangent-planes φ. Both scenes share PHI_INITIAL = π/4
    // and the same snap set — neither should render the false-snap glyph.
    expect(formatAnglePiFraction(PI / 4, PHI_SNAPS)).toBe('0.25π');
  });
});

describe('formatAnglePiFraction — exact π/4 with non-π/4-snap slider does NOT trigger label', () => {
  it('explicit anti-regression: snap-table is gated on snapPoints membership', () => {
    // The hard-coded label map has an entry for π/4 (forward-compat),
    // but if the slider doesn't include π/4 in its snap set the formatter
    // must fall through to the Xπ branch.
    const tangentThetaSnaps = [0, PI / 2, PI];
    expect(formatAnglePiFraction(PI / 4, tangentThetaSnaps)).toBe('0.25π');
  });
});

describe('formatAnglePiFraction — sign glyph contract', () => {
  it('uses U+2212 MINUS, not ASCII hyphen-minus', () => {
    const result = formatAnglePiFraction(-PI / 2, PHI_SNAPS);
    expect(result.charCodeAt(0)).toBe(0x2212);
    expect(result).not.toContain('-'); // ASCII hyphen
  });
});
