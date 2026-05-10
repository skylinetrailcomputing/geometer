// Signed-magnitude formatter shared by the cluster's readout primitives
// (quadrics/EquationReadout, tangent-planes/formatTangentPlaneReadout,
// gradient-levels/formatGradientLevelsReadout). Sign char is U+2212
// MINUS for negative, ASCII `+` for non-negative including zero.
// Magnitude formatted via `.toFixed(2)`.
//
// Extracted on third use per the repo's "extract on third use" rule:
// before #166, EquationReadout had the logic inlined and tangent-planes'
// formatter had a local copy; gradient-levels' readout was the third
// site, triggering the lift to scaffold. See _private/plans/166.

const MINUS = '−'; // U+2212
const PLUS = '+';

export function formatSignedMagnitude(v: number): string {
  const sign = v < 0 ? MINUS : PLUS;
  return `${sign}${Math.abs(v).toFixed(2)}`;
}
