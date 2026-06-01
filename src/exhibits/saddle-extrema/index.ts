import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '../../shell/clusters';
import type { Pointer } from '../../shell/Pointer';
import { registerExhibit } from '../../shell/registry';
import {
  BLUISH_GREEN,
  DEFAULT_AXIS_COLORS,
  VERMILLION,
  YELLOW,
} from '@/scaffold/design/tokens';
import { Label } from '@/scaffold/ui/Label';
import { Slider } from '@/scaffold/ui/Slider';
import { Preset } from '@/scaffold/ui/Preset';
import {
  GRAB_RADIUS_MULTIPLIER_PLINTH,
  SLIDER_LABEL_LINE_GAP,
  SLIDER_LABEL_PRIMARY_FONT_SIZE,
  SLIDER_LABEL_SECONDARY_FONT_SIZE,
  SLIDER_LABEL_X_OFFSET,
  SLIDER_SNAP_DETENT,
} from '@/scaffold/ui/clusterRackTokens';
import { WorldAxes } from '@/scaffold/ui/WorldAxes';
import {
  createStageFloor,
  type StageFloorHandles,
} from '@/scaffold/staging/StageFloor';
import { composeClusterStagePose } from '@/scaffold/staging/clusterStagePose';
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
import {
  createCriticalPointMarkers,
  type CriticalPointMarkersHandles,
} from './CriticalPointMarkers';
import {
  createGraphSurface,
  writeGraphPointToWorld,
  type GraphSurfaceHandles,
} from './GraphSurface';
import { DEFAULT_PRESET_INDEX, PRESETS } from './presets';
import { SaddleExtremaReadout } from './SaddleExtremaReadout';
import {
  createReadoutPost,
  type ReadoutPostHandles,
} from '@/scaffold/ui/ReadoutPost';
import { READOUT_POST_LENGTH } from '@/scaffold/ui/readoutTokens';
import { buildAxisSnapPoints } from './snap-points';
import {
  createTaylorOverlay,
  type TaylorOverlayHandles,
} from './TaylorOverlay';

// Saddle / extrema scene (#175 epic). Fourth and final member of the
// calculus3 cluster, alongside quadrics, tangent-planes, and gradient-levels.
//
// Pedagogy target: APPM 2350 §11.7–11.8 (Maximum/Minimum Values + Second
// Derivatives Test). Stuck-point: students mechanically compute D =
// f_xx·f_yy − f_xy² without seeing that they're asking "what does this
// surface look like in a small neighborhood?" The quadratic-overlay
// punch line lands in #180; #178 ships the curated preset library
// (paraboloid / inv-paraboloid / saddle / monkey saddle / x⁴+y⁴) so the
// student steps through each archetype deliberately rather than
// encountering them mixed in one surface.
//
// Architectural divergence from the prior three cluster scenes: those
// render an implicit surface via the GPU raymarcher. Saddle-extrema
// renders a graph form z = f(x, y) — a meshed BufferGeometry, not a
// raymarched bounding cube. See GraphSurface.ts for the primitive.

// ────────────────────────────────────────────────────────────────────
// Constants — cluster-shared anchors carry verbatim from siblings so
// SceneRack swaps don't visually relocate the surface.
// ────────────────────────────────────────────────────────────────────

const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
const BASE_COLOR = new THREE.Color(0.4, 0.7, 0.95);

// Plinth (#225 / E1.4 PR2). Working-surface depth default 0.5 m fits
// the 2-row slider rack with breathing room; the 5-preset row and
// 3-line readout deliberately float above the back edge (slot-Y >
// 0.5), mirroring quadrics' preset-grid + classifier pattern.
// Anchor is derived per-scene from `composeClusterStagePose` (#263);
// see `STAGE_POSE` declaration below (after `STAGE_CUTOUT_HALF`).
// Saddle-extrema's preset-driven envelope (`STAGE_CUTOUT_HALF ×
// CUTOUT_VISUAL_MARGIN ≈ 1.575`) makes the derived anchor `[0, 0,
// -2.05]` — ~2.1 m closer to the math object than the pre-#263
// cluster-uniform `0.05`.

// Slot-local layout. Two-row slider rack centered on slot-Y = 0.275:
// x at 0.345, y at 0.205 — inter-slider distance 0.14 m, matching the
// pre-plinth `X_SLIDER_Y - Y_SLIDER_Y = 0.14 m` straddle (see
// `_private/plans/251-cluster-on-plinth.md` §3.3). Per-slider labels
// at slot-X = SLIDER_LABEL_X_OFFSET = -0.2. Preset row of 5 buttons
// centered on slot-X = 0 at slot-Y = 0.55 (just above the back edge):
// columns at slot-X ∈ {-0.26, -0.13, 0, 0.13, 0.26} with cluster
// pitch 0.13 (mirrors quadrics' 2 × 4 grid pattern, simplified to
// one row). Readout above the presets at slot-Y = 0.70 — mirrors
// quadrics' PLINTH_RACK_LABEL_Y = 0.74 row-above-content pattern.
// Math-frame axis indicator at the right edge with orientation:
// 'world'.
const PLINTH_X_SLIDER_Y = 0.345;
const PLINTH_Y_SLIDER_Y = 0.205;
const PLINTH_PRESET_ROW_Y = 0.55;
const PLINTH_PRESET_COL_PITCH = 0.13;
// 5 columns centered on slot-X = 0 ⇒ leftmost col at -2 × pitch.
const PLINTH_PRESET_ROW_START_X = -2 * PLINTH_PRESET_COL_PITCH;
const PLINTH_READOUT_Y = 0.70;
const PLINTH_AXIS_INDICATOR_X = 0.42;
const PLINTH_AXIS_INDICATOR_Y = 0.275;

// Stage floor cutout half-extent (#238 / E1.1) — derived from the
// widest preset domain so a future preset with a wider (x, y) window
// automatically widens the cutout at mount. Today's value evaluates
// to 1.5 (driven by the `saddle` preset at ±1.5 in `presets.ts:84`).
const STAGE_CUTOUT_HALF = Math.max(
  ...PRESETS.map((p) =>
    Math.max(
      Math.abs(p.domain.xMin),
      p.domain.xMax,
      Math.abs(p.domain.yMin),
      p.domain.yMax,
    ),
  ),
);

// CUTOUT_VISUAL_MARGIN: 1.05× outward expansion of the cutout (and
// inner railing) so the rendered surface — especially the `saddle`
// preset which reaches the full ±STAGE_CUTOUT_HALF domain — has a
// small annular breathing margin between math and railing. PR #244
// follow-up smoke. Hoisted to module scope (#263) so the same
// descriptor drives both staging mounts AND `STAGE_POSE` derivation.
const CUTOUT_VISUAL_MARGIN = 1.05;
const CUTOUT_DESCRIPTOR = {
  kind: 'rect' as const,
  centerXZ: [SURFACE_CENTER.x, SURFACE_CENTER.z] as const,
  halfExtentX: STAGE_CUTOUT_HALF * CUTOUT_VISUAL_MARGIN,
  halfExtentZ: STAGE_CUTOUT_HALF * CUTOUT_VISUAL_MARGIN,
};
const STAGE_POSE = composeClusterStagePose({ cutout: CUTOUT_DESCRIPTOR });
const PLINTH_ANCHOR_WORLD_XYZ = STAGE_POSE.plinthAnchorWorldXYZ;

// Slider rack — two-row symmetric straddle. Slot-Y values applied via
// the slot manifest in mount(); per-slider plinth-Y derivations above
// (`PLINTH_X_SLIDER_Y` / `PLINTH_Y_SLIDER_Y`).
//
// SLIDER_SNAP_DETENT / GRAB_RADIUS_MULTIPLIER_PLINTH / SLIDER_ROW_PITCH
// imported from scaffold/ui/clusterRackTokens. Snap detents combine
// the slider-canonical origin with the active preset's critical-point
// coordinates, projected per axis (#200). For every v0.8 preset the
// CPs sit at the origin, so the projected snap set collapses to `[0]`
// and visible behavior is unchanged from v0.7; future off-origin
// presets get correct CP-aware snaps for free.

// Initial pose — off origin-snap, off endpoints, off both axes,
// non-equal — so first-frame drag responds in any direction.
const X_INITIAL = 0.5;
const Y_INITIAL = 0.3;

// Per-slider variable + value label layout — verbatim from gradient-levels'
// #170 layout. Right-anchored so worst-case secondary text "−1.50" stays
// clear of the slider thumb at any value. Imported from
// scaffold/ui/clusterRackTokens (#201 PR 4).

// Indicator — verbatim port from cluster siblings for visual consistency.
const INDICATOR_RADIUS = 0.04;
const INDICATOR_COLOR = 0xdddddd;

// Cluster glyph convention for negative-magnitude formatting.
const SLIDER_VALUE_MINUS = '−'; // U+2212

// Preset row (#178). Five buttons in a single horizontal row above
// the slider rack, centered on slot-X = 0. Always-visible — five
// archetypes is small enough to live on screen at all times (the
// quadrics manipulator's 8-preset rack needed an expand/collapse
// chevron; here that machinery would be friction without payoff).
// Slot positions applied via the slot manifest in mount(); column
// pitch and start derivations above (`PLINTH_PRESET_COL_PITCH`,
// `PLINTH_PRESET_ROW_START_X`, `PLINTH_PRESET_ROW_Y`).
const PRESET_RES = 128;

// Mirror the manipulator's `Preset` visual identity (cool blue base,
// label below the button) plus a sticky-active emissive — saddle-extrema's
// preset is a persistent mode (the surface IS the preset's f), where the
// manipulator's preset is a one-shot snap-to-pose. Sticky-active reads as
// "this is the current archetype"; press flash layers on top as tap
// feedback. After #201 PR 6 this scene uses Preset with the optional
// `activeEmissive` field rather than constructing a raw TapButton with
// its own visuals constant; the shared Preset class owns the cool-blue
// identity, this scene only overrides the active emissive color.
const PRESET_ACTIVE_EMISSIVE = 0x66ccdd;

// Local linear-decimal formatter for the per-slider value labels.
// Identical in shape to gradient-levels' local helper (#170 history);
// this scene becomes consumer #2 — extract-on-third-use rule honored, so
// kept local rather than extracted to scaffold/ui.
function formatLinearDecimal(v: number): string {
  if (v < 0) return `${SLIDER_VALUE_MINUS}${Math.abs(v).toFixed(2)}`;
  return v.toFixed(2);
}

// ────────────────────────────────────────────────────────────────────
// Module-scoped state — named handles initialized in mount, disposed
// inline in unmount. `exhibitGroup` is captured at mount so applyPreset
// (called from onSelectStart) can swap the graphSurface mesh in/out.
// ────────────────────────────────────────────────────────────────────

let exhibitGroup: THREE.Group | undefined;
let graphSurface: GraphSurfaceHandles | undefined;
let criticalPointMarkers: CriticalPointMarkersHandles | undefined;
let taylorOverlay: TaylorOverlayHandles | undefined;
let worldAxes: WorldAxes | undefined;
let xSlider: Slider | undefined;
let ySlider: Slider | undefined;
let xLabel: Label | undefined;
let yLabel: Label | undefined;
let indicator: THREE.Mesh | undefined;
let presetButtons: Preset[] = [];
let stageFloor: StageFloorHandles | undefined;
let contrastPit: ContrastPitHandles | undefined;
let stageRailing: StageRailingHandles | undefined;
let stageInnerRailing: StageInnerRailingHandles | undefined;
let stageLighting: StageLightingHandles | undefined;
let plinth: PlinthHandles | undefined;
let activePresetIndex = DEFAULT_PRESET_INDEX;
let saddleExtremaReadout: SaddleExtremaReadout | undefined;
let saddleExtremaReadoutPost: ReadoutPostHandles | undefined;
let camera: THREE.Camera | undefined;
let pointers: readonly Pointer[] = [];

// Persistent scratch — allocated once at module scope, mutated each
// frame in update(). One per-frame allocation hot path #177 introduces
// is the indicator-position write; this scratch keeps it allocation-free.
const indicatorWorld = new THREE.Vector3();

// ────────────────────────────────────────────────────────────────────
// Exhibit
// ────────────────────────────────────────────────────────────────────

const saddleExtremaExhibit: Exhibit = {
  id: 'saddle-extrema',
  title: 'Critical points',
  cluster: CLUSTER_CALCULUS3,
  stage: {
    pancakeSpawnWorldXYZ: STAGE_POSE.pancakeSpawnWorldXYZ,
    vrSpawnOffsetWorldXYZ: STAGE_POSE.vrSpawnOffsetWorldXYZ,
    rackAnchorWorldXYZ: STAGE_POSE.plinthAnchorWorldXYZ,
  },

  mount({ group, camera: cam, pointers: shellPointers }: ExhibitContext) {
    exhibitGroup = group;
    camera = cam;
    pointers = shellPointers;
    activePresetIndex = DEFAULT_PRESET_INDEX;
    const initialPreset = PRESETS[activePresetIndex];

    // The graph surface uses a custom ShaderMaterial reproducing the
    // cluster's lambert formula; the DirectionalLight here is
    // decorative for the surface (ShaderMaterial doesn't auto-bind
    // scene lights) but lights accessory geometry (indicator).
    stageLighting = createStageLighting({ direction: LIGHT_DIR });
    group.add(stageLighting.group);

    // Stage floor with rect cutout (#238 / E1.1), sized to the widest
    // preset domain (`STAGE_CUTOUT_HALF` derived from PRESETS — see
    // module-scope comment). Cutout reaches world Z = -5.5, just past
    // the cluster-default floor's −Z edge at -5; strip clamp truncates
    // to the floor edge. Static at mount — does not resize on preset
    // change. See `_private/plans/238-cluster-cutout.md` §3.4 for the
    // Path A1 rationale.
    // backExtension: 3 (v3 — PR #244 smoke feedback). Cluster-uniform
    // value matches quadrics + gradient-levels; the widest preset
    // (`saddle` at ±1.5) reaches z = -5.5, so 2.5 m margin to the
    // extended back at z = -8. See plan §3.5.
    //
    // Module-scope `CUTOUT_DESCRIPTOR` (#263) — same value drives
    // both staging mounts and `STAGE_POSE` derivation.
    const cutoutDescriptor = CUTOUT_DESCRIPTOR;
    stageFloor = createStageFloor({
      cutout: cutoutDescriptor,
      backExtension: 3,
    });
    group.add(stageFloor.group);

    // Sub-floor vantablack contrast pit (#224 / E1.3, PR #245 smoke
    // iter 5). Sized to the SAME cutout as the floor → exactly under
    // the hole, contained wherever the cutout is. Exhibit-owned.
    contrastPit = createContrastPit({ cutout: cutoutDescriptor });
    group.add(contrastPit.group);

    stageRailing = createStageRailing({
      outerHalfExtent: stageFloor.outerHalfExtent,
      backExtension: stageFloor.backExtension,
    });
    group.add(stageRailing.group);

    // Inner stage railing (#223 v3). Rect path; perimeter follows the
    // widest-preset cutout footprint at ±STAGE_CUTOUT_HALF.
    stageInnerRailing = createStageInnerRailing({ cutout: cutoutDescriptor });
    group.add(stageInnerRailing.group);

    graphSurface = createGraphSurface({
      f: initialPreset.f,
      gradF: initialPreset.gradF,
      domain: initialPreset.domain,
      res: initialPreset.res ?? PRESET_RES,
      surfaceCenter: SURFACE_CENTER,
      baseColor: BASE_COLOR.clone(),
      lightDir: LIGHT_DIR.clone(),
    });
    group.add(graphSurface.mesh);

    // Critical-point markers (#179). Built once per preset and replaced
    // whole-cloth on preset swap (mirrors the graphSurface lifecycle).
    // For every v0.8 preset this is a single sphere at the origin; the
    // helper accepts the analytic list so future off-origin / multi-CP
    // presets drop in without a wiring change.
    criticalPointMarkers = createCriticalPointMarkers({
      preset: initialPreset,
      surfaceCenter: SURFACE_CENTER,
    });
    group.add(criticalPointMarkers.group);

    // Local-quadratic-approximation overlay (#180; the §11.7–11.8
    // pedagogical punch line). Sits on top of the main surface,
    // translucent body + brighter rim, mutates positions + normals
    // every frame from the per-frame (x, y) and the active preset's
    // (f, gradF, hessF). polygonOffset shipped day-one — the
    // exact-quadratic presets coincide with the main surface across
    // the entire patch, not just at the center vertex.
    taylorOverlay = createTaylorOverlay({
      preset: initialPreset,
      surfaceCenter: SURFACE_CENTER,
      lightDir: LIGHT_DIR.clone(),
    });
    // Seed the overlay's pose to the initial slider values so the
    // first paint isn't a stale zero pose (overlay constructor seeds
    // at (0, 0); the indicator boots at (X_INITIAL, Y_INITIAL)).
    taylorOverlay.setPose(X_INITIAL, Y_INITIAL);
    group.add(taylorOverlay.mesh);

    // x slider — vermillion (math-X axis tint). Honest pickup since
    // x IS the math-X axis value, not a derived parameter. Mirrors
    // the quadrics manipulator's (a, b, c) coefficient-slider color
    // convention. Slot positions applied via the slot manifest at the
    // end of this function.
    xSlider = new Slider({
      label: 'x',
      min: initialPreset.domain.xMin,
      max: initialPreset.domain.xMax,
      initial: X_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: buildAxisSnapPoints(initialPreset.criticalPoints, 0),
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER_PLINTH,
      baseColor: VERMILLION,
      thumbLabel: 'x',
    });

    // y slider — bluish-green (math-Y axis tint).
    ySlider = new Slider({
      label: 'y',
      min: initialPreset.domain.yMin,
      max: initialPreset.domain.yMax,
      initial: Y_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: buildAxisSnapPoints(initialPreset.criticalPoints, 1),
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER_PLINTH,
      baseColor: BLUISH_GREEN,
      thumbLabel: 'y',
    });

    // Per-slider labels — primary = variable name (set once at mount),
    // secondary = live value (per-frame in update()).
    xLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    xLabel.setPrimary('x');

    yLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    yLabel.setPrimary('y');

    // Indicator — sphere at the selected point. Math-object affordance:
    // stays world-anchored at SURFACE_CENTER (via writeGraphPointToWorld),
    // NOT slotted on the plinth. Position seeded at the boot pose so
    // the first paint shows the correct location even before update()
    // runs.
    indicator = new THREE.Mesh(
      new THREE.SphereGeometry(INDICATOR_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: INDICATOR_COLOR }),
    );
    writeGraphPointToWorld(
      X_INITIAL,
      Y_INITIAL,
      initialPreset.f(X_INITIAL, Y_INITIAL),
      SURFACE_CENTER,
      indicatorWorld,
    );
    indicator.position.copy(indicatorWorld);
    group.add(indicator);

    // Math-frame axis indicator. orientation: 'world' so the X/Y/Z
    // arrows read in the math frame, not the tabletop frame.
    worldAxes = new WorldAxes({ axisColors: DEFAULT_AXIS_COLORS });

    // Classification readout (#181). f_xx and f_yy tinted with the
    // cluster's math-X / math-Y axis colors (vermillion / bluish-green);
    // cross-term f_xy stays white. D and verdict use YELLOW — the same
    // accent gradient-levels (#166) uses for the |∇f| numeric. Boots
    // hidden; the first update() tick populates the slots and uncloaks.
    // Billboard carve-out: faceCamera overwrites group.rotation every
    // frame, so the slot's default 'surface' orientation is
    // documentation-only.
    saddleExtremaReadout = new SaddleExtremaReadout({
      fxxColor: VERMILLION,
      fxyColor: 0xffffff,
      fyyColor: BLUISH_GREEN,
      accentColor: YELLOW,
    });

    // Post-mount stem (#286). See quadrics for the architecture note.
    saddleExtremaReadoutPost = createReadoutPost();

    // Preset row (#178) — five archetypes left → right, mirroring the
    // PRESETS array order. The starter (saddle, DEFAULT_PRESET_INDEX)
    // is marked sticky-active so the user reads which archetype is
    // current. Slot positions applied via the manifest below.
    presetButtons = PRESETS.map((preset) => {
      return new Preset({
        name: preset.label,
        grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER_PLINTH,
        activeEmissive: PRESET_ACTIVE_EMISSIVE,
      });
    });
    presetButtons[activePresetIndex]?.setActive(true);

    // Slot manifest (#225 / E1.4 PR2). 11 slots: 2 sliders + 2 labels
    // + 5 presets + 1 readout + 1 world-axes. createPlinth reparents
    // each target under plinth.group at construction.
    const slots: PlinthSlot[] = [
      { id: 'slider-x', target: xSlider.group, localXYZ: [0, PLINTH_X_SLIDER_Y, 0] },
      { id: 'slider-y', target: ySlider.group, localXYZ: [0, PLINTH_Y_SLIDER_Y, 0] },
      // Per-slider value labels: 1 mm slot-Z standoff resolves coplanar
      // z-fighting against the slab top face. Mirrors `SectionTab`'s
      // `SURFACE_LABEL_STANDOFF_M` (`TapButton.ts:104–118`).
      { id: 'label-x', target: xLabel.group, localXYZ: [SLIDER_LABEL_X_OFFSET, PLINTH_X_SLIDER_Y, 0.001] },
      { id: 'label-y', target: yLabel.group, localXYZ: [SLIDER_LABEL_X_OFFSET, PLINTH_Y_SLIDER_Y, 0.001] },
    ];
    presetButtons.forEach((btn, i) => {
      slots.push({
        id: `preset-${i}`,
        target: btn.group,
        localXYZ: [
          PLINTH_PRESET_ROW_START_X + i * PLINTH_PRESET_COL_PITCH,
          PLINTH_PRESET_ROW_Y,
          0,
        ],
      });
    });
    slots.push({
      id: 'readout',
      target: saddleExtremaReadout.group,
      localXYZ: [0, PLINTH_READOUT_Y, READOUT_POST_LENGTH],
    });
    slots.push({
      id: 'readout-post',
      target: saddleExtremaReadoutPost.group,
      localXYZ: [0, PLINTH_READOUT_Y, 0],
      orientation: 'surface',
    });
    slots.push({
      id: 'world-axes',
      target: worldAxes.group,
      localXYZ: [PLINTH_AXIS_INDICATOR_X, PLINTH_AXIS_INDICATOR_Y, 0],
      orientation: 'world',
    });
    plinth = createPlinth({
      anchorWorldXYZ: PLINTH_ANCHOR_WORLD_XYZ,
      slots,
    });
    group.add(plinth.group);
  },

  update() {
    const activePreset = PRESETS[activePresetIndex];

    if (xSlider && ySlider) {
      // 1. Slider hover + drag tick. Order between the two sliders
      //    doesn't matter — each tracks its own grab/hover state.
      xSlider.updateHover(pointers);
      ySlider.updateHover(pointers);
      xSlider.update();
      ySlider.update();

      const x = xSlider.value;
      const y = ySlider.value;
      const z = activePreset.f(x, y);

      // 2. Indicator pose. writeGraphPointToWorld reuses the same
      //    math-frame mapping as the surface mesh, so indicator and
      //    surface can't drift.
      if (indicator) {
        writeGraphPointToWorld(x, y, z, SURFACE_CENTER, indicatorWorld);
        indicator.position.copy(indicatorWorld);
      }

      // 2b. Quadratic-overlay pose (#180). Mutates positions + normals
      //     of the overlay's BufferGeometry to the Taylor expansion of
      //     the active preset at the current (x, y). Always-on per the
      //     v0.8 design decision; toggle UI deferred to v0.9 polish.
      if (taylorOverlay) {
        taylorOverlay.setPose(x, y);
      }

      // 3. Per-slider value labels — linear-decimal format (Cartesian
      //    coords, not angles). Surface-locked via plinth slot's
      //    default `'surface'` orientation (#280) — no per-frame
      //    `faceCamera`.
      if (xLabel) {
        xLabel.setSecondary(formatLinearDecimal(x));
      }
      if (yLabel) {
        yLabel.setSecondary(formatLinearDecimal(y));
      }

      // 4. Classification readout (#181). Hessian evaluated at the
      //    current (x, y) — the readout shows what the second-
      //    derivative test would *report* at that point, treating it
      //    as if it were a critical point. SPEC.md §"Classification
      //    readout" documents the always-on-at-any-point contract.
      if (saddleExtremaReadout) {
        saddleExtremaReadout.setValues(activePreset.hessF(x, y));
      }
    }

    if (saddleExtremaReadout && camera) {
      saddleExtremaReadout.faceCamera(camera);
    }

    // 5. Preset-button hover + press-flash tick. Faces the camera so
    //    labels stay readable at any user yaw, mirroring the slider-
    //    label and worldAxes billboarding contract.
    for (const btn of presetButtons) {
      btn.updateHover(pointers);
      btn.update();
      if (camera) btn.faceCamera(camera);
    }

    // Yaw-only billboard on the WorldAxes letter labels so they read at
    // any user yaw. Same per-frame contract as cluster siblings.
    if (worldAxes && camera) worldAxes.faceCamera(camera);
  },

  unmount() {
    // 1. Release any active pointer grabs so disposed sliders don't
    //    leak grab references back into the shell's pointer instances.
    for (const p of pointers) {
      xSlider?.releaseFromPointer(p);
      ySlider?.releaseFromPointer(p);
    }

    // 2. Dispose named handles — each resource has exactly one disposal
    //    owner. The shell removes ctx.group + descendants automatically
    //    after unmount() returns, so no scene.remove() calls here.
    graphSurface?.dispose();
    graphSurface = undefined;
    criticalPointMarkers?.dispose();
    criticalPointMarkers = undefined;
    taylorOverlay?.dispose();
    taylorOverlay = undefined;
    worldAxes?.dispose();
    worldAxes = undefined;
    xSlider?.dispose();
    xSlider = undefined;
    ySlider?.dispose();
    ySlider = undefined;
    xLabel?.dispose();
    xLabel = undefined;
    yLabel?.dispose();
    yLabel = undefined;
    for (const btn of presetButtons) btn.dispose();
    presetButtons = [];
    saddleExtremaReadout?.dispose();
    saddleExtremaReadout = undefined;
    saddleExtremaReadoutPost?.dispose();
    saddleExtremaReadoutPost = undefined;
    if (indicator) {
      indicator.geometry.dispose();
      (indicator.material as THREE.Material).dispose();
      indicator = undefined;
    }
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

    // 3. Drop external references so a re-mount starts clean.
    pointers = [];
    camera = undefined;
    exhibitGroup = undefined;
    activePresetIndex = DEFAULT_PRESET_INDEX;
  },

  onSelectStart(pointer: Pointer): boolean {
    // Sliders first (warm drag affordance), then the preset row. Spatially
    // disjoint regions, but explicit ordering keeps first-hit-wins
    // well-defined regardless of layout.
    if (xSlider?.tryGrab(pointer)) return true;
    if (ySlider?.tryGrab(pointer)) return true;
    for (let i = 0; i < presetButtons.length; i++) {
      if (presetButtons[i].tryActivate(pointer)) {
        applyPreset(i);
        return true;
      }
    }
    return false;
  },

  onSelectEnd(pointer: Pointer) {
    xSlider?.releaseFromPointer(pointer);
    ySlider?.releaseFromPointer(pointer);
  },
};

// ────────────────────────────────────────────────────────────────────
// Preset application (#178).
//
// Switching presets rebuilds the graph-surface mesh outright — unlike the
// quadrics manipulator's preset tweens, here the active `f` changes
// fundamentally between presets (different polynomial families,
// different domains), so a coefficient-tween is meaningless. Instant
// swap also matches the lesson: "this preset shows ONE archetype."
//
// Slider values carry across the switch (clamped into the new domain via
// setRange). Rationale: a student comparing min vs. saddle at the same
// (x, y) point sees the local-shape difference. Forcing reset to (0, 0)
// every switch would hide that pedagogy.
// ────────────────────────────────────────────────────────────────────

function applyPreset(idx: number): void {
  if (idx === activePresetIndex) return; // press flash already fired; no rebuild
  presetButtons[activePresetIndex]?.setActive(false);
  presetButtons[idx]?.setActive(true);
  activePresetIndex = idx;

  const preset = PRESETS[idx];
  if (graphSurface && exhibitGroup) {
    // Remove from the parent group BEFORE dispose — otherwise the disposed
    // mesh leaks as a child of `exhibitGroup` until unmount sweeps the
    // group. Sequencing matters.
    exhibitGroup.remove(graphSurface.mesh);
    graphSurface.dispose();
    graphSurface = undefined;
  }
  graphSurface = createGraphSurface({
    f: preset.f,
    gradF: preset.gradF,
    domain: preset.domain,
    res: preset.res ?? PRESET_RES,
    surfaceCenter: SURFACE_CENTER,
    baseColor: BASE_COLOR.clone(),
    lightDir: LIGHT_DIR.clone(),
  });
  exhibitGroup?.add(graphSurface.mesh);

  // Rebuild critical-point markers for the new preset. Same
  // remove-before-dispose ordering as the graphSurface swap above so the
  // old marker group doesn't leak as a child of `exhibitGroup`.
  if (criticalPointMarkers && exhibitGroup) {
    exhibitGroup.remove(criticalPointMarkers.group);
    criticalPointMarkers.dispose();
    criticalPointMarkers = undefined;
  }
  criticalPointMarkers = createCriticalPointMarkers({
    preset,
    surfaceCenter: SURFACE_CENTER,
  });
  exhibitGroup?.add(criticalPointMarkers.group);

  // Slider domains follow the preset. setRange clamps the current value
  // into the new range and re-applies snap; the indicator picks up the
  // (possibly clamped) value via the next update() tick.
  xSlider?.setRange(preset.domain.xMin, preset.domain.xMax);
  ySlider?.setRange(preset.domain.yMin, preset.domain.yMax);

  // Slider snap-points follow the preset's critical-point set, projected
  // per axis (#200). Two binding ordering constraints:
  //   1. setRange must precede setSnapPoints — the new snap set is
  //      validated against the post-setRange [min, max].
  //   2. setSnapPoints must precede taylorOverlay.setPreset — the
  //      overlay reads xSlider?.value / ySlider?.value and needs the
  //      fully-reconciled currentValue (which setSnapPoints can shift
  //      if rawValue lands inside a new detent window).
  xSlider?.setSnapPoints(buildAxisSnapPoints(preset.criticalPoints, 0));
  ySlider?.setSnapPoints(buildAxisSnapPoints(preset.criticalPoints, 1));

  // Quadratic overlay (#180) — swap the active preset reference,
  // recompute half-extent, rewrite the aLocal attribute, refresh
  // positions + normals at the (possibly clamped) slider values so
  // the next frame doesn't render the prior preset's shape. setRange
  // above runs first so the values are clamped before the overlay
  // reads them.
  taylorOverlay?.setPreset(
    preset,
    xSlider?.value ?? 0,
    ySlider?.value ?? 0,
  );
}

registerExhibit(saddleExtremaExhibit);

export default saddleExtremaExhibit;
