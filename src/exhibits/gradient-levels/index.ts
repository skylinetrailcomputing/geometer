import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '../../shell/clusters';
import type { Pointer } from '../../shell/Pointer';
import { registerExhibit } from '../../shell/registry';
import { writeMathToWorld } from '@/scaffold/math/frames';
import { directionFromAngles } from '@/scaffold/math/directionFromAngles';
import { createImplicitSurface } from '@/scaffold/render/ImplicitSurface';
import { raycastImplicit } from '@/scaffold/render/raycastImplicit';
import { formatAnglePiFraction } from '@/scaffold/ui/formatAnglePiFraction';
import { Label } from '@/scaffold/ui/Label';
import { Slider } from '@/scaffold/ui/Slider';
import { WorldAxes, type AxisName } from '@/scaffold/ui/WorldAxes';
import {
  BLUISH_GREEN,
  DEFAULT_AXIS_COLORS,
  SKY_BLUE,
  VERMILLION,
  YELLOW,
} from '@/scaffold/design/tokens';
import { createGradientArrow, type GradientArrowHandles } from './GradientArrow';
import { GradientLevelsReadout } from './GradientLevelsReadout';
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

// Live readout (#166) — anchored above the three-row slider rack. y bumped
// to 1.42 (vs. tangent-planes' 1.32) to maintain ~0.18 m bottom-to-thumb-top
// clearance over the taller rack (top of θ slider thumb at y ≈ 1.21).
const READOUT_POSITION = new THREE.Vector3(0, 1.42, -0.7);

// Per-slider variable + value labels (#170). All three sliders (θ/φ/k)
// carry a two-line right-aligned label anchored ~0.05 m left of each
// slider's track-end. The k label was originally introduced by #167 as
// a one-line "k = N.NN" readout below the k slider; #170 unifies it into
// the same two-line shape as the new θ/φ labels — same per-row anchor,
// same fonts. Frees the y = 0.70 slot the old k label occupied.
const SLIDER_LABEL_X_OFFSET = -0.20;
const SLIDER_LABEL_PRIMARY_FONT_SIZE = 0.05;
const SLIDER_LABEL_SECONDARY_FONT_SIZE = 0.035;
const SLIDER_LABEL_LINE_GAP = 0.008;

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
// Helpers
// ────────────────────────────────────────────────────────────────────

const SLIDER_VALUE_MINUS = '−'; // U+2212 — cluster glyph convention

// k slider value formatter for the per-slider label (#170). Distinct
// from scaffold/ui/formatSignedMagnitude (which always prefixes ±) —
// per-slider labels render single values without tabular alignment, so
// a leading `+` reads as visual noise. Lift to scaffold/ui/ when a
// v0.8+ scene also wants this format (extract-on-third-use rule).
function formatLinearDecimal(v: number): string {
  if (v < 0) return `${SLIDER_VALUE_MINUS}${Math.abs(v).toFixed(2)}`;
  return v.toFixed(2);
}

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
let gradientLevelsReadout: GradientLevelsReadout | undefined;
let thetaLabel: Label | undefined;
let phiLabel: Label | undefined;
let kLabel: Label | undefined;
let worldAxes: WorldAxes | undefined;
let pointers: readonly Pointer[] = [];
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

  mount({ group, camera: cam, pointers: shellPointers }: ExhibitContext) {
    pointers = shellPointers;
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

    // Live readout of ∇f components + |∇f| (#166). Anchored above the
    // slider rack on the same z-plane. Top-line components carry the
    // cluster's axis-color convention (vermillion/bluish-green/sky-blue
    // for math-X/Y/Z); the |∇f| numeric is YELLOW to pair with the
    // gradient arrow — direction (arrow) + magnitude (number) are
    // facets of the same gradient vector. The arrow's rendered length
    // is fixed per #165; the YELLOW pairing communicates "same vector,"
    // not "this number is that arrow's length." See SPEC.md Readout
    // section for the full color-identity-decoupling note.
    gradientLevelsReadout = new GradientLevelsReadout({
      axisColors: [VERMILLION, BLUISH_GREEN, SKY_BLUE],
      magnitudeColor: YELLOW,
    });
    gradientLevelsReadout.group.position.copy(READOUT_POSITION);
    group.add(gradientLevelsReadout.group);

    // Per-slider variable + value labels (#170). All three sliders carry
    // the same two-line right-aligned shape: primary = variable name (set
    // once at mount), secondary = live value (per-frame in update()). The
    // k label was originally one-line "k = 0.50" below the slider (#167);
    // unified here into the cluster-uniform shape so all three sliders
    // read visually identically. Right-align (anchorX: 'right') keeps
    // worst-case secondary text — "−2.00" at k_min, "−0.80π" at φ
    // extremes — clear of the slider thumb at any value.
    thetaLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    thetaLabel.setPrimary('θ');
    thetaLabel.group.position.set(
      SLIDER_RACK_CENTER.x + SLIDER_LABEL_X_OFFSET,
      THETA_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(thetaLabel.group);

    phiLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    phiLabel.setPrimary('φ');
    phiLabel.group.position.set(
      SLIDER_RACK_CENTER.x + SLIDER_LABEL_X_OFFSET,
      PHI_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(phiLabel.group);

    kLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    kLabel.setPrimary('k');
    kLabel.group.position.set(
      SLIDER_RACK_CENTER.x + SLIDER_LABEL_X_OFFSET,
      K_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(kLabel.group);

    // Math-frame axis indicator — same anchor as cluster siblings.
    worldAxes = new WorldAxes({ axisColors: AXIS_COLORS });
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    group.add(worldAxes.group);
  },

  update() {
    // Per-slider labels (θ/φ/k) are accessory (#170) — handled by per-call
    // guards below; not gated here so a missing label never blocks
    // slider/raycast updates.
    if (
      !kSlider ||
      !thetaSlider ||
      !phiSlider ||
      !indicator ||
      !gradientArrow ||
      !gradientLevelsReadout
    ) return;

    // 1. Slider hover + drag tick. Order doesn't matter across the
    //    three sliders (each tracks its own grab/hover state).
    kSlider.updateHover(pointers);
    thetaSlider.updateHover(pointers);
    phiSlider.updateHover(pointers);
    kSlider.update();
    thetaSlider.update();
    phiSlider.update();

    // 2. Push k into the surface uniform (existing #163 path).
    if (surfaceMaterial) {
      surfaceMaterial.uniforms.uK.value = kSlider.value;
    }

    // 2b. Per-slider value labels (#170). `formatAnglePiFraction` is
    //     snap-aware — boot pose φ = π/4 is OFF-snap on this slider's
    //     PHI_SNAP_POINTS, so it renders as "0.25π" not the false-snap
    //     "π/4" glyph. `formatLinearDecimal` is the local helper above;
    //     extract-on-third-use deferred (only call site).
    //     `k` is preserved here for the raycast closure in step 4.
    const k = kSlider.value;
    if (thetaLabel && camera) {
      thetaLabel.setSecondary(
        formatAnglePiFraction(thetaSlider.value, THETA_SNAP_POINTS),
      );
      thetaLabel.faceCamera(camera);
    }
    if (phiLabel && camera) {
      phiLabel.setSecondary(
        formatAnglePiFraction(phiSlider.value, PHI_SNAP_POINTS),
      );
      phiLabel.faceCamera(camera);
    }
    if (kLabel && camera) {
      kLabel.setSecondary(formatLinearDecimal(k));
      kLabel.faceCamera(camera);
    }

    // 3. Math-frame direction from θ/φ — mutates `dirMath` in place;
    //    no per-frame allocation.
    directionFromAngles(thetaSlider.value, phiSlider.value, dirMath);

    // 4. CPU raymarch in math-frame surface-local coords. f closes
    //    over the current k each frame — one closure allocation per
    //    frame, well under the per-hit RaycastHit tuples raycastImplicit
    //    itself emits. Readability win over a mutable module-scope
    //    `currentK` variable. `k` is the slider value pulled in step 2b.
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

      // Readout consumes the RAW gradient gradJs(p), NOT the unit
      // result.normal — direction is the arrow's job; magnitude is
      // the readout's. The composition test in
      // test/exhibits/gradient-levels/formatGradientLevelsReadout.test.ts
      // pins this contract: a unit-normal wiring would format to '1.00'
      // instead of the real |∇f|.
      const gradAtPoint = gradJs(result.point[0], result.point[1], result.point[2]);
      gradientLevelsReadout.setValues(gradAtPoint);
    } else {
      indicator.visible = false;
      gradientArrow.setVisible(false);
      // Readout: freeze on last good value. Gradient-levels has real
      // miss frames (cone at k=0, polar/equator-band rays, AABB-clip
      // cases) — blanking each would flicker. The frozen display IS
      // the "no point currently selectable" signal; SPEC.md Readout
      // section documents the contract.
    }

    // 6. Yaw-only billboard on the WorldAxes letter labels so they
    //    read at any user yaw. Same per-frame contract as siblings.
    //    (Per-slider label faceCamera calls live in step 2b above.)
    if (worldAxes && camera) worldAxes.faceCamera(camera);
    if (camera) gradientLevelsReadout.faceCamera(camera);
  },

  unmount() {
    // 1. Release any active pointer grabs so disposed sliders don't
    //    leak grab references back into the shell's pointer instances.
    for (const p of pointers) {
      kSlider?.releaseFromPointer(p);
      thetaSlider?.releaseFromPointer(p);
      phiSlider?.releaseFromPointer(p);
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
    gradientLevelsReadout?.dispose();
    gradientLevelsReadout = undefined;
    thetaLabel?.dispose();
    thetaLabel = undefined;
    phiLabel?.dispose();
    phiLabel = undefined;
    kLabel?.dispose();
    kLabel = undefined;
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
    pointers = [];
    camera = undefined;
  },

  onSelectStart(pointer: Pointer) {
    // Try sliders in rack order; first hit wins. Rack-first-refusal
    // arbitration happens upstream in the shell — by the time this
    // fires, SceneRack didn't consume the event.
    if (thetaSlider?.tryGrab(pointer)) return;
    if (phiSlider?.tryGrab(pointer)) return;
    kSlider?.tryGrab(pointer);
  },

  onSelectEnd(pointer: Pointer) {
    thetaSlider?.releaseFromPointer(pointer);
    phiSlider?.releaseFromPointer(pointer);
    kSlider?.releaseFromPointer(pointer);
  },
};

registerExhibit(gradientLevelsExhibit);

export default gradientLevelsExhibit;
