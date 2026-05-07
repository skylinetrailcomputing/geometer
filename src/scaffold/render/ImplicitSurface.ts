import * as THREE from 'three';

// Generic raymarch harness for an axis-aligned bounded implicit surface
// f(p) = 0, in surface-local coords. Owns the parts that are stable across
// every quadric-style scene — vertex shader, ray–AABB clip, fixed-step
// march + sign-change bisection, the surface-local frame, and the per-
// fragment depth write that keeps Quest's asynchronous spacewarp from
// reprojecting the bounding cube instead of the visible surface (#67).
//
// Each consumer supplies the surface-specific GLSL: at minimum `fImplicit`
// and a `shadeHit(...)` that turns a hit point + normal into a color.
// Optional slots cover analytic gradients (skipping the central-difference
// default), shared helper functions, and extra uniform decls. Lighting,
// gridlines, glow bands, family-aware decoration, etc. all live in the
// consumer's `shade` slot — this module deliberately stays out of color.
//
// Lifted from src/exhibits/quadrics/index.ts in #129 so the tangent-planes
// scene (#121) can render the same implicit surface without duplicating
// the harness.

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Default gradient: central difference with h = 0.001. Cheap and surface-
// formula-agnostic, so the harness ships with one even when the consumer
// has no analytic form. Consumers that *do* have an analytic gradient
// should pass it via `gradF` — central differences amplify floating-point
// noise on flat regions (cf. #116 on the math-Y = 0 plane), and analytic
// is also faster (1 evaluation vs. 6).
const CENTRAL_DIFFERENCE_GRAD = /* glsl */ `
  vec3 gradF(vec3 p) {
    float h = 0.001;
    vec3 dx = vec3(h, 0.0, 0.0);
    vec3 dy = vec3(0.0, h, 0.0);
    vec3 dz = vec3(0.0, 0.0, h);
    return vec3(
      fImplicit(p + dx) - fImplicit(p - dx),
      fImplicit(p + dy) - fImplicit(p - dy),
      fImplicit(p + dz) - fImplicit(p - dz)
    ) / (2.0 * h);
  }
`;

export interface ImplicitSurfaceOptions {
  /**
   * World-space center of the bounding cube. The mesh is positioned here,
   * and `uSurfaceCenter` is initialized to this value. Surface-local
   * fragment coords are world coords minus this center, so the consumer's
   * `fImplicit` sees a surface centered on the origin.
   */
  surfaceCenter: THREE.Vector3;

  /**
   * Half-extent of the AABB around the surface center, in surface-local
   * meters. The bounding mesh is a BoxGeometry of side `2 * bound`. Rays
   * are clipped to this cube before marching; anything `fImplicit` defines
   * outside the cube is invisible.
   */
  bound: number;

  /** GLSL `uniform` declarations the consumer's shader chunks reference. */
  uniforms: string;

  /** Optional GLSL helper functions used inside `fImplicit` / `shade`. */
  helpers?: string;

  /** GLSL: must define `float fImplicit(vec3 p)`. Surface is `f = 0`. */
  fImplicit: string;

  /**
   * GLSL: must define `vec3 gradF(vec3 p)`. Defaults to central-difference
   * around `fImplicit` with h = 0.001. Pass an analytic form to avoid
   * gradient noise on flat regions and save the 6 extra `fImplicit` calls
   * per fragment.
   */
  gradF?: string;

  /**
   * GLSL: must define
   *   `vec3 shadeHit(vec3 pHit, vec3 n, vec3 hitWorld, vec3 rd)`
   * `pHit` is the hit point in surface-local coords; `n` is the
   * front-facing unit normal; `hitWorld = pHit + uSurfaceCenter`; `rd` is
   * the view ray direction. Returns linear RGB. Owns all lighting and
   * decoration — the harness writes the result straight to gl_FragColor.
   */
  shade: string;

  /**
   * Per-fragment uniform-march sample count across the AABB span, before
   * the bisection refines a sign change to a hit. Near-linear knob on
   * steady-state fragment cost — quadrics tuned this to 64 in #102 (was
   * 96) after the 12 m worst-case AABB diagonal showed sub-mm bisection
   * still resolved features. Lower is cheaper and more aliasing-prone.
   */
  steps?: number;

  /**
   * Bisection iteration count after a sign change is detected. 8 ⇒ ~2.7 mm
   * worst-case precision over a 12 m span (= 12 / 2^8), well below visible
   * pixel size at typical viewing distance. Each step is one extra
   * `fImplicit` evaluation.
   */
  bisect?: number;

  /**
   * Consumer-supplied uniforms, merged on top of the harness's built-ins
   * (`uSurfaceCenter`, `uBound`). Names declared in `uniforms` must match
   * keys here. Object identity is preserved so the consumer can mutate
   * `material.uniforms.uFoo.value` directly.
   */
  extraUniforms: Record<string, THREE.IUniform>;
}

export interface ImplicitSurfaceHandles {
  /**
   * The compiled ShaderMaterial. Mutate `material.uniforms.<name>.value`
   * to drive the surface from per-frame logic.
   */
  material: THREE.ShaderMaterial;

  /**
   * BoxGeometry mesh sized `2 × bound` per axis, positioned at
   * `surfaceCenter`. Caller is responsible for `scene.add(mesh)`.
   */
  mesh: THREE.Mesh;
}

/**
 * Build a raymarched implicit-surface mesh + material pair.
 *
 * The returned mesh is pre-positioned at `surfaceCenter` and ready to add
 * to a scene; the material exposes both the harness's `uSurfaceCenter` /
 * `uBound` uniforms and any `extraUniforms` passed in.
 */
export function createImplicitSurface(
  opts: ImplicitSurfaceOptions,
): ImplicitSurfaceHandles {
  const steps = opts.steps ?? 64;
  const bisect = opts.bisect ?? 8;

  const fragmentShader = buildFragmentShader({
    uniforms: opts.uniforms,
    helpers: opts.helpers ?? '',
    fImplicit: opts.fImplicit,
    gradF: opts.gradF ?? CENTRAL_DIFFERENCE_GRAD,
    shade: opts.shade,
    steps,
    bisect,
  });

  const uniforms: Record<string, THREE.IUniform> = {
    uSurfaceCenter: { value: opts.surfaceCenter.clone() },
    uBound: { value: opts.bound },
    ...opts.extraUniforms,
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader,
    // Camera can sit inside the bounding cube on extreme parameter poses
    // (or simply close to the surface center), so the mesh's back faces
    // must rasterize too — otherwise the surface vanishes whenever the
    // user steps inside the AABB.
    side: THREE.DoubleSide,
    uniforms,
  });

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(opts.bound * 2, opts.bound * 2, opts.bound * 2),
    material,
  );
  mesh.position.copy(opts.surfaceCenter);

  return { material, mesh };
}

interface FragmentShaderTemplate {
  uniforms: string;
  helpers: string;
  fImplicit: string;
  gradF: string;
  shade: string;
  steps: number;
  bisect: number;
}

function buildFragmentShader(t: FragmentShaderTemplate): string {
  return /* glsl */ `
    precision highp float;

    // Three.js auto-populates projectionMatrix on every program but only
    // declares it in the vertex prefix; fragment shaders must declare it
    // explicitly. (viewMatrix and cameraPosition are auto-declared.)
    uniform mat4 projectionMatrix;

    uniform vec3  uSurfaceCenter;
    uniform float uBound;

    ${t.uniforms}

    varying vec3 vWorldPos;

    ${t.helpers}

    ${t.fImplicit}

    ${t.gradF}

    ${t.shade}

    bool rayAABB(vec3 ro, vec3 rd, float r, out float tNear, out float tFar) {
      vec3 invD = 1.0 / rd;
      vec3 t0 = (vec3(-r) - ro) * invD;
      vec3 t1 = (vec3( r) - ro) * invD;
      vec3 tMin = min(t0, t1);
      vec3 tMax = max(t0, t1);
      tNear = max(max(tMin.x, tMin.y), tMin.z);
      tFar  = min(min(tMax.x, tMax.y), tMax.z);
      return tFar >= max(tNear, 0.0);
    }

    void main() {
      vec3 ro = cameraPosition - uSurfaceCenter;
      vec3 rd = normalize(vWorldPos - cameraPosition);

      float tNear, tFar;
      if (!rayAABB(ro, rd, uBound, tNear, tFar)) {
        discard;
      }
      float tStart = max(tNear, 0.0);

      const int STEPS = ${t.steps};
      float dt = (tFar - tStart) / float(STEPS);
      float t = tStart;
      float fPrev = fImplicit(ro + rd * t);
      bool hit = false;
      float tHit = 0.0;

      for (int i = 1; i <= STEPS; i++) {
        float tNext = tStart + float(i) * dt;
        float fNext = fImplicit(ro + rd * tNext);
        if (fPrev * fNext < 0.0) {
          float lo = t;
          float hi = tNext;
          float fLo = fPrev;
          const int BISECT = ${t.bisect};
          for (int b = 0; b < BISECT; b++) {
            float mid = 0.5 * (lo + hi);
            float fMid = fImplicit(ro + rd * mid);
            if (fLo * fMid < 0.0) {
              hi = mid;
            } else {
              lo = mid;
              fLo = fMid;
            }
          }
          tHit = 0.5 * (lo + hi);
          hit = true;
          break;
        }
        t = tNext;
        fPrev = fNext;
      }

      if (!hit) {
        discard;
      }

      vec3 pHit = ro + rd * tHit;
      vec3 n = normalize(gradF(pHit));
      // Front-face the normal against the view ray. The implicit surface is
      // two-sided (we render with DoubleSide so the camera can sit inside
      // the cube), so gradF can point either way relative to rd; lighting
      // wants whichever side is currently visible.
      if (dot(n, rd) > 0.0) {
        n = -n;
      }
      vec3 hitWorld = pHit + uSurfaceCenter;

      gl_FragColor = vec4(shadeHit(pHit, n, hitWorld, rd), 1.0);

      // Write the implicit-surface depth, not the bounding cube's. Quest's
      // asynchronous spacewarp reprojects per-pixel from the depth buffer;
      // with the cube's depth (meters off from the visible surface), the
      // reprojection smears the surface into a translucent / negative-space
      // ghost.
      vec4 clip = projectionMatrix * viewMatrix * vec4(hitWorld, 1.0);
      gl_FragDepth = (clip.z / clip.w) * 0.5 + 0.5;
    }
  `;
}
