import * as THREE from 'three';
import {
  createTranslucentRect,
  type TranslucentRectHandles,
} from '@/scaffold/render/TranslucentRect';
import {
  LOCKED_113_BODY_ALPHA,
  LOCKED_113_RIM_ALPHA,
  LOCKED_113_RIM_WIDTH_DEFAULT,
  createLocked113BodyColor,
  createLocked113RimColor,
} from '@/scaffold/render/translucentRectTokens';

// Translucent slicing-plane meshes for the Cross sections section
// (#113). Layers above the on-surface intersection ring shipped in
// #84/#111: the ring shows where the surface meets each plane; this
// module shows the planes themselves as flat sheets in space, so the
// cross-section reads as "a sheet of light passing through the surface"
// rather than just a curve drawn on the surface.
//
// One translucent rect per math axis (x₀, y₀, z₀), parented to a single
// group so the slicing rack moves with the surface center. Each rect
// shares the same shader (the locked #113 recipe, now in
// `scaffold/render/TranslucentRect.ts` since #148) — body sky-blue at
// low alpha plus a brighter rim along the four boundary edges — and
// only differs by orientation. Rim color is intentionally one tone
// lighter than the on-surface ring color from the shipped shader
// (`PLANE_GLOW_COLOR = vec3(0.34, 0.71, 0.91)`) so the two glow tiers
// read as separate elements at a glance.
//
// Per-axis rim color differentiation is explicitly out of scope per
// #113 — the slider thumbs and per-axis on-surface ring colors already
// carry the per-axis identity.
//
// Visual constants (body color, body alpha, rim color, rim alpha, rim
// width) come from `scaffold/render/translucentRectTokens.ts` (#201
// PR 1) — the locked #113 recipe shared with TangentPlane and
// TaylorOverlay. Factory calls construct a fresh THREE.Color per
// build so no module-level Color singleton can leak mutation across
// consumers.

function buildPlaneHandle(
  halfExtent: number,
  orient: (mesh: THREE.Mesh) => void,
): TranslucentRectHandles {
  const handle = createTranslucentRect({
    halfExtent,
    bodyColor: createLocked113BodyColor(),
    bodyAlpha: LOCKED_113_BODY_ALPHA,
    rimColor: createLocked113RimColor(),
    rimAlpha: LOCKED_113_RIM_ALPHA,
    rimWidth: LOCKED_113_RIM_WIDTH_DEFAULT,
  });
  orient(handle.mesh);
  return handle;
}

export interface SlicingPlanesOptions {
  /**
   * World-space center of the surface — the planes' parent group is
   * positioned here so the slicing rack translates with the surface.
   * Matches the `surfaceCenter` passed to `createImplicitSurface`.
   */
  surfaceCenter: THREE.Vector3;

  /**
   * Half-extent of the surface AABB in surface-local meters. Each
   * plane mesh is sized `2 × halfExtent` per side, matching the
   * raymarcher's bounding cube cross-section.
   */
  halfExtent: number;
}

export interface SlicingPlanesHandles {
  /**
   * Parent group holding all three plane meshes. Caller adds it to
   * the scene; toggle `.visible` to gate the whole rack on/off as
   * the active section changes.
   */
  group: THREE.Group;

  /**
   * Drive the plane offsets from the section's three sliders, in math
   * coords. The math→world swap (math-Y → −world-Z) lives inside this
   * call so the caller passes raw slider values.
   */
  setOffsets(x0: number, y0: number, z0: number): void;

  /**
   * Per-axis visibility (#134). When the Cross sections lens is focused,
   * the parent group is visible and each plane's own `.visible` flag
   * picks whether its mesh draws. The parent-group gate still wraps
   * everything so a section switch hides the whole rack regardless of
   * per-axis state.
   */
  setVisibility(x: boolean, y: boolean, z: boolean): void;

  /**
   * Dispose each per-axis plane's PlaneGeometry + ShaderMaterial.
   * Geometries and materials are not shared across axes (each plane is
   * built by its own `buildPlaneMesh` call), so iterate all three.
   */
  dispose(): void;
}

/**
 * Build the three-axis slicing-plane rack for the Cross sections
 * section. Each plane is a translucent rectangular mesh with a
 * brighter rim along its four boundary edges, sized to the surface's
 * AABB cross-section.
 */
export function createSlicingPlanes(
  opts: SlicingPlanesOptions,
): SlicingPlanesHandles {
  const { surfaceCenter, halfExtent } = opts;

  const group = new THREE.Group();
  group.position.copy(surfaceCenter);

  // PlaneGeometry's default normal is +Z. Each plane is rotated so
  // its normal aligns with the math-axis being sliced through:
  //   math-X plane → normal +world-X (rotate +90° around Y)
  //   math-Y plane → normal +world-Z (no rotation needed)
  //   math-Z plane → normal +world-Y (rotate -90° around X)
  // This matches the math→world axis routing already documented at
  // the slider→uniform block in quadrics/index.ts.
  const xPlane = buildPlaneHandle(halfExtent, (m) => {
    m.rotation.y = Math.PI / 2;
  });
  const yPlane = buildPlaneHandle(halfExtent, () => {
    /* default orientation: normal +Z */
  });
  const zPlane = buildPlaneHandle(halfExtent, (m) => {
    m.rotation.x = -Math.PI / 2;
  });

  group.add(xPlane.mesh);
  group.add(yPlane.mesh);
  group.add(zPlane.mesh);

  return {
    group,
    setOffsets(x0: number, y0: number, z0: number): void {
      // Math-frame → surface-local-world offsets, matching the on-
      // surface glow band's mapping in quadrics' shadeHit:
      //   math-X (x₀) → +world-X
      //   math-Y (y₀) → −world-Z   (camera looks down −Z; "forward"
      //                              in math-textbook frame = −world-Z)
      //   math-Z (z₀) → +world-Y
      // Each mesh slides along its own normal axis only; the other
      // two coords stay zero so the plane always passes through the
      // surface center along its non-slicing dimensions.
      xPlane.mesh.position.x = x0;
      yPlane.mesh.position.z = -y0;
      zPlane.mesh.position.y = z0;
    },
    setVisibility(x: boolean, y: boolean, z: boolean): void {
      xPlane.mesh.visible = x;
      yPlane.mesh.visible = y;
      zPlane.mesh.visible = z;
    },
    dispose(): void {
      // TranslucentRectHandles.dispose() is the single GPU-resource
      // owner per the #150 step-1 disposal contract — it disposes
      // both geometry and material together. Don't also call
      // mesh.geometry.dispose() / mesh.material.dispose() here.
      for (const handle of [xPlane, yPlane, zPlane]) {
        handle.dispose();
      }
    },
  };
}
