import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '../../shell/clusters';
import { registerExhibit } from '../../shell/registry';
import { writeMathToWorld, type MathVec3 } from '@/scaffold/math/frames';
import { createImplicitSurface } from '@/scaffold/render/ImplicitSurface';
import { Slider } from '@/scaffold/ui/Slider';
import { WorldAxes, type AxisName } from '@/scaffold/ui/WorldAxes';
import { DEFAULT_AXIS_COLORS } from '@/scaffold/design/tokens';
import { directionFromAngles } from './directionFromAngles';
import { raycastImplicit } from './raycastSurface';

// Tangent-planes scene (#147). First sub-issue of the #121 epic — sets up
// the v0.6 scene's surface + θ/φ point selection so #148 (tangent-plane
// mesh) and #149 (live readout) can hang their visuals off the indicator.
//
// Pedagogy target: APPM 2350 §11.4 (Tangent Planes and Linear Approximations).
// Stuck-point: students treat tangent-plane problems as rote symbol
// manipulation — compute the gradient, dot it with (x − x₀, y − y₀, z − z₀),
// set equal to zero. They don't internalize that the plane *reorients* as
// the point moves. v0.6's contribution: a slider-driven point that walks
// the surface continuously; v0.7+ (#148) hangs the actual plane on it.
//
// Surface choice: fixed canonical unit sphere `x² + y² + z² = 1`. No
// coefficient sliders — the quadrics manipulator already covers
// surface-family morphing; sibling scenes should differ in *what they
// teach*, not duplicate the surface UI. Decision recorded in SPEC.md.

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

// Match quadrics' SURFACE_CENTER + SLIDER_RACK_CENTER + axis-indicator
// position so navigating between cluster siblings doesn't visually
// relocate the surface. The same arm's-length depth (z = -0.7) carries
// across all rack tiers (slider rack, SectionTab rack, SceneRack).
const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);
const SLIDER_RACK_CENTER = new THREE.Vector3(0, 1.0, -0.7);
const AXIS_INDICATOR_POSITION = new THREE.Vector3(0.35, 1.17, -0.7);

// Tighter than quadrics' BOUND=3.5: the unit sphere fits in [-1, 1]³ with
// room to spare; no coefficient-driven expansion to budget for.
const BOUND = 1.5;

// Same lighting + base color as quadrics so the surface reads as a sibling.
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
const BASE_COLOR = new THREE.Color(0.4, 0.7, 0.95);

// Quadrics' design feel ports across.
const SLIDER_SNAP_DETENT = 0.05;
const GRAB_RADIUS_MULTIPLIER = 2.75;
const SLIDER_ROW_PITCH = 0.14;

// θ ∈ [0, π], snap at the two poles + the equator. φ ∈ [-π, π], snap at
// the four cardinal compass directions; the ±π double-snap makes the
// −math-X cardinal a 2× wider capture window than the others, accepted
// per §3.2 of the plan (closed-range slider, not wrapping).
const THETA_SNAP_POINTS: readonly number[] = [0, Math.PI / 2, Math.PI];
const PHI_SNAP_POINTS: readonly number[] = [
  -Math.PI,
  -Math.PI / 2,
  0,
  Math.PI / 2,
  Math.PI,
];

// Initial pose: off both poles AND off every snap point so the user sees
// both sliders responding immediately on first load. Matches the §3.5
// plan choice locked after the GPT #2 v1-roundtable finding.
const THETA_INITIAL = Math.PI / 3;
const PHI_INITIAL = Math.PI / 4;

// Off-axis neutral gray so the user doesn't read these as
// axis-coefficient sliders (vermillion / bluish-green / sky-blue carry
// math-X / Y / Z meaning across the cluster).
const SLIDER_BASE_COLOR = 0xaaaaaa;

// Indicator visual: small enough to read as "a point on the surface"
// rather than as a sphere of its own; large enough to remain visible
// from the user's spawn ~2.5 m away.
const INDICATOR_RADIUS = 0.04;
const INDICATOR_COLOR = 0xdddddd;

const AXIS_COLORS: Record<AxisName, number> = DEFAULT_AXIS_COLORS;

// ────────────────────────────────────────────────────────────────────
// Surface model — paired GLSL + JS so the rendered surface and the CPU
// raymarch stay in sync. Drift between the two would surface as the
// indicator tracking a different surface than the user sees rendered.
// Co-locating them here makes drift a code-review-visible event.
//
// `fImplicit(p)` is evaluated in surface-local coords — the
// `createImplicitSurface` harness pre-positions the mesh at
// `surfaceCenter` and computes `ro = cameraPosition - uSurfaceCenter`
// internally, so the consumer sees a surface centered on the origin
// even though the rendered mesh sits at `SURFACE_CENTER` in world.
// ────────────────────────────────────────────────────────────────────

const SURFACE_F_IMPLICIT_GLSL = /* glsl */ `
  float fImplicit(vec3 p) {
    return p.x * p.x + p.y * p.y + p.z * p.z - 1.0;
  }
`;
const SURFACE_GRAD_F_GLSL = /* glsl */ `
  vec3 gradF(vec3 p) {
    return 2.0 * p;
  }
`;
const fJs = (x: number, y: number, z: number): number =>
  x * x + y * y + z * z - 1;
const gradJs = (x: number, y: number, z: number): MathVec3 => [
  2 * x,
  2 * y,
  2 * z,
];

const SURFACE_UNIFORM_DECLS = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uBaseColor;
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

// Persistent scratch — allocated once at module scope, never disposed.
// `dirMath` MUST be the mutable tuple form (not `MathVec3`, which is
// `readonly [...]` — the readonly annotation would block the index
// writes inside `directionFromAngles`).
const indicatorWorld = new THREE.Vector3();
const dirMath: [number, number, number] = [0, 0, 0];

// Named handles — initialized in mount, disposed inline in unmount.
let surfaceMesh: THREE.Mesh | undefined;
let surfaceMaterial: THREE.ShaderMaterial | undefined;
let thetaSlider: Slider | undefined;
let phiSlider: Slider | undefined;
let indicator: THREE.Mesh | undefined;
let worldAxes: WorldAxes | undefined;
let controllers: readonly THREE.Object3D[] = [];
// Cached at mount; cleared at unmount. Used for the WorldAxes label
// yaw-billboarding in update().
let camera: THREE.Camera | undefined;

// ────────────────────────────────────────────────────────────────────
// Exhibit
// ────────────────────────────────────────────────────────────────────

const tangentPlanesExhibit: Exhibit = {
  id: 'tangent-planes',
  title: 'Tangent planes',
  cluster: CLUSTER_CALCULUS3,

  mount({ group, camera: cam, controllers: shellControllers }: ExhibitContext) {
    controllers = shellControllers;
    camera = cam;

    // Ambient + directional lights matching quadrics' lighting setup.
    group.add(new THREE.AmbientLight(0xffffff, 0.4));
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.copy(LIGHT_DIR).multiplyScalar(5);
    group.add(directional);

    // Implicit-surface mesh + ShaderMaterial via the shared harness.
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
      },
    });
    surfaceMesh = surfaceHandles.mesh;
    surfaceMaterial = surfaceHandles.material;
    group.add(surfaceHandles.mesh);

    // θ slider on top, φ below. Centered horizontally on the rack;
    // pitch matches quadrics' SLIDER_ROW_PITCH so the rack reads as a
    // sibling.
    const thetaY = SLIDER_RACK_CENTER.y + 0.5 * SLIDER_ROW_PITCH;
    const phiY = SLIDER_RACK_CENTER.y - 0.5 * SLIDER_ROW_PITCH;

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
      thetaY,
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
      phiY,
      SLIDER_RACK_CENTER.z,
    );
    group.add(phiSlider.group);

    // Point indicator. Positioned in update() each frame.
    indicator = new THREE.Mesh(
      new THREE.SphereGeometry(INDICATOR_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: INDICATOR_COLOR }),
    );
    group.add(indicator);

    // Math-frame axis indicator — same anchor as quadrics.
    worldAxes = new WorldAxes({ axisColors: AXIS_COLORS });
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    group.add(worldAxes.group);
  },

  update() {
    if (!thetaSlider || !phiSlider || !indicator) return;

    // Slider hover + drag tick.
    thetaSlider.updateHover(controllers);
    phiSlider.updateHover(controllers);
    thetaSlider.update();
    phiSlider.update();

    // Math-frame direction from θ/φ — mutates `dirMath` in place; no
    // per-frame allocation.
    directionFromAngles(thetaSlider.value, phiSlider.value, dirMath);

    // CPU raymarch in surface-local coords. Origin is the sphere center
    // (sphere is centered at the surface-local origin by construction).
    const result = raycastImplicit({
      f: fJs,
      gradF: gradJs,
      origin: [0, 0, 0],
      dir: dirMath,
      bound: BOUND,
    });

    if (result.hit) {
      indicator.visible = true;
      // Surface-local math-frame point → world. `writeMathToWorld` is
      // the non-allocating helper from scaffold/math/frames.ts;
      // `indicatorWorld` is the module-scope scratch.
      writeMathToWorld(result.point, indicatorWorld);
      indicator.position.copy(indicatorWorld).add(SURFACE_CENTER);
      // result.normal is unused in this PR; #148 will read it to orient
      // the tangent-plane mesh.
    } else {
      indicator.visible = false;
    }

    // Yaw-only billboard on the WorldAxes letter labels (X / Y / Z), so
    // they read at any user yaw. Same per-frame contract as quadrics.
    if (worldAxes && camera) worldAxes.faceCamera(camera);
  },

  unmount() {
    // 1. Release any active controller grabs so disposed sliders don't
    //    leak grab references back into the shell's controller objects.
    for (const c of controllers) {
      thetaSlider?.releaseFromController(c);
      phiSlider?.releaseFromController(c);
    }

    // 2. Dispose named handles — geometry + material per Three.js
    //    convention. Each resource has exactly one disposal owner; named
    //    handles are NEVER pushed into generic disposal arrays (per the
    //    quadrics #150-v4 ownership rule, mirrored here).
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
    if (thetaSlider?.tryGrab(controller)) return;
    phiSlider?.tryGrab(controller);
  },

  onSelectEnd(controller: THREE.Object3D) {
    thetaSlider?.releaseFromController(controller);
    phiSlider?.releaseFromController(controller);
  },
};

registerExhibit(tangentPlanesExhibit);

export default tangentPlanesExhibit;
