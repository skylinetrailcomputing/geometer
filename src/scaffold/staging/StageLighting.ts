import * as THREE from 'three';

// Cluster-wide lighting pair for the v1.0 staged-exhibit vocabulary
// (#248 — extract-on-Nth-use lift from quadrics / tangent-planes /
// gradient-levels / saddle-extrema, all of which declared the
// identical `AmbientLight(0xffffff, 0.4) + DirectionalLight(0xffffff,
// 0.8)` block in `mount()`).
//
// EXHIBIT-OWNED, per-scene — same ownership + lifecycle as
// StageFloor / StageRailing / StageInnerRailing / ContrastPit
// (allocated in `mount`, disposed in `unmount`). The shell removes
// `ctx.group` after `unmount` returns, so `dispose()` only releases
// owned GPU resources. `castShadow` is unset, so today
// `DirectionalLight.shadow.map` is `null` and `Light.dispose()` is
// effectively a no-op — but the factory still calls it for
// forward-safety: a future consumer flipping `castShadow = true`
// through the exposed handle would otherwise leak the shadow map
// silently.
//
// Direction is REQUIRED (not defaulted): the scene's LIGHT_DIR also
// flows into the math surface's shader as `uLightDir` so the
// directional light and the shaded surface agree on a single
// math-frame illumination vector. Sharing it via this scaffold +
// re-using it scene-side as a uniform keeps that agreement
// declarative.

/** White light, on purpose. Immutable tuple per the THREE.js token
 *  export discipline (v1.0.md §4 / feedback_threejs_token_exports_
 *  immutable) — `0xffffff` would round-trip through every consumer's
 *  hex parsing, but the tuple stays consistent with sibling
 *  primitives (STAGE_FLOOR_COLOR_RGB, CONTRAST_PIT_COLOR_RGB). */
export const STAGE_LIGHTING_COLOR_RGB = [1, 1, 1] as const;

/** Ambient term intensity. Inherited verbatim from the per-scene
 *  duplication; first-pass and smoke-tunable
 *  (feedback_staging_dimensions_first_pass). */
export const STAGE_LIGHTING_AMBIENT_INTENSITY_DEFAULT = 0.4;

/** Directional term intensity. Inherited verbatim from the per-scene
 *  duplication; first-pass and smoke-tunable. */
export const STAGE_LIGHTING_DIRECTIONAL_INTENSITY_DEFAULT = 0.8;

/** Distance along `direction` at which the DirectionalLight sits.
 *  Three.js's DirectionalLight is positional only for shadow-camera
 *  framing (which we don't use here), but keeping the established
 *  `dir × 5` placement preserves the look across the lift. */
export const STAGE_LIGHTING_DISTANCE_DEFAULT = 5;

export interface StageLightingOptions {
  /** Math-frame illumination direction, unit length. Also flows into
   *  each scene's math-surface shader as `uLightDir` — that's why the
   *  scene owns it and passes it in here rather than the scaffold
   *  defaulting one. */
  readonly direction: THREE.Vector3;
  /** Default `STAGE_LIGHTING_AMBIENT_INTENSITY_DEFAULT`. */
  readonly ambientIntensity?: number;
  /** Default `STAGE_LIGHTING_DIRECTIONAL_INTENSITY_DEFAULT`. */
  readonly directionalIntensity?: number;
  /** Default `STAGE_LIGHTING_DISTANCE_DEFAULT`. */
  readonly distance?: number;
}

export interface StageLightingHandles {
  /** Add to the exhibit's group at mount time. */
  readonly group: THREE.Group;
  /** Uniform ambient term. Exposed for tests + smoke debugging. */
  readonly ambient: THREE.AmbientLight;
  /** Math-frame directional term. Exposed for tests + smoke debugging. */
  readonly directional: THREE.DirectionalLight;
  /** Idempotent. Exhibit calls in unmount(). Calls `directional.dispose()`
   *  unconditionally for forward-safety (today a no-op since `castShadow`
   *  is unset; non-trivial if anyone later flips it). */
  dispose(): void;
}

export function createStageLighting(
  opts: StageLightingOptions,
): StageLightingHandles {
  const color = new THREE.Color(...STAGE_LIGHTING_COLOR_RGB);
  const ambientIntensity =
    opts.ambientIntensity ?? STAGE_LIGHTING_AMBIENT_INTENSITY_DEFAULT;
  const directionalIntensity =
    opts.directionalIntensity ?? STAGE_LIGHTING_DIRECTIONAL_INTENSITY_DEFAULT;
  const distance = opts.distance ?? STAGE_LIGHTING_DISTANCE_DEFAULT;

  const ambient = new THREE.AmbientLight(color, ambientIntensity);
  const directional = new THREE.DirectionalLight(color, directionalIntensity);
  directional.position.copy(opts.direction).multiplyScalar(distance);

  const group = new THREE.Group();
  group.name = 'stage-lighting';
  group.add(ambient);
  group.add(directional);

  let disposed = false;
  return {
    group,
    ambient,
    directional,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      directional.dispose();
    },
  };
}
