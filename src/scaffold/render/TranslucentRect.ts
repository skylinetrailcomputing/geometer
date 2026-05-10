import * as THREE from 'three';

// Single-rect translucent primitive with the locked rim shader (#113):
// translucent body + a slightly-lighter rim along the four boundary edges.
// Lifted out of `src/exhibits/quadrics/SlicingPlane.ts` in #148 so the
// tangent-planes scene can render the same translucent overlay without
// duplicating the GLSL — same extract-on-second-use pattern as the
// implicit-surface raymarcher (#129/#130).
//
// What this primitive owns:
// - GLSL shader (vertex + fragment) implementing body+rim mix.
// - PlaneGeometry sized 2 × halfExtent per side; default normal +Z.
// - Material flags locked to the #113 visual recipe: transparent, no
//   depth-write, double-sided.
// - renderOrder = 1 — both v0.6 consumers (SlicingPlane + TangentPlane)
//   want this so the rect renders after the implicit surface (which writes
//   correct per-fragment depth via gl_FragDepth from #67).
//
// What this primitive does NOT own:
// - Orientation / position. The mesh is untransformed at construction;
//   callers position + orient however they want (axis-aligned rotation
//   for SlicingPlane, gradient-driven `setFromUnitVectors` for TangentPlane).
// - The locked color/alpha/width *constants*. Each consumer declares its
//   own — visually identical today (#113 lock) but per-scene so the design
//   language can drift in v0.7+ without coupling the scenes.

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

const RENDER_ORDER = 1;

export interface TranslucentRectOptions {
  /** Half-width / half-height of the rect, in plane-local meters. */
  halfExtent: number;
  /** Body color (interior). Cloned on construction; safe to mutate caller's copy. */
  bodyColor: THREE.Color;
  /** Body alpha. */
  bodyAlpha: number;
  /** Rim color (boundary band). Cloned on construction; safe to mutate caller's copy. */
  rimColor: THREE.Color;
  /** Rim alpha. */
  rimAlpha: number;
  /** Rim band width in plane-local meters. */
  rimWidth: number;
}

export interface TranslucentRectHandles {
  /**
   * The mesh — untransformed at construction. Caller positions /
   * orients however it wants (PlaneGeometry's default normal is +Z).
   */
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /**
   * The shader material — exposed for callers that want to mutate
   * uniforms after construction. Today neither v0.6 consumer does;
   * exposed for the third-user-might-want pattern.
   */
  material: THREE.ShaderMaterial;
  /**
   * Single GPU-resource owner. Disposes BOTH the geometry and the
   * material. Callers MUST NOT also call mesh.geometry.dispose() or
   * material.dispose() — that would double-dispose (per the #150
   * step-1 disposal contract).
   */
  dispose(): void;
}

/**
 * Build a translucent rect mesh + material with the locked #113 visual
 * recipe (translucent body + brighter rim).
 *
 * Color uniforms are CLONED from the input so callers can hold the input
 * `THREE.Color` as a module-scoped constant without risk of accidental
 * mutation propagating into the GPU uniform.
 */
export function createTranslucentRect(
  opts: TranslucentRectOptions,
): TranslucentRectHandles {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    // Surface raymarcher writes correct per-fragment depth, so depth
    // testing against the rect occludes the half behind the surface.
    // Disabling depth *write* keeps multiple translucent rects (e.g.,
    // SlicingPlane's three planes) from blocking each other where they
    // intersect.
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uHalfExtent: { value: opts.halfExtent },
      uRimWidth: { value: opts.rimWidth },
      uBodyColor: { value: opts.bodyColor.clone() },
      uBodyAlpha: { value: opts.bodyAlpha },
      uRimColor: { value: opts.rimColor.clone() },
      uRimAlpha: { value: opts.rimAlpha },
    },
  });

  const geometry = new THREE.PlaneGeometry(
    opts.halfExtent * 2,
    opts.halfExtent * 2,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = RENDER_ORDER;

  return {
    mesh,
    material,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
