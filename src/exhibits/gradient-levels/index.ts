import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '../../shell/clusters';
import { registerExhibit } from '../../shell/registry';
import { writeMathToWorld } from '@/scaffold/math/frames';
import { directionFromAngles } from '@/scaffold/math/directionFromAngles';
import { createImplicitSurface } from '@/scaffold/render/ImplicitSurface';
import { raycastImplicit } from '@/scaffold/render/raycastImplicit';
import { Slider } from '@/scaffold/ui/Slider';
import { WorldAxes, type AxisName } from '@/scaffold/ui/WorldAxes';
import { DEFAULT_AXIS_COLORS } from '@/scaffold/design/tokens';
import { createGradientArrow, type GradientArrowHandles } from './GradientArrow';
import { BOUND, fJsRaw, gradJs } from './surfaceModel';

// Gradient + level-surfaces scene (#162 epic). Third member of the
// calculus3 cluster, alongside quadrics and tangent-planes. The user
// sees a single quadric level surface { f(x, y, z) = k } for the family
// f = x² + y² − z² and three sliders: θ/φ select a point on the active
// level surface (#164), k sweeps the level value across [-2, 2] (#163).
//
// Pedagogy target: APPM 2350 §11.6 (gradient + level surfaces). Stuck-point:
// students treat level surfaces as static "snapshots" rather than as a
// continuously-deforming family. Sweeping k traverses three textbook poses
// — 1-sheet hyperboloid (k > 0), double cone (k = 0), 2-sheet hyperboloid
// (k < 0) — inside one slider range, with a topology change in the middle.
//
// Sub-issue progression: #163 established the surface + k slider; #164
// added θ/φ point selection; #165 the gradient arrow (this PR); #166 the
// readout; #167 the numeric k label. f is intentionally non-editable in
// v0.7 — the quadrics manipulator already covers surface-family
// morphing, and this scene's story is k as a parameter, not (a, b, c).
// Recorded in SPEC.md.

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

// Match cluster siblings so SceneRack swaps don't visually relocate the
// surface or the rack.
const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);
const SLIDER_RACK_CENTER = new THREE.Vector3(0, 1.0, -0.7);
const AXIS_INDICATOR_POSITION = new THREE.Vector3(0.35, 1.17, -0.7);

// Cluster siblings' lighting + base color so the surface reads as a
// sibling, not as a separate scene's surface.
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
const BASE_COLOR = new THREE.Color(0.4, 0.7, 0.95);

// Quadrics' design feel ports across the cluster.
const SLIDER_SNAP_DETENT = 0.05;
const GRAB_RADIUS_MULTIPLIER = 2.75;
const SLIDER_ROW_PITCH = 0.14;

// Three-row slider stack centered at SLIDER_RACK_CENTER.y. Top to bottom:
// θ (point selector, polar), φ (point selector, azimuth), k (level value).
// k moves to the bottom row in #164 — was at rack-center in #163. The
// pedagogy hierarchy is "where on this surface (θ/φ) ← which surface (k)";
// the where-question lives above the family-selector.
const THETA_Y = SLIDER_RACK_CENTER.y + SLIDER_ROW_PITCH;
const PHI_Y = SLIDER_RACK_CENTER.y;
const K_Y = SLIDER_RACK_CENTER.y - SLIDER_ROW_PITCH;

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

// θ ∈ [0, π], snap at the two poles + the equator. φ ∈ [-π, π], snap at
// the four cardinal compass directions; the ±π double-snap on φ is
// deliberate (closed-range slider, not wrapping — see #147 §3.2).
const THETA_SNAP_POINTS: readonly number[] = [0, Math.PI / 2, Math.PI];
const PHI_SNAP_POINTS: readonly number[] = [
  -Math.PI,
  -Math.PI / 2,
  0,
  Math.PI / 2,
  Math.PI,
];

// Initial pose: off both poles AND off every snap point so the user
// sees both sliders responding immediately on first load. Concrete check
// at K_INITIAL = +0.5: t² · cos(2π/3) = −0.5 ⇒ t² · (−0.5) = −0.5 ⇒
// t = 1; point ≈ (0.612, 0.612, 0.5) — well inside BOUND = 3.0. Both
// sliders read responsive at boot. (Mirrors tangent-planes' #147 §3.5
// initial-pose lock.)
const THETA_INITIAL = Math.PI / 3;
const PHI_INITIAL = Math.PI / 4;

// Off-axis neutral gray so the user doesn't read these as
// axis-coefficient sliders (vermillion / bluish-green / sky-blue carry
// math-X / Y / Z meaning across the cluster). All three sliders share
// this base color — k, θ, φ are all non-axis-aligned scalar parameters.
const SLIDER_BASE_COLOR = 0xaaaaaa;

// Indicator visual: small enough to read as "a point on the surface"
// rather than as a sphere of its own; large enough to remain visible
// from the user's spawn ~2.5 m away. Verbatim port from tangent-planes
// for cluster-sibling visual consistency.
const INDICATOR_RADIUS = 0.04;
const INDICATOR_COLOR = 0xdddddd;

const AXIS_COLORS: Record<AxisName, number> = DEFAULT_AXIS_COLORS;

// ────────────────────────────────────────────────────────────────────
// Surface model — paired GLSL (this file) + JS (`./surfaceModel.ts`).
// The two halves operate in DIFFERENT frames and that's intentional:
//
//   - GLSL operates on world-frame `p`. The math frame routes math-Y
//     forward → −world-Z and math-Z up → world-Y; squaring drops the
//     sign, so math-Z² ↔ world-Y² ↔ p.y². For the family `x_m² + y_m²
//     − z_m² = k` to open vertically (along math-Z = world-up matching
//     the textbook §11.6 diagrams), the negative term lands on p.y².
//
//   - JS (`fJsRaw` in `./surfaceModel.ts`) operates on math-frame
//     coords directly. The negative term lives on the third (math-Z)
//     component. Reads as the textbook formula.
//
// Both forms are correct in their own frame. The paired layout
// (GLSL here, JS in the test-importable surfaceModel.ts) makes drift
// a code-review-visible event: a sign flip in either half of the pair
// would either fail tests (JS half drift) or fail the headset smoke
// (GLSL half drift). #164 adds the JS half to satisfy the CPU
// raymarcher in update() below.
// ────────────────────────────────────────────────────────────────────

const SURFACE_F_IMPLICIT_GLSL = /* glsl */ `
  float fImplicit(vec3 p) {
    // World-frame p; negative term on p.y² (= math-Z² because
    // math-Z maps to world-Y per scaffold/math/frames.ts).
    return p.x * p.x + p.z * p.z - p.y * p.y - uK;
  }
`;

const SURFACE_GRAD_F_GLSL = /* glsl */ `
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
`;

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

// Persistent scratch — allocated once at module scope, mutated each
// frame, never disposed. `dirMath` MUST be the mutable tuple form
// (not `MathVec3`, which is `readonly [...]` and would block the
// index writes inside `directionFromAngles`).
const indicatorWorld = new THREE.Vector3();
const dirMath: [number, number, number] = [0, 0, 0];

// Named handles — initialized in mount, disposed inline in unmount.
let surfaceMesh: THREE.Mesh | undefined;
let surfaceMaterial: THREE.ShaderMaterial | undefined;
let kSlider: Slider | undefined;
let thetaSlider: Slider | undefined;
let phiSlider: Slider | undefined;
let indicator: THREE.Mesh | undefined;
let gradientArrow: GradientArrowHandles | undefined;
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
      bound: BOUND,
      uniforms: SURFACE_UNIFORM_DECLS,
      fImplicit: SURFACE_F_IMPLICIT_GLSL,
      gradF: SURFACE_GRAD_F_GLSL,
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

    // Three-row slider stack: θ on top, φ middle, k on bottom. The
    // stack is centered at SLIDER_RACK_CENTER.y; row pitch matches
    // cluster siblings (#147 § tangent-planes). All three share
    // SLIDER_BASE_COLOR (neutral gray) — none carry axis meaning.

    thetaSlider = new Slider({
      label: 'θ',
      min: 0,
      max: Math.PI,
      initial: THETA_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: THETA_SNAP_POINTS,
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
      baseColor: SLIDER_BASE_COLOR,
      thumbShape: 'sphere',
    });
    thetaSlider.group.position.set(
      SLIDER_RACK_CENTER.x,
      THETA_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(thetaSlider.group);

    phiSlider = new Slider({
      label: 'φ',
      min: -Math.PI,
      max: Math.PI,
      initial: PHI_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: PHI_SNAP_POINTS,
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
      baseColor: SLIDER_BASE_COLOR,
      thumbShape: 'sphere',
    });
    phiSlider.group.position.set(
      SLIDER_RACK_CENTER.x,
      PHI_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(phiSlider.group);

    // k slider — `initial` matches the extraUniforms.uK seed above so
    // the boot pose is consistent across material and slider on first
    // paint. Position moves to bottom row in #164.
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
    kSlider.group.position.set(
      SLIDER_RACK_CENTER.x,
      K_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(kSlider.group);

    // Point indicator. Positioned in update() each frame; visible
    // only on raycast hit (Option A from plan §2.2 — miss → hide).
    indicator = new THREE.Mesh(
      new THREE.SphereGeometry(INDICATOR_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: INDICATOR_COLOR }),
    );
    group.add(indicator);

    // Gradient-vector arrow at the selected point (#165). Constructed
    // with `group.visible = false` so the renderer can't paint a stale
    // pose between mount and the first update tick — the first hit
    // frame in update calls setPose then setVisible(true) to uncloak.
    // Renders as overlay (depthTest: false, renderOrder: 2) so the
    // §11.6 punch line stays visible regardless of camera angle, even
    // for k<0 inward orientations where the surface body would
    // otherwise occlude the arrow.
    gradientArrow = createGradientArrow({ surfaceCenter: SURFACE_CENTER });
    group.add(gradientArrow.group);

    // Math-frame axis indicator — same anchor as cluster siblings.
    worldAxes = new WorldAxes({ axisColors: AXIS_COLORS });
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    group.add(worldAxes.group);
  },

  update() {
    if (!kSlider || !thetaSlider || !phiSlider || !indicator || !gradientArrow) return;

    // 1. Slider hover + drag tick. Order doesn't matter across the
    //    three sliders (each tracks its own grab/hover state).
    kSlider.updateHover(controllers);
    thetaSlider.updateHover(controllers);
    phiSlider.updateHover(controllers);
    kSlider.update();
    thetaSlider.update();
    phiSlider.update();

    // 2. Push k into the surface uniform (existing #163 path).
    if (surfaceMaterial) {
      surfaceMaterial.uniforms.uK.value = kSlider.value;
    }

    // 3. Math-frame direction from θ/φ — mutates `dirMath` in place;
    //    no per-frame allocation.
    directionFromAngles(thetaSlider.value, phiSlider.value, dirMath);

    // 4. CPU raymarch in math-frame surface-local coords. f closes
    //    over the current k each frame — one closure allocation per
    //    frame, well under the per-hit RaycastHit tuples raycastImplicit
    //    itself emits. Readability win over a mutable module-scope
    //    `currentK` variable.
    const k = kSlider.value;
    const result = raycastImplicit({
      f: (x, y, z) => fJsRaw(x, y, z) - k,
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: dirMath,
      bound: BOUND,
    });

    // 5. Indicator + gradient-arrow pose. Surface-local math → world.
    //    Arrow consumes `result.normal` (already unit-normalized by
    //    raycastImplicit); pose is set BEFORE setVisible(true) so the
    //    first uncloak frame paints at the correct pose, not the
    //    stale construction-time identity.
    if (result.hit) {
      indicator.visible = true;
      writeMathToWorld(result.point, indicatorWorld);
      indicator.position.copy(indicatorWorld).add(SURFACE_CENTER);

      gradientArrow.setPose(result.point, result.normal);
      gradientArrow.setVisible(true);
    } else {
      indicator.visible = false;
      gradientArrow.setVisible(false);
    }

    // 6. Yaw-only billboard on the WorldAxes letter labels so they
    //    read at any user yaw. Same per-frame contract as siblings.
    if (worldAxes && camera) worldAxes.faceCamera(camera);
  },

  unmount() {
    // 1. Release any active controller grabs so disposed sliders don't
    //    leak grab references back into the shell's controller objects.
    for (const c of controllers) {
      kSlider?.releaseFromController(c);
      thetaSlider?.releaseFromController(c);
      phiSlider?.releaseFromController(c);
    }

    // 2. Dispose named handles — geometry + material per Three.js
    //    convention. Each resource has exactly one disposal owner.
    //    NOTE: we do NOT call scene.remove(...) here. The shell removes
    //    ctx.group and its descendants automatically after `unmount`
    //    returns; the exhibit's job is GPU resource freeing only, not
    //    scene-graph manipulation. Mirrors tangent-planes' pattern.
    if (surfaceMesh) {
      surfaceMesh.geometry.dispose();
      surfaceMesh = undefined;
    }
    if (surfaceMaterial) {
      surfaceMaterial.dispose();
      surfaceMaterial = undefined;
    }
    if (indicator) {
      indicator.geometry.dispose();
      (indicator.material as THREE.Material).dispose();
      indicator = undefined;
    }
    // Arrow disposes its merged geometry + material via its own handle;
    // shell removes ctx.group + descendants automatically per the
    // existing convention (mirrors tangent-planes/index.ts:340-380).
    gradientArrow?.dispose();
    gradientArrow = undefined;
    kSlider?.dispose();
    kSlider = undefined;
    thetaSlider?.dispose();
    thetaSlider = undefined;
    phiSlider?.dispose();
    phiSlider = undefined;
    worldAxes?.dispose();
    worldAxes = undefined;

    // 3. Drop external references so a re-mount starts clean. The shell
    //    removes ctx.group and its descendants automatically.
    controllers = [];
    camera = undefined;
  },

  onSelectStart(controller: THREE.Object3D) {
    // Try sliders in rack order; first hit wins. Rack-first-refusal
    // arbitration happens upstream in the shell — by the time this
    // fires, SceneRack didn't consume the event.
    if (thetaSlider?.tryGrab(controller)) return;
    if (phiSlider?.tryGrab(controller)) return;
    kSlider?.tryGrab(controller);
  },

  onSelectEnd(controller: THREE.Object3D) {
    thetaSlider?.releaseFromController(controller);
    phiSlider?.releaseFromController(controller);
    kSlider?.releaseFromController(controller);
  },
};

registerExhibit(gradientLevelsExhibit);

export default gradientLevelsExhibit;
