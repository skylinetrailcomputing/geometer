import { describe, expect, it } from 'vitest';
import { formatSignedMagnitude } from '../../../src/scaffold/ui/formatSignedMagnitude.ts';

// Three contracts shared across all cluster readouts (quadrics
// EquationReadout, tangent-planes formatter, gradient-levels formatter).
// Sign character is U+2212 MINUS (not hyphen-minus); zero takes `+`.

const MINUS = '−'; // U+2212

describe('formatSignedMagnitude', () => {
  it('positive value → leading "+" sign', () => {
    expect(formatSignedMagnitude(0.71)).toBe('+0.71');
    expect(formatSignedMagnitude(1.22)).toBe('+1.22');
    expect(formatSignedMagnitude(10)).toBe('+10.00');
  });

  it('negative value → leading "−" sign (U+2212, not hyphen-minus)', () => {
    expect(formatSignedMagnitude(-0.71)).toBe(`${MINUS}0.71`);
    expect(formatSignedMagnitude(-1.22)).toBe(`${MINUS}1.22`);
  });

  it('zero → "+0.00" (positive sign by convention)', () => {
    expect(formatSignedMagnitude(0)).toBe('+0.00');
  });
});
