import * as THREE from 'three';

// Ray-sphere hit test for grabbable / tappable scene primitives
// (#120). Extracted from triplicated copies that lived in Slider.ts,
// Preset.ts, and SectionTab.ts before the v0.6 scaffold pass; per
// SectionTab's own comment, "a third tap-button-like primitive
// would be the trigger for refactoring all three onto a shared
// base" — which the scaffold extraction is.
//
// `radius` is typically the visual primitive radius multiplied by
// a grab-affordance multiplier (e.g. ~2.75× the thumb radius for
// the slider), so the hit sphere is generous compared to the visual
// primitive. Each consumer chooses its own multiplier and passes
// the inflated radius here.

/**
 * Returns true if the ray from `origin` in direction `dir` hits a
 * sphere at `center` of radius `radius`. The ray direction is
 * assumed to be unit-length (consumers normalize before calling).
 */
export function raySphereHit(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): boolean {
  const oc = new THREE.Vector3().subVectors(origin, center);
  const b = oc.dot(dir);
  const c = oc.dot(oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return false;
  const sqrtDisc = Math.sqrt(disc);
  const t = -b - sqrtDisc;
  return t >= 0 || -b + sqrtDisc >= 0;
}
