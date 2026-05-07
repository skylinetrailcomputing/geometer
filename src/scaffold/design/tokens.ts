// Geometer house palette + named axis tints — extracted from inline
// literals in exhibits/quadrics/index.ts (#120). Single source of truth
// for cross-scene color identity.
//
// Wong / Okabe-Ito colorblind-safe palette: distinguishable across
// deuteranopia / protanopia / tritanopia. The full Wong/Okabe-Ito set
// has eight colors; only the four below are needed for math-X /
// math-Y / math-Z / constant-term identification across the planned
// quadrics cluster (manipulator, tangent planes, gradient/level
// surfaces, saddle/extrema). Add more here if a future scene
// genuinely needs a fifth distinguishable channel.

export const VERMILLION = 0xd55e00;
export const BLUISH_GREEN = 0x009e73;
export const SKY_BLUE = 0x56b4e9;
export const YELLOW = 0xf0e442;

// Default axis tints in the geometer math frame (X right, Y forward,
// Z up). Scenes that want the house convention import this and pass
// it to WorldAxes; scenes that want a different scheme pass their
// own. Explicit pass keeps the convention discoverable rather than
// magic.
export const DEFAULT_AXIS_COLORS: Readonly<Record<'X' | 'Y' | 'Z', number>> = {
  X: VERMILLION,
  Y: BLUISH_GREEN,
  Z: SKY_BLUE,
};
