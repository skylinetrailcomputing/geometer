import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '../../shell/clusters';
import { registerExhibit } from '../../shell/registry';
import { createImplicitSurface } from '@/scaffold/render/ImplicitSurface';
import { Slider } from '@/scaffold/ui/Slider';
import { WorldAxes, type AxisName } from '@/scaffold/ui/WorldAxes';
import { DEFAULT_AXIS_COLORS } from '@/scaffold/design/tokens';

// Gradient + level-surfaces scene (#163, parent epic #162). Third member of
// the calculus3 cluster, alongside quadrics and tangent-planes. The user
// sees a single quadric level surface { f(x, y, z) = k } for the family
// f = x² + y² − z² and a single slider that sweeps k across [-2, 2].
//
// Pedagogy target: APPM 2350 §11.6 (gradient + level surfaces). Stuck-point:
// students treat level surfaces as static "snapshots" rather than as a
// continuously-deforming family. Sweeping k traverses three textbook poses
// — 1-sheet hyperboloid (k > 0), double cone (k = 0), 2-sheet hyperboloid
// (k < 0) — inside one slider range, with a topology change in the middle.
//
// This PR establishes the worldspace footprint (surface + k slider +
// WorldAxes); #164 adds point selection on the active surface, #165 the
// gradient arrow, #166 the readout. f is intentionally non-editable in
// v0.7 — the quadrics manipulator already covers surface-family morphing,
// and this scene's story is k as a parameter, not (a, b, c). Recorded in
// SPEC.md.

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

// Match cluster siblings so SceneRack swaps don't visually relocate the
// surface or the rack.
const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);
const SLIDER_RACK_CENTER = new THREE.Vector3(0, 1.0, -0.7);
const AXIS_INDICATOR_POSITION = new THREE.Vector3(0.35, 1.17, -0.7);

// Family { x² + y² − z² = k } is unbounded along math-Z. At k = +2 the
// flare radius at math-Z = ±BOUND is √(2 + BOUND²); at BOUND = 3.0 that
// is √11 ≈ 3.32 m, wider than BOUND itself — so the AABB clips the
// surface where it is already on its outward flare, reading as a
// gradual taper into the box wall rather than a mid-belly slice.
const BOUND = 3.0;

// Cluster siblings' lighting + base color so the surface reads as a
// sibling, not as a separate scene's surface.
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
const BASE_COLOR = new THREE.Color(0.4, 0.7, 0.95);

// Quadrics' design feel ports across the cluster.
const SLIDER_SNAP_DETENT = 0.05;
const GRAB_RADIUS_MULTIPLIER = 2.75;

// k ∈ [-2, 2]. Wide enough to show distinct 2-sheet and 1-sheet poses
// while keeping the slider thumb's spatial sweep mapped to a meaningful
// family scan. Snap detents at the three textbook poses: -1 (canonical
// 2-sheet), 0 (cone — the topology transition), +1 (canonical 1-sheet).
const K_MIN = -2;
const K_MAX = 2;
const K_SNAP_POINTS: readonly number[] = [-1, 0, 1];

// Initial k. Positive (default 1-sheet hyperboloid for the §11.6
// pedagogy), off the cone singularity at zero, off every snap point so
// the user sees immediate continuous response in either drag direction.
// Single source of truth: referenced by the extraUniforms seed AND the
// slider's `initial` so the boot pose agrees on first paint.
const K_INITIAL = 0.5;

// Off-axis neutral gray so the user doesn't read the slider as an
// axis-coefficient slider (vermillion / bluish-green / sky-blue carry
// math-X / Y / Z meaning across the cluster). k is a scalar level value,
// no axis association.
const SLIDER_BASE_COLOR = 0xaaaaaa;

const AXIS_COLORS: Record<AxisName, number> = DEFAULT_AXIS_COLORS;

// ────────────────────────────────────────────────────────────────────
// Surface model — GLSL only.
//
// Math frame: math-X = world-X (right), math-Y = −world-Z (forward),
// math-Z = world-Y (up). The cluster convention (verified against
// quadrics/index.ts) is that the shader operates in world-frame coords;
// the math-frame mapping happens inside the formula.
//
// f_math(mx, my, mz) = mx² + my² − mz² − k. Substituting mx = p.x,
// my = −p.z, mz = p.y collapses to f = p.x² + p.z² − p.y² − uK; the sign
// is squared away in the my term, so the only observable consequence is
// which world-axis carries the negative term. The negative term must be
// on p.y² (= world-Y² = math-Z²) so the hyperboloid opens vertically —
// matching textbook §11.6 diagrams.
//
// No JS half in this PR. #164 introduces a CPU raymarcher for point
// selection and brings typed `fJs` / `gradJs` with it.
// ────────────────────────────────────────────────────────────────────

const SURFACE = {
  fImplicitGlsl: /* glsl */ `
    float fImplicit(vec3 p) {
      // Math-frame: math-X = world-X, math-Y = -world-Z, math-Z = world-Y.
      // Family { x_m² + y_m² - z_m² = k } opens along math-Z (= world-Y),
      // so the negative term is on p.y².
      return p.x * p.x + p.z * p.z - p.y * p.y - uK;
    }
  `,
  gradFGlsl: /* glsl */ `
    vec3 gradF(vec3 p) {
      vec3 g = vec3(2.0 * p.x, -2.0 * p.y, 2.0 * p.z);
      // Cone apex (k = 0, p = origin) makes g = vec3(0); the harness's
      // downstream normalize(gradF(p)) would produce NaN. Fall back to a
      // deterministic up-facing world normal — visually benign on a cone
      // whose apex is symmetric around the up axis. Central differences
      // are also degenerate at the origin (f(h,0,0) = f(-h,0,0) = h²),
      // so this shader-side guard is the right fix. The apex is
      // measure-zero in a uniform-stepped march, so this branch fires
      // for at most a single fragment per frame.
      if (dot(g, g) < 1e-6) g = vec3(0.0, 1.0, 0.0);
      return g;
    }
  `,
  bound: BOUND,
} as const;

const SURFACE_UNIFORM_DECLS = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uBaseColor;
  uniform float uK;
`;

const SURFACE_SHADE = /* glsl */ `
  vec3 shadeHit(vec3 pHit, vec3 n, vec3 hitWorld, vec3 rd) {
    float lambert = max(dot(n, normalize(uLightDir)), 0.0);
    return uBaseColor * (0.2 + 0.8 * lambert);
  }
`;

// ────────────────────────────────────────────────────────────────────
// Module-scoped state
// ────────────────────────────────────────────────────────────────────

// Named handles — initialized in mount, disposed inline in unmount.
let surfaceMesh: THREE.Mesh | undefined;
let surfaceMaterial: THREE.ShaderMaterial | undefined;
let kSlider: Slider | undefined;
let worldAxes: WorldAxes | undefined;
let controllers: readonly THREE.Object3D[] = [];
// Cached at mount; cleared at unmount. Used for the WorldAxes label
// yaw-billboarding in update().
let camera: THREE.Camera | undefined;

// ────────────────────────────────────────────────────────────────────
// Exhibit
// ────────────────────────────────────────────────────────────────────

const gradientLevelsExhibit: Exhibit = {
  id: 'gradient-levels',
  title: 'Level surfaces',
  cluster: CLUSTER_CALCULUS3,

  mount({ group, camera: cam, controllers: shellControllers }: ExhibitContext) {
    controllers = shellControllers;
    camera = cam;

    // Ambient + directional lights matching cluster siblings.
    group.add(new THREE.AmbientLight(0xffffff, 0.4));
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.copy(LIGHT_DIR).multiplyScalar(5);
    group.add(directional);

    // Implicit-surface mesh + ShaderMaterial via the shared harness. uK
    // is seeded at K_INITIAL so the surface boots at the right pose
    // even before the first update() tick.
    const surfaceHandles = createImplicitSurface({
      surfaceCenter: SURFACE_CENTER,
      bound: SURFACE.bound,
      uniforms: SURFACE_UNIFORM_DECLS,
      fImplicit: SURFACE.fImplicitGlsl,
      gradF: SURFACE.gradFGlsl,
      shade: SURFACE_SHADE,
      extraUniforms: {
        uLightDir: { value: LIGHT_DIR.clone() },
        uBaseColor: { value: BASE_COLOR.clone() },
        uK: { value: K_INITIAL },
      },
    });
    surfaceMesh = surfaceHandles.mesh;
    surfaceMaterial = surfaceHandles.material;
    group.add(surfaceHandles.mesh);

    // Single k slider — no SectionTab in this PR (one section only).
    // `initial` matches the extraUniforms.uK seed above so the boot
    // pose is consistent across material and slider on first paint.
    kSlider = new Slider({
      label: 'k',
      min: K_MIN,
      max: K_MAX,
      initial: K_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: K_SNAP_POINTS,
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
      baseColor: SLIDER_BASE_COLOR,
      thumbShape: 'sphere',
    });
    kSlider.group.position.copy(SLIDER_RACK_CENTER);
    group.add(kSlider.group);

    // Math-frame axis indicator — same anchor as cluster siblings.
    worldAxes = new WorldAxes({ axisColors: AXIS_COLORS });
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    group.add(worldAxes.group);
  },

  update() {
    if (!kSlider) return;

    // Slider hover + drag tick.
    kSlider.updateHover(controllers);
    kSlider.update();

    // Push k into the surface uniform.
    if (surfaceMaterial) {
      surfaceMaterial.uniforms.uK.value = kSlider.value;
    }

    // Yaw-only billboard on the WorldAxes letter labels so they read at
    // any user yaw. Same per-frame contract as cluster siblings.
    if (worldAxes && camera) worldAxes.faceCamera(camera);
  },

  unmount() {
    // 1. Release any active controller grabs so disposed sliders don't
    //    leak grab references back into the shell's controller objects.
    for (const c of controllers) {
      kSlider?.releaseFromController(c);
    }

    // 2. Dispose named handles — geometry + material per Three.js
    //    convention. Each resource has exactly one disposal owner.
    if (surfaceMesh) {
      surfaceMesh.geometry.dispose();
      surfaceMesh = undefined;
    }
    if (surfaceMaterial) {
      surfaceMaterial.dispose();
      surfaceMaterial = undefined;
    }
    kSlider?.dispose();
    kSlider = undefined;
    worldAxes?.dispose();
    worldAxes = undefined;

    // 3. Drop external references so a re-mount starts clean. The shell
    //    removes ctx.group and its descendants automatically.
    controllers = [];
    camera = undefined;
  },

  onSelectStart(controller: THREE.Object3D) {
    if (kSlider?.tryGrab(controller)) return;
  },

  onSelectEnd(controller: THREE.Object3D) {
    kSlider?.releaseFromController(controller);
  },
};

registerExhibit(gradientLevelsExhibit);

export default gradientLevelsExhibit;
