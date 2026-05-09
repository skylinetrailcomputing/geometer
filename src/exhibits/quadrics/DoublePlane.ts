import * as THREE from 'three';
import type { PlanePose } from './classify';

// Stand-in mesh for axis-aligned plane regimes the marcher renders
// unreliably (#138, #142). Three cases qualify, all sharing the same
// edge-on fuzziness artifact at near-tangent ray angles:
//
//   * rank-1 + d_eff = 0 (tangent zero): `f(p) = α(p·k − offset)²` is
//     non-negative everywhere, vanishing only on the plane. Sign-change
//     hit detection mathematically never fires, so the marcher either
//     misses the surface or surfaces stochastic ULP-jitter noise where
//     rays graze the plane (#116 hypothesis 1, #138 regime 1).
//   * rank-0 + single linear nonzero: `f(p) = λ·k − d` has a real sign
//     change, but for grazing rays at near-tangent angles the crossing
//     can fall between discrete sample steps; adjacent fragments
//     randomly do/don't catch it, producing the same fuzzy speckle
//     (#116 hypothesis 2, #138 regime 2). Math-Y-only in practice.
//   * rank-1 + sgn(d_eff) = sgn(coef) (pair of parallel planes):
//     `f` factors to `α((p·k − center)² − r²)`, two parallel planes
//     at center ± √(d_eff / coef). The marcher catches the front plane
//     cleanly via the first sign change but the back plane aliases
//     through it as fragment-depth noise — the same per-fragment ULP-
//     jitter pattern, modulated by the front plane's depth write
//     (#142 regime 3).
//
// Rather than grow the harness to handle the failure modes (a footgun
// for any future scaffold consumer), this module renders the plane(s)
// explicitly when the predicate fires. The two-plane regime uses two
// sibling meshes that share material + geometry semantics; the
// single-plane regimes only show the first. `setPose(null)` hides
// everything; the caller restores the raymarched surface in the same
// step.
//
// Visual style mirrors the raymarched surface's world-axis-grid path
// (`shadeHit` in `quadrics/index.ts`) so the transition into and out of
// the double-plane regime reads as the same family of object — Lambertian
// against `uLightDir`, base color from `uBaseColor`, world-axis grid at
// `GRID_FREQ = 2`. Parametric grid doesn't apply (the plane is not a
// natural parameterization of any quadric family); the world-axis grid
// is the same fallback the surface itself uses for cylinders / cones /
// degenerates.

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    // PlaneGeometry's normal is +Z in mesh-local. Push through the
    // model matrix's rotational part for the math-axis-rotated cases.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uBaseColor;
  uniform vec3 uLightDir;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  // Same constants as quadrics' shadeHit world-axis path so the visual
  // continuity from raymarched-surface → plane is exact.
  const float GRID_FREQ = 2.0;
  const float GRID_INTENSITY = 0.6;
  const vec3  GRID_COLOR = vec3(0.05);

  void main() {
    vec3 n = normalize(vWorldNormal);
    // Front-face the normal against the view ray. The plane is rendered
    // DoubleSide so the camera can sit on either side of the surface
    // center; lighting wants whichever side is currently visible. Same
    // convention as ImplicitSurface's view-ray flip (dot(n, rd) > 0 → -n).
    vec3 viewRay = normalize(vWorldPos - cameraPosition);
    if (dot(n, viewRay) > 0.0) n = -n;

    float lambert = max(dot(n, normalize(uLightDir)), 0.0);
    vec3 baseColor = uBaseColor * (0.2 + 0.8 * lambert);

    vec3 g = abs(fract(vWorldPos * GRID_FREQ) - 0.5);
    float lineDist = min(min(g.x, g.y), g.z);
    float lineWidth = 1.5 * fwidth(lineDist);
    float gridMask = 1.0 - smoothstep(0.0, lineWidth, lineDist);

    vec3 color = mix(baseColor, GRID_COLOR, gridMask * GRID_INTENSITY);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Per-axis quaternions to align PlaneGeometry's default +Z normal with
// the math-frame axis the pose names. Matches SlicingPlane's per-axis
// rotation table — keep them in sync if the math→world frame routing
// changes.
const ROT_X = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI / 2,
);
const ROT_Y = new THREE.Quaternion(); // identity — default normal +Z
const ROT_Z = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);

export interface DoublePlaneOptions {
  /**
   * World-space center of the surface. The plane's parent group is
   * positioned here so the plane translates with the surface. Should
   * match the `surfaceCenter` passed to `createImplicitSurface`.
   */
  surfaceCenter: THREE.Vector3;

  /**
   * Half-extent of the surface AABB in surface-local meters. Plane
   * geometry is sized `2 × halfExtent` per side, matching the
   * raymarcher's bounding-cube cross-section so the plane fills the
   * same visible region the surface would.
   */
  halfExtent: number;

  /**
   * Base color for the plane's Lambertian shading. Should match the
   * raymarched surface's `uBaseColor` for visual continuity across the
   * regime transition.
   */
  baseColor: THREE.Color;

  /**
   * World-frame light direction for Lambertian shading. Should match
   * the raymarched surface's `uLightDir`.
   */
  lightDir: THREE.Vector3;
}

export interface DoublePlaneHandles {
  /**
   * Parent group holding the two sibling plane meshes. Caller adds it
   * to the scene; per-mesh `.visible` is the active toggle, driven
   * exclusively by `setPose`. Single-plane regimes only show the first
   * mesh; the parallel-pair regime shows both.
   */
  group: THREE.Group;

  /**
   * Drive plane visibility, orientation, and position from the
   * `getPlanePose` predicate's result. `null` hides everything; a
   * non-null pose with `offsets.length === 1` orients/positions the
   * first mesh and hides the second; `offsets.length === 2` drives
   * both meshes in parallel.
   *
   * The math→world swap (math-Y → −world-Z) lives inside this call so
   * the caller passes the predicate's result through unchanged.
   */
  setPose(pose: PlanePose | null): void;

  /**
   * Dispose the shared plane geometry + shader material. Call once
   * when the owning exhibit is unmounted; the two sibling meshes share
   * a single geometry/material pair, so each is disposed exactly once.
   */
  dispose(): void;
}

/**
 * Build the axis-aligned-plane stand-in meshes for the marcher-unreliable
 * regimes (#138, #142). Returned hidden; the caller drives visibility by
 * polling `getPlanePose` from the same module each frame and
 * forwarding the result.
 */
export function createDoublePlane(opts: DoublePlaneOptions): DoublePlaneHandles {
  const { surfaceCenter, halfExtent, baseColor, lightDir } = opts;

  const group = new THREE.Group();
  group.position.copy(surfaceCenter);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    // Camera can sit on either side of the plane (or be inside the
    // surface AABB at extreme parameter poses), so back faces must
    // rasterize too — same reason the implicit surface uses DoubleSide.
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor: { value: baseColor.clone() },
      uLightDir: { value: lightDir.clone() },
    },
  });

  const geometry = new THREE.PlaneGeometry(halfExtent * 2, halfExtent * 2);
  const meshes = [new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material)];
  for (const mesh of meshes) {
    mesh.visible = false;
    group.add(mesh);
  }

  function placeMesh(mesh: THREE.Mesh, axis: PlanePose['axis'], offset: number): void {
    // Past the AABB, the raymarched surface would also miss this plane
    // (it's outside the bounding cube). Hide rather than render a plane
    // the user wouldn't see in the equivalent non-degenerate pose.
    // Reachable in practice via small squared coefs paired with larger
    // linear shifts (center ± √(d_eff / coef) blows up as the squared
    // coef approaches zero).
    if (Math.abs(offset) > halfExtent) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    switch (axis) {
      case 'x':
        // Math-X ⇒ world-X (no flip). Normal +world-X.
        mesh.quaternion.copy(ROT_X);
        mesh.position.set(offset, 0, 0);
        break;
      case 'y':
        // Math-Y ⇒ −world-Z. Normal +world-Z (default orientation),
        // and the offset flips sign on the way to world coords —
        // mirrors SlicingPlane's `yPlane.position.z = -y0`.
        mesh.quaternion.copy(ROT_Y);
        mesh.position.set(0, 0, -offset);
        break;
      case 'z':
        // Math-Z ⇒ world-Y. Normal +world-Y.
        mesh.quaternion.copy(ROT_Z);
        mesh.position.set(0, offset, 0);
        break;
    }
  }

  return {
    group,
    setPose(pose: PlanePose | null): void {
      if (pose === null) {
        for (const mesh of meshes) mesh.visible = false;
        return;
      }
      for (let i = 0; i < meshes.length; i++) {
        if (i < pose.offsets.length) {
          placeMesh(meshes[i], pose.axis, pose.offsets[i]);
        } else {
          meshes[i].visible = false;
        }
      }
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
