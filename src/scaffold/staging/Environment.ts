import * as THREE from 'three';

// Cluster-wide environment surround for the v1.0 staged-exhibit
// vocabulary (#221 / E1.3). Replaces the flat `scene.background =
// 0x111122` void (shell.ts:83) with a baked, static environment so
// each scene reads as "a dim room with this exhibit on a lit stage"
// rather than "an object in infinite black space."
//
// Ownership (per `_private/plans/v1.0.md` §4 staging rules): SHELL-
// OWNED singleton. Constructed once at the shell's scene seam,
// persists across every SceneRack switch (added to `scene`, never to
// a per-exhibit group, so shell.ts:472's `scene.remove(ctx.group)`
// never touches it). Torn down on HMR via a `disposers[]` closure
// pushed AFTER the renderer disposer so LIFO drains env GPU resources
// (dome geo/mat + gradient DataTexture) BEFORE renderer.dispose()
// frees the GL context (#224 plan §3.4 — two-way roundtable HIGH).
//
// ── Core / richness split (#224 plan §1; post-smoke amendment) ───
// `mode: 'flat'` (DEFAULT after PR #245 headset smoke) = a single
// tuned solid background, a touch lighter than the old 0x111122
// void, no dome, no fog. Brad's smoke finding: the gradient dome +
// fog were over-built for the perceptual payoff (a featureless
// gradient sphere shows no parallax — confirmed in-headset — so the
// dome-mesh-over-background-color rationale didn't hold; the fog
// reads "really light for humans"); v1.0.md §2 ranks E1.3
// atmosphere as the first cut, so the minimal "void, slightly
// lighter" is what ships. `mode: 'dome'` = the reviewed gradient
// sky dome + linear fog, kept as a tested opt-in for a future
// richer pass (delivers its "stage spotlight" read entirely via
// baked gradients — ZERO lights; per-scene AmbientLight+
// DirectionalLight pairs untouched). `richness` (default FALSE)
// opts the dome path into dim distant-detail slabs.
//
// ── Fog model: LOCKED linear THREE.Fog (#224 plan §3.2) ──────────
// Three-vendor roundtable converged on linear over FogExp2: linear
// fog applies ZERO attenuation for distance < `near`, making "the
// stage stays crisp" a hard, provable invariant rather than a
// density-tuning hope (FogExp2 cannot be crisp@14m AND heavy@40m at
// radius 40 simultaneously). `fogNear` is asserted ≥ MAX_STAGE_REACH.
//
// ── scene.fog material audit (#224 plan §3.5, as amended at
//    implementation after reading the UI code) ──────────────────
// `scene.fog` is global. The audit's enforcement mechanism is the
// `fogNear` invariant itself, NOT scattered per-material `fog:false`
// flags:
//   • Near-field UI — SceneTab/TapButton, troika readouts, Slider,
//     SectionTab, Label, WorldAxes — all sit near SURFACE_CENTER,
//     ≤ ~12 m from any reachable camera (OrbitControls maxDistance
//     = 12, cameraControls.ts:61). With linear fog and
//     fogNear ≥ 14, fog factor is provably 0 for them. No flag
//     needed; the invariant covers all present AND future cluster
//     UI (nothing to forget when a 5th scene lands).
//   • `TranslucentRect` overlays are a ShaderMaterial with no fog
//     uniforms/chunks → structurally fog-immune regardless of
//     scene.fog. No flag needed.
//   • `StageFloor` / `StageRailing` MeshStandardMaterial KEEP the
//     Three.js default `fog: true` — gentle atmospheric recession
//     of the stage edges past `fogNear` is the desired read.
//   • The dome opts OUT (`fog:false`) — it is the fog backdrop,
//     not fogged geometry.
//   • `SceneRack` is the one element that can marginally exceed
//     `fogNear` in an extreme orbit pose (~15 m, ~4% imperceptible
//     fade) AND is persistent shell-owned navigation UI, so the
//     shell sets `fog:false` on its mesh materials explicitly
//     (belt-and-suspenders + token-stability). Done at the shell,
//     not here — see shell.ts.
//
// Three.js export discipline (v1.0.md §4 / feedback_threejs_token_
// exports_immutable): colours are immutable RGB tuples (`as const`)
// + factory functions, never `export const c = new THREE.Color(...)`.

/**
 * Gradient stops, darkest at the floor/horizon band where the #215
 * translucent overlays + #216 readouts visually sit. Deliberately
 * conservative — kept in the `0x111122` family so the #215/#216
 * token calibration (tuned against today's void) holds without a
 * cluster-wide re-tune (#224 plan §1 / §2.3). The horizon stop is
 * the load-bearing one (overlays sit against it); it is canary-
 * tested in Environment.test.ts to stay within tolerance of
 * `0x111122`.
 *
 * Smoke-tuned first-pass values (feedback_staging_dimensions_first_
 * pass); the *invariant* (horizon ∈ 0x111122 family) is locked, the
 * exact hex are not.
 */
export const ENVIRONMENT_ZENITH_RGB = [0x0a / 255, 0x0a / 255, 0x18 / 255] as const;
export const ENVIRONMENT_MIDGLOW_RGB = [0x1a / 255, 0x1a / 255, 0x30 / 255] as const;
export const ENVIRONMENT_HORIZON_RGB = [0x11 / 255, 0x11 / 255, 0x22 / 255] as const;

/**
 * The shipped `mode: 'flat'` background — the old 0x111122 void
 * nudged a touch lighter (same cool-dark family) per PR #245 smoke
 * ("not much different from the void, just a little lighter").
 * First-pass smoke-tunable (feedback_staging_dimensions_first_pass);
 * Brad eyeballs the exact lift on the next preview. Kept distinct
 * from the gradient horizon stop so the two are independently
 * tunable and the intent is explicit, not coincidental.
 */
export const ENVIRONMENT_FLAT_BG_RGB = [0x1a / 255, 0x1a / 255, 0x2e / 255] as const;

/** Dome radius (world units). Default; overridable within invariants. */
export const ENVIRONMENT_RADIUS_DEFAULT = 40;

/**
 * Minimum legal `fogNear` = the cluster's largest stage reach. The
 * widest stage is tangent-planes (`outerHalfExtent: 6` + `back-
 * Extension: 3`); worst-case camera-to-far-stage-corner ≈ 13–14 m.
 * Linear fog ⇒ zero attenuation below this ⇒ the stage is provably
 * un-hazed (#224 plan §2.2 invariant 1).
 */
export const ENVIRONMENT_FOG_NEAR_MIN = 14;
export const ENVIRONMENT_FOG_NEAR_DEFAULT = 14;

/**
 * Max reachable camera distance from world origin: OrbitControls
 * `maxDistance = 12` (cameraControls.ts:61) about `target =
 * SURFACE_CENTER = (0, 1.5, -4)`; |SURFACE_CENTER| = √18.25 ≈ 4.27;
 * 12 + 4.27 ≈ 16.3. VR is room-scale + no-teleport (#221), bounded
 * tighter. The dome radius must clear this so a `BackSide` sphere
 * can never be exited (→ black void on the primary audition
 * surface — roundtable GPT #5).
 */
export const ENVIRONMENT_MAX_CAMERA_REACH = 16.3;
export const ENVIRONMENT_RADIUS_MARGIN = 8;

/**
 * Shell `PerspectiveCamera` far plane (mirrors shell.ts:88).
 * Asserted so a future far-plane reduction below the dome radius is
 * caught at construction rather than as silent dome clipping.
 */
export const ENVIRONMENT_CAMERA_FAR = 100;

/** Dome renders first + tests/writes no depth (see §3.2). */
export const ENVIRONMENT_DOME_RENDER_ORDER = -1;

/** Vertical resolution of the gradient DataTexture (1 × N RGBA8). */
const GRADIENT_TEXELS = 64;

type RGB = readonly [number, number, number];

/**
 * Pure: the three gradient stops as 0–1 RGB tuples. Exposed so the
 * canary test can assert the horizon stop without rasterizing a
 * texture (no jsdom canvas dependency — roundtable GPT #6).
 */
export function buildGradientStops(): {
  zenith: RGB;
  midGlow: RGB;
  horizon: RGB;
} {
  return {
    zenith: ENVIRONMENT_ZENITH_RGB,
    midGlow: ENVIRONMENT_MIDGLOW_RGB,
    horizon: ENVIRONMENT_HORIZON_RGB,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Build the vertical-gradient DataTexture. SphereGeometry's V runs 0
 * at the −Y (floor-ward) pole to 1 at the +Y (zenith) pole, so texel
 * 0 = horizon/floor tone, top texel = zenith, with the cool up-glow
 * mid-dome. DataTexture needs no `<canvas>` → fully Vitest-
 * constructible.
 */
function buildGradientTexture(): THREE.DataTexture {
  const { zenith, midGlow, horizon } = buildGradientStops();
  const data = new Uint8Array(GRADIENT_TEXELS * 4);
  for (let i = 0; i < GRADIENT_TEXELS; i++) {
    const v = i / (GRADIENT_TEXELS - 1); // 0 = floor-ward, 1 = zenith
    // Piecewise: floor→up-glow over the lower half, up-glow→zenith
    // over the upper half.
    let r: number, g: number, b: number;
    if (v < 0.5) {
      const t = v / 0.5;
      r = lerp(horizon[0], midGlow[0], t);
      g = lerp(horizon[1], midGlow[1], t);
      b = lerp(horizon[2], midGlow[2], t);
    } else {
      const t = (v - 0.5) / 0.5;
      r = lerp(midGlow[0], zenith[0], t);
      g = lerp(midGlow[1], zenith[1], t);
      b = lerp(midGlow[2], zenith[2], t);
    }
    const o = i * 4;
    data[o] = Math.round(r * 255);
    data[o + 1] = Math.round(g * 255);
    data[o + 2] = Math.round(b * 255);
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(
    data,
    1,
    GRADIENT_TEXELS,
    THREE.RGBAFormat,
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function horizonColor(): THREE.Color {
  return new THREE.Color(...ENVIRONMENT_HORIZON_RGB);
}

export interface EnvironmentOptions {
  /**
   * `'flat'` (DEFAULT, post-#245-smoke) = a tuned solid background a
   * touch lighter than the void, no dome/fog. `'dome'` = the
   * reviewed gradient dome + linear fog (opt-in; future richer
   * pass).
   */
  readonly mode?: 'dome' | 'flat';
  /**
   * Dome radius (world units). Invariants:
   * `fogFar ≤ radius`, `radius ≥ MAX_CAMERA_REACH + margin`,
   * `radius < CAMERA_FAR`. Default `ENVIRONMENT_RADIUS_DEFAULT`.
   */
  readonly radius?: number;
  /**
   * Linear-fog onset. Invariant `fogNear ≥ ENVIRONMENT_FOG_NEAR_MIN`
   * so the stage is provably un-hazed. Default
   * `ENVIRONMENT_FOG_NEAR_DEFAULT`.
   */
  readonly fogNear?: number;
  /** Linear-fog full-occlusion distance. Invariant `fogNear < fogFar
   *  ≤ radius`. Default = `radius`. */
  readonly fogFar?: number;
  /** Opt-in dim distant-detail slabs at the fog boundary. v1 default
   *  FALSE (atmosphere is the first cut, v1.0.md §2). */
  readonly richness?: boolean;
}

export interface EnvironmentHandles {
  /** Shell adds to `scene` once at boot; survives scene switches.
   *  Empty group in `'flat'` mode. */
  readonly group: THREE.Group;
  /** Linear `THREE.Fog` (`'dome'`) or `null` (`'flat'`). Shell does
   *  `scene.fog = handles.fog`. */
  readonly fog: THREE.Fog | null;
  /** Solid background for `'flat'` mode, else `null`. Shell does
   *  `scene.background = handles.background`. */
  readonly background: THREE.Color | null;
  /** Idempotent. Disposes dome geo/mat + gradient texture (+ richness
   *  geos/mats). Mirrors StageFloor's `disposed` guard. */
  dispose(): void;
}

export function createEnvironment(
  opts: EnvironmentOptions = {},
): EnvironmentHandles {
  const mode = opts.mode ?? 'flat';
  const radius = opts.radius ?? ENVIRONMENT_RADIUS_DEFAULT;
  const fogNear = opts.fogNear ?? ENVIRONMENT_FOG_NEAR_DEFAULT;
  const fogFar = opts.fogFar ?? radius;
  const richness = opts.richness ?? false;

  const group = new THREE.Group();
  group.name = 'environment';

  if (mode === 'flat') {
    // Shipped default (post-#245 smoke): a single tuned clear
    // colour, no dome, no fog — ≈ today's cost, the void nudged a
    // touch lighter. Cheapest possible for the Quest fragment
    // budget.
    let disposed = false;
    return {
      group,
      fog: null,
      background: new THREE.Color(...ENVIRONMENT_FLAT_BG_RGB),
      dispose(): void {
        if (disposed) return;
        disposed = true;
        // Nothing GPU-owned in 'flat' mode.
      },
    };
  }

  // ── 'dome' mode: invariant gate (#224 plan §2.2) ───────────────
  if (fogNear < ENVIRONMENT_FOG_NEAR_MIN) {
    throw new Error(
      `createEnvironment: fogNear invariant violated — fogNear=${fogNear} ` +
        `< ENVIRONMENT_FOG_NEAR_MIN=${ENVIRONMENT_FOG_NEAR_MIN}. Linear fog ` +
        `would haze the stage; raise fogNear or shrink the stage envelope.`,
    );
  }
  if (fogNear >= fogFar) {
    throw new Error(
      `createEnvironment: fog ordering invariant violated — ` +
        `fogNear=${fogNear} must be < fogFar=${fogFar}.`,
    );
  }
  if (fogFar > radius) {
    throw new Error(
      `createEnvironment: fogFar invariant violated — fogFar=${fogFar} ` +
        `> radius=${radius}. Fog must fully occlude at/before the dome.`,
    );
  }
  if (radius < ENVIRONMENT_MAX_CAMERA_REACH + ENVIRONMENT_RADIUS_MARGIN) {
    throw new Error(
      `createEnvironment: radius invariant violated — radius=${radius} ` +
        `< MAX_CAMERA_REACH(${ENVIRONMENT_MAX_CAMERA_REACH}) + ` +
        `margin(${ENVIRONMENT_RADIUS_MARGIN}). The camera could exit the ` +
        `BackSide dome → black void.`,
    );
  }
  if (radius >= ENVIRONMENT_CAMERA_FAR) {
    throw new Error(
      `createEnvironment: radius invariant violated — radius=${radius} ` +
        `>= CAMERA_FAR(${ENVIRONMENT_CAMERA_FAR}). The dome would clip ` +
        `against the camera far plane.`,
    );
  }

  const gradientTexture = buildGradientTexture();
  const domeGeometry = new THREE.SphereGeometry(radius, 32, 16);
  const domeMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    map: gradientTexture,
    // Backdrop: paint first (renderOrder -1), test/write no depth so
    // it can never occlude stage geometry and stage geometry never
    // "punches through" it. Deterministic — does not rely on same-
    // renderOrder opaque sort (roundtable Sonnet #5 / DeepSeek #2).
    fog: false,
    depthWrite: false,
    depthTest: false,
  });
  const domeMesh = new THREE.Mesh(domeGeometry, domeMaterial);
  domeMesh.renderOrder = ENVIRONMENT_DOME_RENDER_ORDER;
  group.add(domeMesh);

  const richnessGeometries: THREE.BufferGeometry[] = [];
  const richnessMaterials: THREE.Material[] = [];
  if (richness) {
    // Dim unlit slabs just inside the dome, at the fog boundary, so
    // they dissolve into the horizon-tone fog (fog:true is correct
    // here — they sit at ~radius, far past fogNear). No per-exhibit-
    // floor interaction (they're at the dome, nowhere near a floor).
    const slabSpecs: ReadonlyArray<{ x: number; z: number; w: number }> = [
      { x: 0, z: -(radius - 4), w: 3 },
      { x: radius - 6, z: -(radius - 10), w: 2 },
    ];
    for (const s of slabSpecs) {
      const g = new THREE.BoxGeometry(s.w, 4.5, 0.3);
      const m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(...ENVIRONMENT_MIDGLOW_RGB),
        fog: true,
      });
      const slab = new THREE.Mesh(g, m);
      slab.position.set(s.x, 2.25, s.z);
      group.add(slab);
      richnessGeometries.push(g);
      richnessMaterials.push(m);
    }
  }

  const fog = new THREE.Fog(horizonColor(), fogNear, fogFar);

  let disposed = false;
  return {
    group,
    fog,
    background: null,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      domeGeometry.dispose();
      domeMaterial.dispose();
      gradientTexture.dispose();
      for (const g of richnessGeometries) g.dispose();
      for (const m of richnessMaterials) m.dispose();
      richnessGeometries.length = 0;
      richnessMaterials.length = 0;
    },
  };
}
