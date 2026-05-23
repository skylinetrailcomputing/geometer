// Readout typography + sync — duplicated bit-identical across the four
// cluster readouts (EquationReadout, TangentPlaneReadout,
// GradientLevelsReadout, SaddleExtremaReadout). Lifted per the
// extract-on-Nth-use rule for load-bearing scaffold (#201 PR 2).
//
// All four readouts use the same font size, line pitch, outline, and
// sync throttle so the cluster reads as a coherent UI family across
// scene swaps via the SceneRack. Future cluster scenes inherit these
// as the readout-typography template.

// Default fallback font size. Each readout exposes `opts.fontSize?`;
// when omitted, this is the value applied.
export const READOUT_FONT_SIZE = 0.028;

// Vertical pitch between adjacent text lines, in meters. 2-line
// readouts (Equation, TangentPlane, GradientLevels) place rows at
// ±LINE_PITCH/2; the 3-line readout (SaddleExtrema) places rows at
// ±LINE_PITCH around midline.
export const READOUT_LINE_PITCH = 0.06;

// Troika Text outline — an opaque high-contrast band around glyph
// edges so the readout stays legible against any scene background
// (#29 rationale).
export const READOUT_OUTLINE_WIDTH = '8%';
export const READOUT_OUTLINE_COLOR = 0x000000;

// Re-render throttle. Pre-throttle, troika SDF rebuild cost dominates
// during fast drags. ≈30 Hz is the cap shared by every readout (#38
// rationale, originally calibrated on Slider's per-slider label cap).
export const READOUT_SYNC_INTERVAL_MS = 33;

// Back-plate base color for plinth-mounted readouts (#252 / E1.4c).
// Near-black with a slight cool bias — reads as an LCD-off panel
// against the dark warm-purple plinth surface (PLINTH_BASE_COLOR_RGB),
// not as a hole. Calibrated against axis-tinted troika text (vermillion
// / bluish-green / sky-blue / yellow). First-pass smoke-tunable per
// feedback_staging_dimensions_first_pass; bracket [0.05, 0.12] each
// component. Immutable tuple per feedback_threejs_token_exports_
// immutable — produce a fresh THREE.Color in each consumer.
export const READOUT_PANEL_COLOR_RGB = [0.08, 0.08, 0.1] as const;
