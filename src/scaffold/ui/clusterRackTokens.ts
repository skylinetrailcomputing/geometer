// Cluster slider-rack geometry + design feel — values inherited by
// every cluster scene's index.ts (quadrics manipulator, tangent-planes,
// gradient-levels, saddle-extrema). Lifted per the extract-on-Nth-use
// rule for load-bearing scaffold (#201 PR 4).
//
// Future cluster scenes inherit these as the rack template. Scenes
// pedagogically needing a different feel pass their own constants
// explicitly — the Slider API requires snapDetent + grabRadiusMultiplier
// as ctor opts per #120.

export const SLIDER_ROW_PITCH = 0.14;
export const SLIDER_SNAP_DETENT = 0.05;

/**
 * Grab-radius multiplier for plinth-mounted UI (#225 / E1.4). Every
 * cluster scene's interactive primitives — sliders, presets, tabs,
 * cross-section toggles — pass this to their ctor's
 * `grabRadiusMultiplier` opt. The pre-plinth mid-air multiplier
 * (2.75) was deleted at PR2 (#251) once all four cluster scenes
 * ported onto the plinth; the kinematics changed from
 * controller-aim-AT (a small floating sphere across the room needed
 * a generous hit radius) to hand-TO-surface (touch-on-surface) where
 * a tighter radius reads as precise rather than imprecise.
 *
 * First-pass smoke-tunable (feedback_staging_dimensions_first_pass).
 * Bracket [1.25, 2.0]: bump up if smoke flags too tight, bump down if
 * still too generous. Note: 1.5 is **pancake-biased** — mouse
 * precision tolerates this radius; VR controller comfort may want
 * [1.5, 2.0] (feedback_binary_search_visual_constants — one dial per
 * round). The §6 headset smoke checklist evaluates grab-radius
 * comfort separately per form factor.
 */
export const GRAB_RADIUS_MULTIPLIER_PLINTH = 1.5;

// Per-slider variable + value label layout (#170). Right-anchored so
// worst-case secondary text "−1.50" stays clear of the slider thumb at
// any value. Consumers: tangent-planes, gradient-levels, saddle-extrema.
// Quadrics has no per-slider labels — the equation readout carries the
// live coefficient values instead.
export const SLIDER_LABEL_X_OFFSET = -0.2;
export const SLIDER_LABEL_PRIMARY_FONT_SIZE = 0.05;
export const SLIDER_LABEL_SECONDARY_FONT_SIZE = 0.035;
export const SLIDER_LABEL_LINE_GAP = 0.008;
