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
//
// ─────────────────────────────────────────────────────────────────────
// Design-language rules (#201 — applied across the four cluster
// scenes and inherited as the template for post-1.0 portfolio
// additions)
// ─────────────────────────────────────────────────────────────────────
//
// Color convention:
//   VERMILLION   = math-X axis identity
//   BLUISH_GREEN = math-Y axis identity
//   SKY_BLUE     = math-Z axis identity
//   YELLOW       = "important math fact at a point" — used for scalar
//                  values that summarize geometric meaning (constant
//                  terms, magnitudes, classification verdicts, marker
//                  glyphs).
//
// Slider tint rule:
//   A slider whose value IS the named axis coordinate gets the axis
//   tint (quadrics' a/b/c → axis colors; saddle-extrema's x/y →
//   VERMILLION / BLUISH_GREEN). A slider that's a point selector or a
//   family parameter (tangent-planes' θ/φ; gradient-levels' θ/φ/k)
//   stays neutral gray (0xaaaaaa). The distinction communicates "this
//   knob moves THIS axis" vs. "this knob parameterizes the math
//   abstractly." Per-scene exceptions documented in each scene's
//   SPEC.md "Design-language alignment" section.
//
// Translucent overlay recipe:
//   See scaffold/render/translucentRectTokens.ts for the locked #113
//   body+rim recipe (body at on-surface ring color, rim one tone
//   lighter). Default rim width is the scaffold constant
//   LOCKED_113_RIM_WIDTH_DEFAULT (0.05 m). Scenes pedagogically
//   requiring a tighter rim — saddle-extrema's TaylorOverlay (0.015
//   m on a smaller half-extent so the rim doesn't dominate the
//   curvature read) — override locally with a cross-reference
//   comment at the override site.
//
// Slider rack geometry + design feel:
//   See scaffold/ui/clusterRackTokens.ts. Rack center, row pitch,
//   snap detent, grab-radius multiplier, and per-slider label
//   (#170) layout are bit-identical across the cluster. The
//   THREE.Vector3 rack center is exported as an immutable
//   coordinate tuple + a factory function (no shared mutable
//   THREE-instance singletons); each scene constructs a fresh
//   per-file Vector3 from the factory at module-load.
//
// Readout typography + bootstrap:
//   See scaffold/ui/readoutTokens.ts for font size, line pitch,
//   outline, and 30-Hz sync throttle. All four cluster readouts use
//   identical values. Visibility-bootstrap policy: boot-hidden,
//   uncloak after the first real state sync (`setValues`) has run
//   its layout reflow + an unthrottled `Text.sync()`. Locked in
//   #201 PR 3.
//
// Preset semantics:
//   `Preset` from scaffold/ui/Preset.ts is one-shot by default
//   (press flash IS the feedback; quadrics' use case). For
//   persistent surface-family selectors (saddle-extrema's preset
//   row), pass `activeEmissive` to `PresetOptions` and have the
//   owning scene drive `setActive(true)` + `setActive(false)`-on-
//   sibling. Preset does NOT self-toggle on tap; the scene owns
//   active-state.
//
// ─────────────────────────────────────────────────────────────────────

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
