import * as THREE from 'three';
import type { SaddleExtremaPreset } from './presets';

// Local-quadratic-approximation overlay for the saddle / extrema scene
// (#180; epic #175 closer). At the slider-selected point (x₀, y₀), this
// renders the second-order Taylor expansion of the active preset's f
// as a translucent meshed surface "patch" hugging the main surface.
//
//   q(x, y) = f(x₀, y₀)
//           + f_x(x₀, y₀)·(x − x₀)
//           + f_y(x₀, y₀)·(y − y₀)
//           + ½·[ f_xx·(x − x₀)² + 2·f_xy·(x − x₀)·(y − y₀) + f_yy·(y − y₀)² ]
//
// Pedagogical hook (§11.7–11.8): the second-derivative test isn't a
// sign-checking ritual — it's a question about local shape. At a
// critical point the linear term vanishes and the overlay IS the local
// quadratic (bowl up / bowl down / saddle / flat-degenerate). Away
// from a critical point the linear term tips the overlay into a curved
// tangent patch.
//
// Architectural notes:
// - Builds its own BufferGeometry and ShaderMaterial. Does NOT call
//   createGraphSurface (#176) — that's a one-shot builder for the main
//   surface; this overlay's lifecycle is mutate-every-frame.
// - Shares only the math-frame helpers (writeGraphPointToWorld /
//   writeMathToWorld) with the main surface, per the #176 SPEC's
//   "same-scene consumer of helpers" anticipation.
// - Translucent body+rim recipe lifted from the locked #113 / #148
//   precedent (TranslucentRect.ts), with two adaptations: per-vertex
//   `aLocal` attribute (since the mesh is curved, not flat) and a
//   subtle lambert on the body (so curvature reads — flat-lit reads as
//   a uniform tint that hides the very shape the overlay teaches).
// - polygonOffset shipped day one: for the exact-quadratic presets
//   (paraboloid / inv-paraboloid / saddle), the Taylor approximation
//   IS the surface across the entire patch, not just at the center
//   vertex. Coplanar geometry without the offset z-fights deterministically.

/**
 * Compute the overlay's half-extent in math coords for a given preset.
 *
 * Fraction of the preset's narrower domain side so the patch stays
 * square in math coords (rim band is uniform on all four edges) and
 * fits comfortably inside the preset's domain at origin pose. Tuned
 * per SPEC.md "Quadratic overlay (#180)"; iterate in-headset.
 */
const HALF_EXTENT_FRACTION = 0.25; // 25% × (min-side / 2)

function computeHalfExtent(preset: SaddleExtremaPreset): number {
  const xRange = preset.domain.xMax - preset.domain.xMin;
  const yRange = preset.domain.yMax - preset.domain.yMin;
  return (HALF_EXTENT_FRACTION * Math.min(xRange, yRange)) / 2;
}

// Tessellation resolution. Odd so the center vertex (u = v = 0) lands
// exactly at index `(res - 1) / 2` in both i and j — critical because
// the indicator's selected point IS the overlay's center, and visual /
// test claims rely on a vertex existing there. 49² = 2401 vertices;
// total per-frame buffer write (position + normal) is ~58 KB.
const RES = 49;

// Visual recipe — translucent body + brighter rim, sky-blue per the
// #113 locked visual language. Same body / rim colors and alphas as
// TangentPlane.ts and SlicingPlane.ts; rim width tighter (0.015 m on a
// ~0.30 m half-extent gives 5% rim-to-half-extent ratio, somewhat
// heavier than the slicing-plane's 1.7% but less heavy than the v1
// plan's 7%).
const OVERLAY_BODY_COLOR = new THREE.Color(0.34, 0.71, 0.91);
const OVERLAY_BODY_ALPHA = 0.10;
const OVERLAY_RIM_COLOR = new THREE.Color(0.70, 0.90, 0.99);
const OVERLAY_RIM_ALPHA = 0.65;
const OVERLAY_RIM_WIDTH = 0.015;

// Subtle lambert on the body — body color ranges [0.6, 1.0] × baseColor
// vs. the main surface's [0.2, 1.0]. Low-amplitude so the overlay
// doesn't compete with the main surface for "solid surface" presence
// but high enough that the bowl / saddle / flat curvature reads
// without referencing the main surface underneath. The rim stays flat
// (lambert applied only to body) so the patch boundary stays uniform
// regardless of surface tilt.
const LAMBERT_AMBIENT = 0.6;
const LAMBERT_DIFFUSE = 0.4;

const RENDER_ORDER = 1;

// polygonOffset values. Negative factor + units shift the overlay's
// depth toward the camera, so coplanar fragments (every fragment of
// the paraboloid / inv-paraboloid / saddle presets) consistently pass
// the depth test on top of the main surface rather than relying on
// GPU tie-breaking. Tunable in-headset if it over-separates visually.
const POLYGON_OFFSET_FACTOR = -1;
const POLYGON_OFFSET_UNITS = -1;

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aLocal;
  varying vec2 vLocal;
  varying vec3 vNormal;

  void main() {
    vLocal = aLocal;
    // mat3(modelMatrix) * normal puts the normal in world space,
    // matching the world-space uLightDir uniform. Same convention as
    // GraphSurface.ts's vertex shader; normalMatrix would put it in
    // view space and the lambert would drift under head rotation.
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix
                * vec4(position, 1.0);
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
  uniform vec3  uLightDir;
  uniform float uLambertAmbient;
  uniform float uLambertDiffuse;

  varying vec2 vLocal;
  varying vec3 vNormal;

  void main() {
    // Rim distance in math-frame meters, same as TranslucentRect.ts.
    float distFromEdge = uHalfExtent - max(abs(vLocal.x), abs(vLocal.y));
    float rim = 1.0 - smoothstep(0.0, uRimWidth, distFromEdge);

    // Subtle lambert on the body only — so curvature reads without
    // making the patch look solid. Rim stays flat-lit so the boundary
    // is uniform regardless of surface tilt.
    float lambert = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
    vec3 bodyShaded = uBodyColor * (uLambertAmbient + uLambertDiffuse * lambert);

    vec3 color = mix(bodyShaded, uRimColor, rim);
    float alpha = mix(uBodyAlpha, uRimAlpha, rim);
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface TaylorOverlayOptions {
  /** Active preset — provides f / gradF / hessF / domain. */
  preset: SaddleExtremaPreset;
  /** World-space anchor; math-origin lifts to this point. */
  surfaceCenter: THREE.Vector3;
  /** World-space directional-light direction (pre-normalized at the
   *  call site; cloned into the uLightDir uniform). Same value the
   *  scene's DirectionalLight + GraphSurface use. */
  lightDir: THREE.Vector3;
}

export interface TaylorOverlayHandles {
  readonly mesh: THREE.Mesh;
  /**
   * Update the overlay to the new (x₀, y₀) selected point. Mutates
   * `position` + `normal` BufferAttributes in place; marks them
   * dirty. No allocation.
   */
  setPose(x0: number, y0: number): void;
  /**
   * Swap the active preset. Recomputes half-extent, rewrites the
   * static-per-frame `aLocal` attribute, updates the `uHalfExtent`
   * uniform, and refreshes positions + normals for the boot pose so
   * the overlay isn't visually stale until the next setPose tick.
   */
  setPreset(preset: SaddleExtremaPreset, x0: number, y0: number): void;
  /** Dispose geometry + material exactly once. */
  dispose(): void;
}

export function createTaylorOverlay(
  opts: TaylorOverlayOptions,
): TaylorOverlayHandles {
  let preset = opts.preset;
  let halfExtent = computeHalfExtent(preset);
  const { surfaceCenter } = opts;

  const vertexCount = RES * RES;
  const quadCount = (RES - 1) * (RES - 1);
  const indexCount = quadCount * 2 * 3;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const locals = new Float32Array(vertexCount * 2);
  // RES = 49 ⇒ 2401 vertices, comfortably under the Uint16 ceiling.
  const indices = new Uint16Array(indexCount);

  // Static index buffer — winding mirrors GraphSurface.ts:193-207.
  let k = 0;
  for (let j = 0; j < RES - 1; j++) {
    for (let i = 0; i < RES - 1; i++) {
      const bl = j * RES + i;
      const br = j * RES + (i + 1);
      const tl = (j + 1) * RES + i;
      const tr = (j + 1) * RES + (i + 1);
      indices[k++] = bl;
      indices[k++] = br;
      indices[k++] = tl;
      indices[k++] = br;
      indices[k++] = tr;
      indices[k++] = tl;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  const normalAttr = new THREE.BufferAttribute(normals, 3);
  normalAttr.setUsage(THREE.DynamicDrawUsage);
  // `aLocal` stays at the default StaticDrawUsage — static relative
  // to frame frequency. It IS rewritten on preset swap (cadence
  // ~seconds, on tap), but the driver hint "this buffer doesn't
  // change frequently" still applies — preset taps are tens of
  // seconds apart in practice, not per frame.
  const localAttr = new THREE.BufferAttribute(locals, 2);
  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('normal', normalAttr);
  geometry.setAttribute('aLocal', localAttr);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits: POLYGON_OFFSET_UNITS,
    uniforms: {
      uHalfExtent: { value: halfExtent },
      uRimWidth: { value: OVERLAY_RIM_WIDTH },
      uBodyColor: { value: OVERLAY_BODY_COLOR.clone() },
      uBodyAlpha: { value: OVERLAY_BODY_ALPHA },
      uRimColor: { value: OVERLAY_RIM_COLOR.clone() },
      uRimAlpha: { value: OVERLAY_RIM_ALPHA },
      uLightDir: { value: opts.lightDir.clone() },
      uLambertAmbient: { value: LAMBERT_AMBIENT },
      uLambertDiffuse: { value: LAMBERT_DIFFUSE },
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = RENDER_ORDER;
  // Per-frame position mutation invalidates the cached bounding sphere
  // (Three.js doesn't auto-recompute on needsUpdate). The overlay is
  // always near SURFACE_CENTER and small; frustum culling on a tiny
  // mesh in the FOV center never pays for itself.
  mesh.frustumCulled = false;

  // Persistent scratch — allocated once. Two separate Vector3s (one
  // position, one normal); merging would clobber position before it's
  // written to the typed array on each iteration. Same pattern as
  // GraphSurface.ts:155-156.
  const scratchPos = new THREE.Vector3();
  const scratchNorm = new THREE.Vector3();

  function recomputeLocal(): void {
    const step = (2 * halfExtent) / (RES - 1);
    for (let j = 0; j < RES; j++) {
      const v = -halfExtent + j * step;
      for (let i = 0; i < RES; i++) {
        const u = -halfExtent + i * step;
        const idx = (j * RES + i) * 2;
        locals[idx + 0] = u;
        locals[idx + 1] = v;
      }
    }
  }

  function writePose(x0: number, y0: number): void {
    const f0 = preset.f(x0, y0);
    const [fx, fy] = preset.gradF(x0, y0);
    const [fxx, fxy, fyy] = preset.hessF(x0, y0);
    const step = (2 * halfExtent) / (RES - 1);

    for (let j = 0; j < RES; j++) {
      const v = -halfExtent + j * step;
      for (let i = 0; i < RES; i++) {
        const u = -halfExtent + i * step;
        // q(u, v) = f₀ + fx·u + fy·v
        //        + ½·(fxx·u² + 2·fxy·u·v + fyy·v²)
        const q =
          f0 +
          fx * u +
          fy * v +
          0.5 * (fxx * u * u + 2 * fxy * u * v + fyy * v * v);
        // ∂q/∂x = ∂q/∂u (since x = x₀ + u): fx + fxx·u + fxy·v.
        // ∂q/∂y = ∂q/∂v: fy + fxy·u + fyy·v.
        const qx = fx + fxx * u + fxy * v;
        const qy = fy + fxy * u + fyy * v;

        // Inline the math-frame → world-frame mapping + surfaceCenter
        // offset. Equivalent to:
        //   writeGraphPointToWorld(x0 + u, y0 + v, q, surfaceCenter, scratchPos);
        //   writeMathToWorld([-qx, -qy, 1], scratchNorm).normalize();
        // Both helpers internally pack their scalar inputs into a
        // MathVec3 tuple, which allocates a fresh array per call.
        // Inside this 2401-iteration hot path (at 60 Hz that's ~144K
        // short-lived arrays/sec) the GC pressure produced frame-rate
        // hitches in headset. Inlining the math (math (a, b, c) →
        // world (a, c, -b), then + surfaceCenter) keeps the helpers'
        // semantics without their per-call tuple. Caught by GPT-5.5
        // in PR-#187 /roundtable-review.
        scratchPos.set(
          x0 + u + surfaceCenter.x,
          q + surfaceCenter.y,
          -(y0 + v) + surfaceCenter.z,
        );
        // Math normal: writeMathToWorld([-qx, -qy, 1], …) → (-qx, 1, qy).
        scratchNorm.set(-qx, 1, qy).normalize();

        const vIdx = (j * RES + i) * 3;
        positions[vIdx + 0] = scratchPos.x;
        positions[vIdx + 1] = scratchPos.y;
        positions[vIdx + 2] = scratchPos.z;
        normals[vIdx + 0] = scratchNorm.x;
        normals[vIdx + 1] = scratchNorm.y;
        normals[vIdx + 2] = scratchNorm.z;
      }
    }
  }

  // Seed initial state — `aLocal` and an initial position/normal pose
  // so the first paint isn't from a zero buffer. The scene re-calls
  // setPose on every frame; this just makes the very-first paint sane.
  recomputeLocal();
  writePose(0, 0);

  return {
    mesh,

    setPose(x0: number, y0: number): void {
      writePose(x0, y0);
      positionAttr.needsUpdate = true;
      normalAttr.needsUpdate = true;
    },

    setPreset(nextPreset: SaddleExtremaPreset, x0: number, y0: number): void {
      preset = nextPreset;
      halfExtent = computeHalfExtent(nextPreset);
      recomputeLocal();
      localAttr.needsUpdate = true;
      (material.uniforms.uHalfExtent as { value: number }).value = halfExtent;
      // Refresh positions + normals for the boot pose so the next
      // frame doesn't render a stale shape from the prior preset.
      writePose(x0, y0);
      positionAttr.needsUpdate = true;
      normalAttr.needsUpdate = true;
    },

    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
