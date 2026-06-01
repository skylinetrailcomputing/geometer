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

// Back-plate depth — Z-extrusion BEHIND the front face (away from the
// viewer, into the plinth) so the front face stays at the original
// plane position and text-vs-panel ordering is unchanged. Gives the
// back-plate enough physical presence that yaw-billboard motion reads
// as a solid screen turning, not a flat decal sliding (per #270 smoke
// verdict on #252 / PR #269: panel-as-flat-decal-that-tracks-you).
// Round 1 = 8mm; smoke verdict "getting there but not strong enough."
// Round 2 = 12mm; smoke verdict "right track but still not strong
// enough." Round 3 = 14mm (current). Bracket narrows to [12mm, 16mm];
// if 14mm still subtle, next try 16mm (with attention to plinth-top
// clipping at extreme yaw — that's the hard ceiling). If 14mm
// overshoots, back to 13mm. Tune one dial per round; smoke on
// Cloudflare PR preview.
export const READOUT_PANEL_DEPTH = 0.014;

// Post length: distance from the plinth working surface to the panel
// mount point, along the surface normal (= slot-local +Z). Lifts the
// readout off the desk so the post is a deliberate mounting element
// rather than a vestigial pin. #286 / two-slot architecture: the
// post sits in its own 'surface'-oriented plinth slot at slot-Z = 0;
// the readout slot's localXYZ[2] = READOUT_POST_LENGTH lifts the
// readout group origin to the post-tip position.
//
// First-pass: 0.12 m. Bracket [0.08, 0.18]; binary-search per
// feedback_binary_search_visual_constants if smoke reports the
// readout reads as "too floating" (→ shorter) or "stage-furniture
// rather than display" (→ longer). One dial per round.
export const READOUT_POST_LENGTH = 0.12;

// Post radius: half-thickness of the cylindrical stem. 5 mm reads as
// "thin metal stem" without disappearing at typical viewing distance.
// First-pass smoke-tunable; bracket [0.003, 0.008]. One dial per round.
export const READOUT_POST_RADIUS = 0.005;

// Post color: matches PLINTH_BASE_COLOR_RGB at first-pass so the post
// reads as extruded from the plinth body. Held as a SEPARATE token
// (not imported from staging/Plinth.ts) so post-color tuning doesn't
// bleed into the plinth body — if smoke flags the post as too
// prominent / invisible / disconnected, this token is the tuning
// seam. Bracket each component [0, 0.5]. Material is
// MeshStandardMaterial with defaults (roughness=1, metalness=0)
// matching the plinth body's constructor at Plinth.ts:319 exactly.
// Immutable tuple per feedback_threejs_token_exports_immutable —
// produce a fresh THREE.Color in each consumer.
export const READOUT_POST_COLOR_RGB = [
  0x40 / 255,
  0x38 / 255,
  0x44 / 255,
] as const;
