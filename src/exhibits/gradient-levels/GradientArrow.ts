import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { YELLOW } from '@/scaffold/design/tokens';
import type { MathVec3 } from '@/scaffold/math/frames';
import { poseGradientArrow } from './poseGradientArrow';

// Gradient-vector arrow for the gradient-levels scene (#165). A merged
// shaft+cone mesh anchored at the user-selected surface point, oriented
// along ∇f at that point, scaled to a fixed unit visual length. Lit
// MeshStandardMaterial with overlay rendering — never occluded by the
// surface, since the arrow's pedagogical role is "always-visible UI
// element at the contact point" (the gradient direction the user is
// actively manipulating via θ/φ), not "physical object embedded in
// the surface body."
//
// Coordinate convention (locked, mirrors TangentPlane.ts): this
// wrapper's `group.position` stays at (0, 0, 0). The full world-space
// transform — `writeMathToWorld(pointMath) + surfaceCenter` — happens
// inside `poseGradientArrow` and writes into the inner mesh's position.
// Setting `group.position.copy(surfaceCenter)` would double-offset to
// `point + 2 × surfaceCenter`.

// Visual constants — v0.7 lock, tunable in headset.
const ARROW_LENGTH = 0.40;
const CONE_HEIGHT = 0.10;
const SHAFT_LENGTH = ARROW_LENGTH - CONE_HEIGHT;
const SHAFT_RADIUS = 0.018;
const CONE_RADIUS = 0.04;

// Radial segment count for the shaft + cone. 32 is high enough that
// the silhouette reads as smooth at headset distance — at lower counts
// (12/16) an arbitrary-axis 180° quaternion roll at the anti-parallel
// snap point can show a visible facet rotation; at 32 the
// hexagonal-edge artifact is too fine to perceive.
const RADIAL_SEGMENTS = 32;

export interface GradientArrowOptions {
  /**
   * World-space center of the surface. Passed through to
   * poseGradientArrow on every setPose call so the helper can do the
   * full math→world + surfaceCenter offset in one place. The wrapper
   * group itself stays at the exhibit-local origin.
   */
  surfaceCenter: THREE.Vector3;
}

export interface GradientArrowHandles {
  /**
   * Group containing the arrow mesh. Caller adds it to the scene; the
   * inner mesh is positioned + oriented inside this group by setPose.
   * Initially `group.visible = false` — the first frame's setPose +
   * setVisible(true) from the consumer's update path uncloaks it,
   * preventing a one-frame flash at stale pose.
   */
  group: THREE.Group;
  /**
   * Drive the arrow's pose from the raymarch result. `pointMath` and
   * `normalMath` are surface-local math-frame; the math→world routing
   * + the surfaceCenter translation happen inside this call so the
   * caller passes raw raymarch output.
   */
  setPose(pointMath: MathVec3, normalMath: MathVec3): void;
  /** Toggles `group.visible`, gating the mesh together. */
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function createGradientArrow(
  opts: GradientArrowOptions,
): GradientArrowHandles {
  // Build merged shaft+cone geometry along +Y; tail at local origin,
  // tip at +Y direction. Mirrors the slider's buildArrowGeometry pattern
  // (Slider.ts:353-410) but unidirectional.
  //
  // Default CylinderGeometry — both end caps generated. The shaft top
  // disc + cone base disc do land coplanar at y = SHAFT_LENGTH with
  // overlapping inner annulus, but the overlay rendering below
  // (`depthTest: false`) eliminates depth comparisons under this
  // material, so the coplanar overlap can't z-fight. Bottom cap is
  // needed — at oblique camera angles (especially k<0 where the tail
  // faces the viewer) the tail disc closes the shaft visually.
  const shaft = new THREE.CylinderGeometry(
    SHAFT_RADIUS,
    SHAFT_RADIUS,
    SHAFT_LENGTH,
    RADIAL_SEGMENTS,
  );
  // Default CylinderGeometry is centered at origin; shift so its bottom
  // sits at y=0 (the contact point on the surface).
  shaft.translate(0, SHAFT_LENGTH / 2, 0);

  const tip = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, RADIAL_SEGMENTS);
  // Cone base flushes against the top of the shaft; tip points +Y.
  tip.translate(0, SHAFT_LENGTH + CONE_HEIGHT / 2, 0);

  const merged = mergeGeometries([shaft, tip]);
  // Sources have identical attribute layouts (position/normal/uv);
  // merge can't fail in practice but the type signature requires it.
  if (!merged) {
    throw new Error('Failed to merge gradient-arrow geometries');
  }
  shaft.dispose();
  tip.dispose();

  // Overlay rendering — the arrow is a UI element ("the gradient
  // direction at the contact point"), not a physical body embedded in
  // the surface; render it on top regardless of depth. Eliminates k<0
  // inward-arrow occlusion AND any z-fight at the tail/surface contact.
  const material = new THREE.MeshStandardMaterial({
    color: YELLOW,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(merged, material);
  // Within the opaque pass, draw after default-renderOrder objects.
  // (Three.js draws the opaque list before the transparent list
  // regardless of renderOrder; cross-pass interaction with translucent
  // overlays is OOS for v0.7.)
  mesh.renderOrder = 2;

  const group = new THREE.Group();
  group.visible = false;
  group.add(mesh);

  const surfaceCenter = opts.surfaceCenter;

  return {
    group,
    setPose(pointMath, normalMath) {
      poseGradientArrow(mesh, pointMath, normalMath, surfaceCenter);
    },
    setVisible(visible) {
      group.visible = visible;
    },
    dispose() {
      merged.dispose();
      material.dispose();
    },
  };
}
