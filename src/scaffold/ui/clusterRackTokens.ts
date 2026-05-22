import * as THREE from 'three';

// Cluster slider-rack geometry + design feel — duplicated bit-identical
// across the four cluster scenes' index.ts (quadrics manipulator,
// tangent-planes, gradient-levels, saddle-extrema). Lifted per the
// extract-on-Nth-use rule for load-bearing scaffold (#201 PR 4).
//
// Future cluster scenes inherit these as the rack template. Scenes
// pedagogically needing a different feel pass their own constants
// explicitly — the Slider API requires snapDetent + grabRadiusMultiplier
// as ctor opts per #120.
//
// Canonical surface is immutable: tuple (`readonly` via `as const`) for
// the rack-center coordinate + factory function for the Vector3
// instance. THREE.Vector3 has no internal cloning protection at consumer
// call sites (unlike THREE.Color, which createTranslucentRect clones at
// its boundary); the factory pattern eliminates the shared-mutable-
// singleton footgun.

export const SLIDER_RACK_CENTER_COORDS = [0, 1.0, -0.7] as const;
export const SLIDER_ROW_PITCH = 0.14;
export const SLIDER_SNAP_DETENT = 0.05;
export const GRAB_RADIUS_MULTIPLIER = 2.75;

/**
 * Plinth-mounted UI variant of `GRAB_RADIUS_MULTIPLIER` (#225 / E1.4).
 * The 2.75 above was tuned for mid-air sphere-aim ergonomics — the
 * user's hand aims AT a small floating sphere from across the room
 * and a generous hit radius forgives drift on re-grab. Plinth-mounted
 * UI changes the kinematics: the user's hand goes TO the working
 * surface (hover-near-surface, touch-on-surface) so a tighter radius
 * reads as precise rather than imprecise, especially in quadrics'
 * dense rack.
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

export function createSliderRackCenter(): THREE.Vector3 {
  return new THREE.Vector3(...SLIDER_RACK_CENTER_COORDS);
}
