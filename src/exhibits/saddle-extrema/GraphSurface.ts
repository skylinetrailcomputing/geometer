import * as THREE from 'three';
import { writeMathToWorld } from '@/scaffold/math/frames';

// Meshed graph-surface primitive for the saddle / extrema scene (#176).
// Tessellates `z = f(x, y)` over a rectangular (x, y) domain as a uniform
// grid; vertex normals derived analytically from the supplied gradF.
//
// Architectural divergence from the cluster's prior three scenes
// (quadrics, tangent-planes, gradient-levels), which all render an
// implicit surface via the GPU raymarcher at `scaffold/render/
// ImplicitSurface.ts`. Graph form `z = f(x, y)` doesn't fit that harness
// — there's no GLSL `fImplicit` analogue, and the natural primitive is a
// real BufferGeometry mesh, not a bounding cube with per-fragment
// sign-change detection.
//
// Lives at the scene's path for v1 per #176. Extraction to
// `src/scaffold/` is deferred until a second scene wants the primitive.
//
// Math-frame convention (X right, Y forward, Z up; see
// `scaffold/math/frames.ts`): the (x, y) domain lives in the math-XY
// plane and z = f(x, y) lifts vertically along math-Z. World-frame
// mapping is JS-side per vertex via `writeGraphPointToWorld` below.

/**
 * Convert a graph-form (math-frame) point into world coordinates anchored
 * at `surfaceCenter`. Bundles the two-step pattern `writeMathToWorld(...)
 * + add(surfaceCenter)` so downstream consumers (#177 selected-point
 * indicator, #179 critical-point markers, #180 quadratic overlay) don't
 * re-derive the contract.
 *
 * `writeMathToWorld` itself is a pure axis remap + sign flip (no
 * translation, per `scaffold/math/frames.ts`); the worldspace anchoring
 * happens here.
 */
export function writeGraphPointToWorld(
  x: number,
  y: number,
  z: number,
  surfaceCenter: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  writeMathToWorld([x, y, z], out);
  return out.add(surfaceCenter);
}

export interface GraphSurfaceDomain {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
}

export interface GraphSurfaceOptions {
  /** z = f(x, y) in math-frame coords. */
  f: (x: number, y: number) => number;
  /**
   * Analytic first partials: returns (f_x, f_y) at (x, y). Required (not
   * optional) — vertex normals are derived from this. v0.8 presets all
   * have closed-form partials; a central-difference fallback would add a
   * code path used only by hypothetical future student-supplied-f
   * callers.
   */
  gradF: (x: number, y: number) => readonly [number, number];
  /** Rectangular (x, y) domain in math-frame coords. */
  domain: GraphSurfaceDomain;
  /**
   * Grid resolution per side. Total vertices = res². Default 128.
   * Validated: must be integer, >= 2.
   */
  res?: number;
  /** World-space anchor where math-origin lifts to. Math-Z = 0 → this.y. */
  surfaceCenter: THREE.Vector3;
  /**
   * Base diffuse color, fed to the cluster-lambert `ShaderMaterial`
   * (see below) verbatim. Treated as linear-space RGB inside the shader
   * — pass the same value cluster siblings pass to their raymarch
   * harness (`new THREE.Color(0.4, 0.7, 0.95)` for v0.8 cluster sky-blue).
   */
  baseColor: THREE.Color;
  /**
   * World-space directional-light direction (the SAME direction the scene
   * passes to its `DirectionalLight.position`, pre-normalization). Baked
   * into the `uLightDir` uniform so the surface's lambert agrees with
   * the cluster's ShaderMaterial-rendered siblings.
   */
  lightDir: THREE.Vector3;
}

export interface GraphSurfaceHandles {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  dispose(): void;
}

const DEFAULT_RES = 128;

// `Uint16Array` index buffers max out at 65535 vertices; tip to `Uint32Array`
// once `res² > 65535`. `res = 128` ⇒ 16384 vertices, comfortably Uint16.
// `res = 256` ⇒ 65536, just past the Uint16 ceiling — uses Uint32.
const UINT16_VERTEX_CEILING = 65535;

export function createGraphSurface(
  opts: GraphSurfaceOptions,
): GraphSurfaceHandles {
  const res = opts.res ?? DEFAULT_RES;

  // §3.1 validation. Throws at construction with a clear message rather than
  // producing NaN geometry that would be observable only via faceting in
  // headset smoke.
  if (!Number.isInteger(res) || res < 2) {
    throw new Error(
      `createGraphSurface: res must be an integer >= 2 (got ${res})`,
    );
  }
  const { xMin, xMax, yMin, yMax } = opts.domain;
  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    xMin >= xMax
  ) {
    throw new Error(
      `createGraphSurface: domain.xMin (${xMin}) must be finite and < domain.xMax (${xMax})`,
    );
  }
  if (
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax) ||
    yMin >= yMax
  ) {
    throw new Error(
      `createGraphSurface: domain.yMin (${yMin}) must be finite and < domain.yMax (${yMax})`,
    );
  }

  const vertexCount = res * res;
  const quadCount = (res - 1) * (res - 1);
  const triCount = quadCount * 2;
  const indexCount = triCount * 3;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  // Index type selected by vertex-count ceiling. The Three.js
  // BufferAttribute carries its own array type; the renderer reads it
  // accordingly.
  const indices: Uint16Array | Uint32Array =
    vertexCount > UINT16_VERTEX_CEILING
      ? new Uint32Array(indexCount)
      : new Uint16Array(indexCount);

  // Two scratch Vector3 objects, allocated once. Reusing a single scratch
  // for both position and normal writes would clobber position before it's
  // stored into the Float32Array. The Vitest suite's combined
  // position+normal-correctness assertions catch a single-scratch mistake
  // immediately.
  const scratchPos = new THREE.Vector3();
  const scratchNorm = new THREE.Vector3();

  const xStep = (xMax - xMin) / (res - 1);
  const yStep = (yMax - yMin) / (res - 1);

  for (let j = 0; j < res; j++) {
    const y = yMin + j * yStep;
    for (let i = 0; i < res; i++) {
      const x = xMin + i * xStep;
      const z = opts.f(x, y);

      writeGraphPointToWorld(x, y, z, opts.surfaceCenter, scratchPos);

      // Math-frame normal: surface is the graph of f, i.e. the implicit
      // surface { z − f(x, y) = 0 }, whose gradient is (−f_x, −f_y, 1).
      // Direction-only conversion via writeMathToWorld (no surfaceCenter
      // offset — surfaceCenter is a position, not a direction).
      const [fx, fy] = opts.gradF(x, y);
      writeMathToWorld([-fx, -fy, 1], scratchNorm).normalize();

      const vIdx = (j * res + i) * 3;
      positions[vIdx + 0] = scratchPos.x;
      positions[vIdx + 1] = scratchPos.y;
      positions[vIdx + 2] = scratchPos.z;
      normals[vIdx + 0] = scratchNorm.x;
      normals[vIdx + 1] = scratchNorm.y;
      normals[vIdx + 2] = scratchNorm.z;
    }
  }

  // Index winding: per quad (i, j) → (i+1, j) → (i, j+1) → (i+1, j+1),
  // two triangles emitted as
  //   [bl, br, tl]  and  [br, tr, tl]
  // where bl = (i, j), br = (i+1, j), tl = (i, j+1), tr = (i+1, j+1).
  // The Vitest winding-order test pins that the cross-product of the
  // emitted triangle's edges agrees with the analytic normal at the
  // bottom-left vertex.
  let k = 0;
  for (let j = 0; j < res - 1; j++) {
    for (let i = 0; i < res - 1; i++) {
      const bl = j * res + i;
      const br = j * res + (i + 1);
      const tl = (j + 1) * res + i;
      const tr = (j + 1) * res + (i + 1);
      indices[k++] = bl;
      indices[k++] = br;
      indices[k++] = tl;
      indices[k++] = br;
      indices[k++] = tr;
      indices[k++] = tl;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // Cluster-lambert ShaderMaterial — reproduces the implicit-surface
  // cluster siblings' exact lighting formula
  // (`uBaseColor * (0.2 + 0.8 * max(dot(n, L), 0))`) so the saddle reads
  // as a visual kin during scene swaps. The v0.8 in-headset smoke
  // confirmed that `MeshStandardMaterial({metalness:0, roughness:0.6})`
  // under the same lights read as off-white vs. the cluster's clear
  // light-blue — the v2 plan / SPEC.md's pre-coded fallback (this
  // shader) is what ships.
  //
  // Vertex shader: `mat3(modelMatrix) * normal` (not `normalMatrix *
  // normal`) puts vNormal in world space, matching the world-space
  // `uLightDir` below. `normalMatrix` would put it in view space and
  // the lambert dot would drift under head rotation. (Mesh modelMatrix
  // is identity here — graph surface bakes world-frame positions at
  // build time — but the explicit form survives any future
  // repositioning, and matches `DoublePlane.ts:52`'s precedent.)
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix
                    * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBaseColor;
      uniform vec3 uLightDir;
      varying vec3 vNormal;
      void main() {
        float lambert = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
        gl_FragColor = vec4(uBaseColor * (0.2 + 0.8 * lambert), 1.0);
      }
    `,
    uniforms: {
      uBaseColor: { value: opts.baseColor.clone() },
      uLightDir: { value: opts.lightDir.clone() },
    },
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Per-vertex positions already bake in surfaceCenter via
  // writeGraphPointToWorld; mesh position stays at world origin.
  mesh.position.set(0, 0, 0);

  return {
    mesh,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
