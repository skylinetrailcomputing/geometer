import * as THREE from 'three';

// Locked #113 translucent-overlay recipe (body at on-surface ring color,
// rim one tone lighter). Bit-identical across SlicingPlane (quadrics),
// TangentPlane (tangent-planes), and TaylorOverlay (saddle-extrema).
// Lifted out of three duplicate const blocks per the extract-on-second-
// consumer rule for load-bearing scaffold (#201 PR 1).
//
// Canonical surface is immutable: RGB tuples (`readonly` via `as const`)
// plus factory functions. THREE.Color is mutable; exporting `new THREE
// .Color(...)` as `const` would only freeze the binding, not the object,
// and any consumer that called `.set()` on the shared instance would
// silently corrupt every other consumer at runtime with no type error.
// Factories construct a fresh THREE.Color per call.

export const LOCKED_113_BODY_RGB = [0.34, 0.71, 0.91] as const;
export const LOCKED_113_RIM_RGB = [0.7, 0.9, 0.99] as const;
export const LOCKED_113_BODY_ALPHA = 0.1;
export const LOCKED_113_RIM_ALPHA = 0.65;

// Default rim width for cluster overlays, in plane-local meters. Flat
// translucent planes (SlicingPlane, TangentPlane) use this verbatim.
// Curved overlays (TaylorOverlay) override locally to 0.015 m where
// the smaller half-extent demands proportionally narrower rim — the
// override site at saddle-extrema/TaylorOverlay.ts carries the
// curvature-pedagogy rationale.
export const LOCKED_113_RIM_WIDTH_DEFAULT = 0.05;

export function createLocked113BodyColor(): THREE.Color {
  return new THREE.Color(...LOCKED_113_BODY_RGB);
}

export function createLocked113RimColor(): THREE.Color {
  return new THREE.Color(...LOCKED_113_RIM_RGB);
}
