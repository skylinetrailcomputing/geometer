import * as THREE from 'three';

// Translucent slicing-plane meshes for the Cross sections section
// (#113). Layers above the on-surface intersection ring shipped in
// #84/#111: the ring shows where the surface meets each plane; this
// module shows the planes themselves as flat sheets in space, so the
// cross-section reads as "a sheet of light passing through the surface"
// rather than just a curve drawn on the surface.
//
// One mesh per math axis (x₀, y₀, z₀), parented to a single group so
// the slicing rack moves with the surface center. Each mesh shares the
// same shader — body sky-blue at low alpha plus a brighter rim along
// the four boundary edges — and only differs by orientation. Rim color
// is intentionally one tone lighter than the on-surface ring color from
// the shipped shader (`PLANE_GLOW_COLOR = vec3(0.34, 0.71, 0.91)`) so
// the two glow tiers read as separate elements at a glance.
//
// Per-axis rim color differentiation is explicitly out of scope per
// #113 — the slider thumbs and per-axis on-surface ring colors already
// carry the per-axis identity.

const PLANE_BODY_COLOR = new THREE.Color(0.34, 0.71, 0.91);
const PLANE_BODY_ALPHA = 0.10;
// One step lighter than PLANE_BODY_COLOR / the on-surface ring color
// so the two glow tiers stay visibly distinct when they overlap (the
// ring marks the cut on the surface; the rim outlines the cut's own
// boundary in free space).
const PLANE_RIM_COLOR = new THREE.Color(0.70, 0.90, 0.99);
const PLANE_RIM_ALPHA = 0.65;
// Rim band width in plane-local meters (#113: "outer ~5 cm").
const PLANE_RIM_WIDTH = 0.05;
// Surface-mesh has the default renderOrder of 0; bumping to 1 puts the
// transparent planes after it so depth-tested blending Just Works (the
// raymarcher writes per-fragment depth via gl_FragDepth from #67).
const PLANE_RENDER_ORDER = 1;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vLocal;

  void main() {
    // PlaneGeometry's local position spans [-halfExtent, +halfExtent]
    // on x and y, with normal +Z. Pass the local (x, y) so the rim
    // distance computes in plane-local meters regardless of the mesh's
    // world orientation.
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uHalfExtent;
  uniform float uRimWidth;
  uniform vec3  uBodyColor;
  uniform float uBodyAlpha;
  uniform vec3  uRimColor;
  uniform float uRimAlpha;

  varying vec2 vLocal;

  void main() {
    // Distance from the nearest edge in plane-local meters: 0 at the
    // edge, uHalfExtent at the plane center. smoothstep gives an
    // anti-aliased band over the outer uRimWidth, with rim = 1 at the
    // edge falling smoothly to 0 inside the body.
    float distFromEdge = uHalfExtent - max(abs(vLocal.x), abs(vLocal.y));
    float rim = 1.0 - smoothstep(0.0, uRimWidth, distFromEdge);
    vec3 color = mix(uBodyColor, uRimColor, rim);
    float alpha = mix(uBodyAlpha, uRimAlpha, rim);
    gl_FragColor = vec4(color, alpha);
  }
`;

function buildPlaneMaterial(halfExtent: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    // Surface raymarcher writes correct per-fragment depth, so depth
    // testing against the slicing plane occludes the half of the plane
    // behind the surface. Disabling depth *write* keeps the planes
    // from blocking each other in their mutual intersections.
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uHalfExtent: { value: halfExtent },
      uRimWidth:   { value: PLANE_RIM_WIDTH },
      uBodyColor:  { value: PLANE_BODY_COLOR.clone() },
      uBodyAlpha:  { value: PLANE_BODY_ALPHA },
      uRimColor:   { value: PLANE_RIM_COLOR.clone() },
      uRimAlpha:   { value: PLANE_RIM_ALPHA },
    },
  });
}

function buildPlaneMesh(
  halfExtent: number,
  orient: (mesh: THREE.Mesh) => void,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(halfExtent * 2, halfExtent * 2);
  const mesh = new THREE.Mesh(geometry, buildPlaneMaterial(halfExtent));
  mesh.renderOrder = PLANE_RENDER_ORDER;
  orient(mesh);
  return mesh;
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
  const xPlane = buildPlaneMesh(halfExtent, (m) => {
    m.rotation.y = Math.PI / 2;
  });
  const yPlane = buildPlaneMesh(halfExtent, () => {
    /* default orientation: normal +Z */
  });
  const zPlane = buildPlaneMesh(halfExtent, (m) => {
    m.rotation.x = -Math.PI / 2;
  });

  group.add(xPlane);
  group.add(yPlane);
  group.add(zPlane);

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
      xPlane.position.x = x0;
      yPlane.position.z = -y0;
      zPlane.position.y = z0;
    },
    setVisibility(x: boolean, y: boolean, z: boolean): void {
      xPlane.visible = x;
      yPlane.visible = y;
      zPlane.visible = z;
    },
  };
}
