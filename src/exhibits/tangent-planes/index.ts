import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '../../shell/clusters';
import type { Pointer } from '../../shell/Pointer';
import { registerExhibit } from '../../shell/registry';
import { writeMathToWorld, type MathVec3 } from '@/scaffold/math/frames';
import { createImplicitSurface } from '@/scaffold/render/ImplicitSurface';
import { formatAnglePiFraction } from '@/scaffold/ui/formatAnglePiFraction';
import { Label } from '@/scaffold/ui/Label';
import { Slider } from '@/scaffold/ui/Slider';
import {
  GRAB_RADIUS_MULTIPLIER_PLINTH,
  SLIDER_LABEL_LINE_GAP,
  SLIDER_LABEL_PRIMARY_FONT_SIZE,
  SLIDER_LABEL_SECONDARY_FONT_SIZE,
  SLIDER_LABEL_X_OFFSET,
  SLIDER_ROW_PITCH,
  SLIDER_SNAP_DETENT,
} from '@/scaffold/ui/clusterRackTokens';
import { WorldAxes, type AxisName } from '@/scaffold/ui/WorldAxes';
import {
  BLUISH_GREEN,
  DEFAULT_AXIS_COLORS,
  SKY_BLUE,
  VERMILLION,
} from '@/scaffold/design/tokens';
import { anglesFromDirection } from '@/scaffold/math/anglesFromDirection';
import { directionFromAngles } from '@/scaffold/math/directionFromAngles';
import { raycastImplicit } from '@/scaffold/render/raycastImplicit';
import {
  composeClusterStagePose,
} from '@/scaffold/staging/clusterStagePose';
import {
  createStageFloor,
  type StageFloorHandles,
} from '@/scaffold/staging/StageFloor';
import {
  createContrastPit,
  type ContrastPitHandles,
} from '@/scaffold/staging/ContrastPit';
import {
  createStageRailing,
  type StageRailingHandles,
} from '@/scaffold/staging/StageRailing';
import {
  createStageInnerRailing,
  type StageInnerRailingHandles,
} from '@/scaffold/staging/StageInnerRailing';
import {
  createStageLighting,
  type StageLightingHandles,
} from '@/scaffold/staging/StageLighting';
import {
  createPlinth,
  type PlinthHandles,
  type PlinthSlot,
} from '@/scaffold/staging/Plinth';
import { createTangentPlane, type TangentPlaneHandles } from './TangentPlane';
import { TangentPlaneReadout } from './TangentPlaneReadout';
import {
  createReadoutPost,
  type ReadoutPostHandles,
} from '@/scaffold/ui/ReadoutPost';
import { READOUT_POST_LENGTH } from '@/scaffold/ui/readoutTokens';

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

// Cluster-shared math-object anchor so SceneRack swaps don't visually
// relocate the surface across sibling scenes.
const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);

// Plinth (#225 / E1.4 PR2). Working-surface depth default 0.5 m fits
// the 2-row slider rack at SLIDER_ROW_PITCH = 0.14 m with breathing
// room above and below. Anchor is now derived per-scene from
// `composeClusterStagePose` (#263); see `STAGE_POSE` declaration
// below (after `BOUND`). Tangent-planes' smaller envelope means the
// derived anchor is `[0, 0, -2.125]` — ~2.2 m closer to the math
// object than quadrics' cluster-uniform `0.05` placement.

// Slot-local layout (slot-local +X right, +Y up the tilted face toward
// the back, +Z out from the surface normal). Two-row rack centered on
// slot-Y = 0.275 (mid-surface for the default 0.5 m depth): θ at 0.345,
// φ at 0.205 — inter-slider distance 0.14 m, matching the pre-plinth
// `thetaY - phiY = 0.14 m` straddle (see `_private/plans/251-cluster-
// on-plinth.md` §3.1). Per-slider labels at slot-X = SLIDER_LABEL_X_
// OFFSET = -0.2. Readout floats above the working-surface back edge at
// slot-Y = 0.57 (mirrors quadrics' "readout above back edge" pattern,
// with the smaller 0.07 m offset that fits the default 0.5 m depth).
// Math-frame axis indicator at the right edge with orientation:
// 'world' so the X/Y/Z arrows read in the math frame, not the
// tabletop frame.
const PLINTH_SLIDER_TOP_Y = 0.345;
const PLINTH_READOUT_Y = 0.57;
const PLINTH_AXIS_INDICATOR_X = 0.42;
const PLINTH_AXIS_INDICATOR_Y = 0.275;

// Tighter than quadrics' BOUND=3.5: the unit sphere fits in [-1, 1]³ with
// room to spare; no coefficient-driven expansion to budget for.
const BOUND = 1.5;

// Cutout descriptor hoisted to module scope (#263) so the same
// descriptor drives both the staging mounts AND the per-scene
// `composeClusterStagePose` derivation. Tangent-planes is the only
// cluster scene with a circle cutout (#238 Path A1).
const CUTOUT_DESCRIPTOR = {
  kind: 'circle' as const,
  centerXZ: [SURFACE_CENTER.x, SURFACE_CENTER.z] as const,
  radius: BOUND,
};
// Per-scene stage pose (#263). With railing front at world Z =
// SURFACE_CENTER.z + BOUND = -2.5, the derived anchor is
// `[0, 0, -2.125]` — the plinth slides ~2.18 m toward the math
// object vs the cluster-uniform `0.05`. Pancake spawn `[0, 1.6,
// 1.525]`; VR spawn offset `[0, 0, -0.675]`.
const STAGE_POSE = composeClusterStagePose({ cutout: CUTOUT_DESCRIPTOR });
const PLINTH_ANCHOR_WORLD_XYZ = STAGE_POSE.plinthAnchorWorldXYZ;

// Same lighting + base color as quadrics so the surface reads as a sibling.
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
const BASE_COLOR = new THREE.Color(0.4, 0.7, 0.95);

// Quadrics' design feel ports across — imported from
// scaffold/ui/clusterRackTokens (#201 PR 4).

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

// Per-slider labels (#170). Anchored ~0.05 m left of each slider's
// track-end, right-aligned so the rendered text right-edge stays
// fixed at x = -0.20 regardless of value-string length, clearing the
// thumb at slider min by 0.025 m. Sizes shrunk from the v1 plan
// values to leave 0.034 m of breathing room between adjacent labels
// in the 3-row gradient-levels rack — same constants port across.
// Imported from scaffold/ui/clusterRackTokens (#201 PR 4).

// Controller-aim picking (#197). VR-only direct-manipulation affordance
// alongside the angular sliders: aim a controller at the unit sphere and
// pull the trigger to land the contact point at the ray–surface
// intersection; hold to drag. The `vr-` prefix is set by the shell when
// constructing `VRPointer`s (`shell.ts:'vr-0'/'vr-1'`); pancake mode's
// `DesktopPointer`s use `'desktop'`/`'mobile'`, so this gate short-
// circuits there and the mouse cursor remains the sole pancake affordance.
const VR_POINTER_ID_PREFIX = 'vr-';
// Haptic pulse on pick start + release — matches the Slider grab/release
// pulse values so the picking gesture reads as kin to a slider grab.
const PICK_HAPTIC_AMPLITUDE = 0.5;
const PICK_HAPTIC_DURATION_MS = 10;

// Tangent-plane size — 0.9 m × 0.9 m on the unit sphere. Reads as "a
// flat patch tangent to the surface" rather than "a sheet that swallows
// the surface." Tunable in headset; this is the v0.6 lock.
const TANGENT_PLANE_HALF_EXTENT = 0.45;

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

// Controller-aim pick scratch (#197). Reused per pick to keep the
// per-frame drag path allocation-free. `pickRayOrigin` / `pickRayDirection`
// hold the pointer's world ray; `pickOriginMath` / `pickDirMath` are the
// surface-local math-frame versions fed to `raycastImplicit`.
const pickRayOrigin = new THREE.Vector3();
const pickRayDirection = new THREE.Vector3();
const pickOriginMath: [number, number, number] = [0, 0, 0];
const pickDirMath: [number, number, number] = [0, 0, 0];

// Named handles — initialized in mount, disposed inline in unmount.
let surfaceMesh: THREE.Mesh | undefined;
let surfaceMaterial: THREE.ShaderMaterial | undefined;
let thetaSlider: Slider | undefined;
let phiSlider: Slider | undefined;
let indicator: THREE.Mesh | undefined;
let tangentPlane: TangentPlaneHandles | undefined;
let tangentPlaneReadout: TangentPlaneReadout | undefined;
let tangentPlaneReadoutPost: ReadoutPostHandles | undefined;
let thetaLabel: Label | undefined;
let phiLabel: Label | undefined;
let worldAxes: WorldAxes | undefined;
let stageFloor: StageFloorHandles | undefined;
let contrastPit: ContrastPitHandles | undefined;
let stageRailing: StageRailingHandles | undefined;
let stageInnerRailing: StageInnerRailingHandles | undefined;
let stageLighting: StageLightingHandles | undefined;
let plinth: PlinthHandles | undefined;
let pointers: readonly Pointer[] = [];
// Cached at mount; cleared at unmount. Used for the WorldAxes label
// yaw-billboarding in update().
let camera: THREE.Camera | undefined;
// VR pointer currently aim-picking on the surface (#197). Set in
// `onSelectStart` when sphere-aim lands, cleared in `onSelectEnd`. Used
// in `update()` to refresh the picked (θ, φ) each frame while the
// trigger is held — so picking reads as a continuous drag, not a tap.
let pickingPointer: Pointer | null = null;

// Controller-aim pick (#197). Read `pointer`'s world ray, transform to
// surface-local math frame, raycast against the same implicit surface the
// sliders drive (so picking + slider-driven paint stay rigorously in
// sync), convert the hit direction to (θ, φ), and drive the sliders via
// `setValue` — which applies the standard snap detents so picking near
// θ = π/2 lands on the equator exactly the way a slider drag would.
//
// Returns whether a hit landed. The caller uses it as the "did picking
// engage" signal: `onSelectStart` only sets `pickingPointer` on a hit;
// `update()` ignores miss frames so a controller grazing off the sphere
// mid-drag freezes the indicator at the last picked pose rather than
// snapping back to slider defaults.
function applyControllerAimPick(pointer: Pointer): boolean {
  if (!thetaSlider || !phiSlider) return false;
  pointer.getRayOrigin(pickRayOrigin);
  pointer.getRayDirection(pickRayDirection);

  // World → surface-local world: subtract surface center (points only;
  // direction vectors are pure rotations, no offset). Then world → math
  // frame: math (x, y, z) = world (x, −z, y) per `scaffold/math/frames.ts`.
  const lx = pickRayOrigin.x - SURFACE_CENTER.x;
  const ly = pickRayOrigin.y - SURFACE_CENTER.y;
  const lz = pickRayOrigin.z - SURFACE_CENTER.z;
  pickOriginMath[0] = lx;
  pickOriginMath[1] = -lz;
  pickOriginMath[2] = ly;
  pickDirMath[0] = pickRayDirection.x;
  pickDirMath[1] = -pickRayDirection.z;
  pickDirMath[2] = pickRayDirection.y;

  const result = raycastImplicit({
    f: fJs,
    gradF: gradJs,
    origin: pickOriginMath,
    dir: pickDirMath,
    bound: BOUND,
  });
  if (!result.hit) return false;

  // For the unit sphere `|p| = 1` so `result.point` is already the unit
  // direction (modulo numerics — `anglesFromDirection` clamps `dir.z`
  // before `acos`). v0.7+ surfaces would normalize here.
  const { theta, phi } = anglesFromDirection(result.point);
  // Yield to a concurrent slider drag by the *other* controller:
  // `Slider.setValue` rebases `lastPointerAxisX` against the picking
  // pointer's ray, which would compound the drag's delta from a point
  // the user never set. Skipping the write on a grabbed slider lets a
  // user hold the contact point with one hand and fine-tune θ or φ
  // independently with the other — the pedagogical case the SPEC
  // promises. The skipped slider's value is whatever the drag is
  // producing this tick; picking resumes driving it the frame after
  // the user releases.
  if (!thetaSlider.isGrabbed) thetaSlider.setValue(theta);
  if (!phiSlider.isGrabbed) phiSlider.setValue(phi);
  return true;
}

// ────────────────────────────────────────────────────────────────────
// Exhibit
// ────────────────────────────────────────────────────────────────────

const tangentPlanesExhibit: Exhibit = {
  id: 'tangent-planes',
  title: 'Tangent planes',
  cluster: CLUSTER_CALCULUS3,
  stage: {
    pancakeSpawnWorldXYZ: STAGE_POSE.pancakeSpawnWorldXYZ,
    vrSpawnOffsetWorldXYZ: STAGE_POSE.vrSpawnOffsetWorldXYZ,
    rackAnchorWorldXYZ: STAGE_POSE.plinthAnchorWorldXYZ,
  },

  mount({ group, camera: cam, pointers: shellPointers }: ExhibitContext) {
    pointers = shellPointers;
    camera = cam;

    stageLighting = createStageLighting({ direction: LIGHT_DIR });
    group.add(stageLighting.group);

    // Stage floor with circular cutout (#238 / E1.1). Per-scene
    // outerHalfExtent: 6 (12 × 12 m floor) so the BOUND-radius disk fits
    // strictly interior with 0.5 m margin (|cz|+r = 5.5 < 6). See
    // `_private/plans/238-cluster-cutout.md` §3.3 for the Path A1
    // rationale (roundtable-converged on cluster-rule uniformity
    // over cluster-footprint uniformity).
    // TP is the only cluster scene without a v3 back-extension — its
    // sphere envelope is strictly inside the railing perimeter already
    // (plan §3.5). The per-scene `outerHalfExtent: 6` (vs cluster
    // default 5) remains the per-scene variation under Path A1.
    // Module-scope `CUTOUT_DESCRIPTOR` (#263) — same value drives
    // both staging mounts and `STAGE_POSE` derivation.
    const cutoutDescriptor = CUTOUT_DESCRIPTOR;
    stageFloor = createStageFloor({
      cutout: cutoutDescriptor,
      outerHalfExtent: 6,
    });
    group.add(stageFloor.group);

    // Sub-floor vantablack contrast pit (#224 / E1.3, PR #245 smoke
    // iter 5). Sized to the SAME cutout as the floor → exactly under
    // the hole, contained wherever the cutout is. Exhibit-owned.
    contrastPit = createContrastPit({ cutout: cutoutDescriptor });
    group.add(contrastPit.group);

    // Outer stage railing (#223 / E1.2). 12 × 12 m perimeter via the
    // per-scene outerHalfExtent: 6.
    stageRailing = createStageRailing({
      outerHalfExtent: stageFloor.outerHalfExtent,
      backExtension: stageFloor.backExtension,
    });
    group.add(stageRailing.group);

    // Inner stage railing (#223 v3). Circle path: 8 posts around the
    // sphere's domain circle (radius BOUND = 1.5) + 1 torus top-rail.
    stageInnerRailing = createStageInnerRailing({ cutout: cutoutDescriptor });
    group.add(stageInnerRailing.group);

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

    // θ slider on top, φ below. Slot-Y positions set via the slot
    // manifest at the end of this function — createPlinth reparents
    // each slider's group under plinth.group, so we construct without
    // positions and without adding to ctx.group here.
    thetaSlider = new Slider({
      label: 'θ',
      min: 0,
      max: Math.PI,
      initial: THETA_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: THETA_SNAP_POINTS,
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER_PLINTH,
      baseColor: SLIDER_BASE_COLOR,
      thumbLabel: 'θ',
    });

    phiSlider = new Slider({
      label: 'φ',
      min: -Math.PI,
      max: Math.PI,
      initial: PHI_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: PHI_SNAP_POINTS,
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER_PLINTH,
      baseColor: SLIDER_BASE_COLOR,
      thumbLabel: 'φ',
    });

    // Per-slider variable + value labels (#170). Right-anchored so
    // worst-case secondary text "−0.80π" stays clear of the slider
    // thumb at slider min.
    thetaLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    thetaLabel.setPrimary('θ');

    phiLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    phiLabel.setPrimary('φ');

    // Point indicator. Math-object affordance — stays a child of
    // ctx.group at world frame, positioned in update() each frame.
    // Not slotted: the indicator is the rendered location of the
    // selected point ON the math surface, not a UI control.
    indicator = new THREE.Mesh(
      new THREE.SphereGeometry(INDICATOR_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: INDICATOR_COLOR }),
    );
    group.add(indicator);

    // Tangent-plane mesh — math-object affordance, same lifetime as
    // surface mesh. Stays world-anchored at SURFACE_CENTER (not
    // slotted). Constructed with `group.visible = false` so the
    // renderer can't paint a stale construction-time pose between
    // mount and the first update tick.
    tangentPlane = createTangentPlane({
      surfaceCenter: SURFACE_CENTER,
      halfExtent: TANGENT_PLANE_HALF_EXTENT,
    });
    group.add(tangentPlane.group);

    // Live readout of the plane equation + normal (#149). Slotted on
    // the plinth at slot-Y = PLINTH_READOUT_Y. EquationReadout-style
    // billboard carve-out: faceCamera overwrites group.rotation every
    // frame, so the slot's default 'surface' orientation is
    // documentation-only — the readout yaw-billboards regardless.
    tangentPlaneReadout = new TangentPlaneReadout({
      axisColors: [VERMILLION, BLUISH_GREEN, SKY_BLUE],
    });

    // Post-mount stem (#286). See quadrics for the architecture note.
    tangentPlaneReadoutPost = createReadoutPost();

    // Math-frame axis indicator. orientation: 'world' so the X/Y/Z
    // arrows read in the math frame, not the tabletop frame —
    // WorldAxes' faceCamera rotates only its child letter-Text nodes,
    // so the world-aligned slot survives across frames.
    worldAxes = new WorldAxes({ axisColors: AXIS_COLORS });

    // Slot manifest (#225 / E1.4 PR2). createPlinth reparents each
    // target under plinth.group at construction. Ids are required +
    // uniqueness-validated by the plinth.
    const slots: PlinthSlot[] = [
      {
        id: 'slider-theta',
        target: thetaSlider.group,
        localXYZ: [0, PLINTH_SLIDER_TOP_Y, 0],
      },
      {
        id: 'slider-phi',
        target: phiSlider.group,
        localXYZ: [0, PLINTH_SLIDER_TOP_Y - SLIDER_ROW_PITCH, 0],
      },
      // Per-slider value labels: 1 mm slot-Z standoff resolves
      // coplanar z-fighting against the slab top face. Mirrors
      // `SectionTab`'s `SURFACE_LABEL_STANDOFF_M` (`TapButton.ts:104–118`).
      {
        id: 'label-theta',
        target: thetaLabel.group,
        localXYZ: [SLIDER_LABEL_X_OFFSET, PLINTH_SLIDER_TOP_Y, 0.001],
      },
      {
        id: 'label-phi',
        target: phiLabel.group,
        localXYZ: [SLIDER_LABEL_X_OFFSET, PLINTH_SLIDER_TOP_Y - SLIDER_ROW_PITCH, 0.001],
      },
      {
        id: 'readout',
        target: tangentPlaneReadout.group,
        localXYZ: [0, PLINTH_READOUT_Y, READOUT_POST_LENGTH],
      },
      {
        id: 'readout-post',
        target: tangentPlaneReadoutPost.group,
        localXYZ: [0, PLINTH_READOUT_Y, 0],
        orientation: 'surface',
      },
      {
        id: 'world-axes',
        target: worldAxes.group,
        localXYZ: [PLINTH_AXIS_INDICATOR_X, PLINTH_AXIS_INDICATOR_Y, 0],
        orientation: 'world',
      },
    ];
    plinth = createPlinth({
      anchorWorldXYZ: PLINTH_ANCHOR_WORLD_XYZ,
      slots,
    });
    group.add(plinth.group);
  },

  update() {
    // Labels are accessory (#170) — handled by per-call guards below;
    // not gated here so a missing label never blocks slider/raycast updates.
    if (!thetaSlider || !phiSlider || !indicator || !tangentPlane) return;

    // Slider hover + drag tick.
    thetaSlider.updateHover(pointers);
    phiSlider.updateHover(pointers);
    thetaSlider.update();
    phiSlider.update();

    // Controller-aim picking refresh (#197). Re-raycast each frame while
    // the trigger is held so picking reads as a continuous drag rather
    // than a single tap. Runs after the slider tick so a picked
    // (θ, φ) overrides any slider-drag delta from a different pointer
    // on the same frame — the user's most direct gesture wins.
    // On miss (controller drifted off the sphere mid-drag) we keep the
    // last picked pose rather than reverting to slider defaults; the
    // SPEC.md "Indicator hidden on raymarch miss" path still applies to
    // the rendered indicator if the slider-driven raymarch below misses.
    if (pickingPointer) applyControllerAimPick(pickingPointer);

    // Per-slider value labels (#170). `formatAnglePiFraction` is
    // snap-aware: with PHI_INITIAL = π/4 and PHI_SNAP_POINTS not
    // including π/4, the boot pose renders as "0.25π" not the false-snap
    // "π/4" glyph. Labels are surface-locked via the plinth slot's
    // default `'surface'` orientation (#280) — no per-frame
    // `faceCamera`; the slot's `R_x(−tilt)` rotation written at
    // construction holds, and slot z-standoff resolves coplanar
    // z-fighting against the slab (mirrors `SectionTab`'s
    // `SURFACE_LABEL_STANDOFF_M`, `TapButton.ts:104–118`).
    if (thetaLabel) {
      thetaLabel.setSecondary(
        formatAnglePiFraction(thetaSlider.value, THETA_SNAP_POINTS),
      );
    }
    if (phiLabel) {
      phiLabel.setSecondary(
        formatAnglePiFraction(phiSlider.value, PHI_SNAP_POINTS),
      );
    }

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

      // Pose first, then uncloak — so the first paint after a mount or
      // a miss→hit transition lands at the correct pose, not the stale
      // construction-time identity.
      tangentPlane.setPose(result.point, result.normal);
      tangentPlane.setVisible(true);

      // Readout consumes raw surface-local point + normal; the §11.4
      // expanded form is in math coordinates, no frame swap needed.
      tangentPlaneReadout?.setValues(result.point, result.normal);
    } else {
      indicator.visible = false;
      tangentPlane.setVisible(false);
      // Freeze the readout on its last value during a miss frame —
      // blanking would flicker on grazing rays (when v0.7+ surfaces
      // bring real misses); for v0.6's unit sphere this branch never
      // fires.
    }

    // Yaw-only billboard on the WorldAxes letter labels (X / Y / Z), so
    // they read at any user yaw. Same per-frame contract as quadrics.
    if (worldAxes && camera) worldAxes.faceCamera(camera);
    if (tangentPlaneReadout && camera) tangentPlaneReadout.faceCamera(camera);
  },

  unmount() {
    // 1. Release any active pointer grabs so disposed sliders don't
    //    leak grab references back into the shell's pointer instances.
    for (const p of pointers) {
      thetaSlider?.releaseFromPointer(p);
      phiSlider?.releaseFromPointer(p);
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
    tangentPlane?.dispose();
    tangentPlane = undefined;
    tangentPlaneReadout?.dispose();
    tangentPlaneReadout = undefined;
    tangentPlaneReadoutPost?.dispose();
    tangentPlaneReadoutPost = undefined;
    thetaLabel?.dispose();
    thetaLabel = undefined;
    phiLabel?.dispose();
    phiLabel = undefined;
    thetaSlider?.dispose();
    thetaSlider = undefined;
    phiSlider?.dispose();
    phiSlider = undefined;
    worldAxes?.dispose();
    worldAxes = undefined;
    if (stageFloor) {
      stageFloor.dispose();
      stageFloor = undefined;
    }
    if (contrastPit) {
      contrastPit.dispose();
      contrastPit = undefined;
    }
    if (stageRailing) {
      stageRailing.dispose();
      stageRailing = undefined;
    }
    if (stageInnerRailing) {
      stageInnerRailing.dispose();
      stageInnerRailing = undefined;
    }
    if (stageLighting) {
      stageLighting.dispose();
      stageLighting = undefined;
    }
    if (plinth) {
      plinth.dispose();
      plinth = undefined;
    }

    // 3. Drop external references so a re-mount starts clean. The shell
    //    removes ctx.group and its descendants automatically. Clear the
    //    aim-picking handle alongside — the released pointers in step 1
    //    don't include it (picking doesn't go through Slider's grab table).
    pointers = [];
    camera = undefined;
    pickingPointer = null;
  },

  onSelectStart(pointer: Pointer): boolean {
    if (thetaSlider?.tryGrab(pointer)) return true;
    if (phiSlider?.tryGrab(pointer)) return true;

    // Controller-aim picking (#197). VR-only — pancake mode keeps the
    // mouse cursor as its sole affordance per SPEC.md, and the
    // `DesktopPointer.id` ('desktop' / 'mobile') doesn't carry the
    // `vr-` prefix the shell stamps on VR controllers. Picking is
    // additive: only reached when neither slider thumb grabbed the
    // trigger pull, so sliders remain the universal input.
    if (!pointer.id.startsWith(VR_POINTER_ID_PREFIX)) return false;
    // First-trigger-wins. `pickingPointer` is a single slot; a second
    // controller's trigger pulled mid-pick would otherwise overwrite
    // it, leaving the original controller's `onSelectEnd` unable to
    // release picking (the identity check would fail). Same semantics
    // as `Slider.tryGrab`'s `if (this.grabbedBy) return false` —
    // returns `false` here so the rack / fallthrough sees the gesture
    // as unclaimed for that controller.
    if (pickingPointer !== null) return false;
    if (!applyControllerAimPick(pointer)) return false;
    pickingPointer = pointer;
    pointer.pulse(PICK_HAPTIC_AMPLITUDE, PICK_HAPTIC_DURATION_MS);
    return true;
  },

  onSelectEnd(pointer: Pointer) {
    thetaSlider?.releaseFromPointer(pointer);
    phiSlider?.releaseFromPointer(pointer);
    if (pickingPointer === pointer) {
      pickingPointer = null;
      pointer.pulse(PICK_HAPTIC_AMPLITUDE, PICK_HAPTIC_DURATION_MS);
    }
  },
};

registerExhibit(tangentPlanesExhibit);

export default tangentPlanesExhibit;
