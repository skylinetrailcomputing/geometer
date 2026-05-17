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
  GRAB_RADIUS_MULTIPLIER,
  SLIDER_LABEL_LINE_GAP,
  SLIDER_LABEL_PRIMARY_FONT_SIZE,
  SLIDER_LABEL_SECONDARY_FONT_SIZE,
  SLIDER_LABEL_X_OFFSET,
  SLIDER_ROW_PITCH,
  SLIDER_SNAP_DETENT,
  createSliderRackCenter,
} from '@/scaffold/ui/clusterRackTokens';
import { WorldAxes } from '@/scaffold/ui/WorldAxes';
import {
  createStageFloor,
  type StageFloorHandles,
} from '@/scaffold/staging/StageFloor';
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
const AXIS_INDICATOR_POSITION = new THREE.Vector3(0.35, 1.17, -0.7);
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
const BASE_COLOR = new THREE.Color(0.4, 0.7, 0.95);

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

// Classification readout (#181) — three lines (Hessian entries / D /
// verdict). Anchored above the preset row (preset-row buttons cap at
// y ≈ 1.32 including button radius) with ~0.12 m vertical clearance.
// Shares the foreground-UI z-plane with the slider rack and preset
// row so the user's gaze stays in one depth band.
const READOUT_POSITION = new THREE.Vector3(0, 1.5, -0.7);

// Slider rack — two-row symmetric straddle around SLIDER_RACK_CENTER. The
// 3-row top-heavy pattern from gradient-levels (θ/φ/k at [center+pitch,
// center, center-pitch]) doesn't carry over cleanly to a 2-row rack; the
// straddle layout reads as balanced. SLIDER_RACK_CENTER / SLIDER_ROW_PITCH
// imported from scaffold/ui/clusterRackTokens (#201 PR 4) — per-file
// fresh THREE.Vector3 from the factory so mutation can't leak across
// scenes.
const SLIDER_RACK_CENTER = createSliderRackCenter();
const X_SLIDER_Y = SLIDER_RACK_CENTER.y + SLIDER_ROW_PITCH / 2;
const Y_SLIDER_Y = SLIDER_RACK_CENTER.y - SLIDER_ROW_PITCH / 2;

// Slider design feel — quadric-tuned constants, ported from cluster
// siblings. Snap detents combine the slider-canonical origin (always
// seeded) with the active preset's critical-point coordinates,
// projected per axis (#200). For every v0.8 preset the CPs sit at the
// origin, so the projected snap set collapses to `[0]` and visible
// behavior is unchanged from v0.7; future off-origin presets (or
// user-supplied f(x, y) in v1.x) get correct CP-aware snaps for free.
// SLIDER_SNAP_DETENT / GRAB_RADIUS_MULTIPLIER imported from
// scaffold/ui/clusterRackTokens (#201 PR 4).

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

// Preset row (#178). Five buttons in a single horizontal row above the
// slider rack, centered on x = 0. Always-visible — five archetypes is
// small enough to live on screen at all times (the quadrics manipulator's
// 8-preset rack needed an expand/collapse chevron; here that machinery
// would be friction without payoff). The y level clears the top slider's
// grab sphere (≈ 0.07 m radius) with ~0.16 m of clear air.
const PRESET_ROW_Y = 1.30;
const PRESET_HORIZONTAL_PITCH = 0.13;
// 5 columns centered on x = 0 ⇒ leftmost col at -2 × pitch.
const PRESET_ROW_START_X = -2 * PRESET_HORIZONTAL_PITCH;
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
let activePresetIndex = DEFAULT_PRESET_INDEX;
let saddleExtremaReadout: SaddleExtremaReadout | undefined;
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

  mount({ group, camera: cam, pointers: shellPointers }: ExhibitContext) {
    exhibitGroup = group;
    camera = cam;
    pointers = shellPointers;
    activePresetIndex = DEFAULT_PRESET_INDEX;
    const initialPreset = PRESETS[activePresetIndex];

    // Ambient + directional lights match cluster siblings. The graph
    // surface uses a custom ShaderMaterial reproducing the cluster's
    // lambert formula; the DirectionalLight here is decorative for the
    // surface (ShaderMaterial doesn't auto-bind scene lights) but lights
    // accessory geometry (indicator).
    group.add(new THREE.AmbientLight(0xffffff, 0.4));
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.copy(LIGHT_DIR).multiplyScalar(5);
    group.add(directional);

    // Stage floor with rect cutout (#238 / E1.1), sized to the widest
    // preset domain (`STAGE_CUTOUT_HALF` derived from PRESETS — see
    // module-scope comment). Cutout reaches world Z = -5.5, just past
    // the cluster-default floor's −Z edge at -5; strip clamp truncates
    // to the floor edge. Static at mount — does not resize on preset
    // change. See `_private/plans/238-cluster-cutout.md` §3.4 for the
    // Path A1 rationale.
    stageFloor = createStageFloor({
      cutout: {
        kind: 'rect',
        centerXZ: [SURFACE_CENTER.x, SURFACE_CENTER.z],
        halfExtentX: STAGE_CUTOUT_HALF,
        halfExtentZ: STAGE_CUTOUT_HALF,
      },
    });
    group.add(stageFloor.group);

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
    // convention.
    xSlider = new Slider({
      label: 'x',
      min: initialPreset.domain.xMin,
      max: initialPreset.domain.xMax,
      initial: X_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: buildAxisSnapPoints(initialPreset.criticalPoints, 0),
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
      baseColor: VERMILLION,
      thumbShape: 'sphere',
    });
    xSlider.group.position.set(
      SLIDER_RACK_CENTER.x,
      X_SLIDER_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(xSlider.group);

    // y slider — bluish-green (math-Y axis tint).
    ySlider = new Slider({
      label: 'y',
      min: initialPreset.domain.yMin,
      max: initialPreset.domain.yMax,
      initial: Y_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: buildAxisSnapPoints(initialPreset.criticalPoints, 1),
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
      baseColor: BLUISH_GREEN,
      thumbShape: 'sphere',
    });
    ySlider.group.position.set(
      SLIDER_RACK_CENTER.x,
      Y_SLIDER_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(ySlider.group);

    // Per-slider labels — primary = variable name (set once at mount),
    // secondary = live value (per-frame in update()).
    xLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    xLabel.setPrimary('x');
    xLabel.group.position.set(
      SLIDER_RACK_CENTER.x + SLIDER_LABEL_X_OFFSET,
      X_SLIDER_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(xLabel.group);

    yLabel = new Label({
      primaryFontSize: SLIDER_LABEL_PRIMARY_FONT_SIZE,
      secondaryFontSize: SLIDER_LABEL_SECONDARY_FONT_SIZE,
      lineGap: SLIDER_LABEL_LINE_GAP,
      anchorX: 'right',
    });
    yLabel.setPrimary('y');
    yLabel.group.position.set(
      SLIDER_RACK_CENTER.x + SLIDER_LABEL_X_OFFSET,
      Y_SLIDER_Y,
      SLIDER_RACK_CENTER.z,
    );
    group.add(yLabel.group);

    // Indicator — sphere at the selected point. Position seeded at the
    // boot pose so the first paint shows the correct location even
    // before update() runs.
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

    worldAxes = new WorldAxes({ axisColors: DEFAULT_AXIS_COLORS });
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    group.add(worldAxes.group);

    // Classification readout (#181). f_xx and f_yy tinted with the
    // cluster's math-X / math-Y axis colors (vermillion / bluish-green)
    // to reinforce "f_xx is the pure-x² term, f_yy is the pure-y²
    // term"; the cross-term f_xy stays white to read as "neither pure
    // axis." D and verdict use YELLOW — the same accent gradient-levels
    // (#166) uses for the |∇f| numeric. Boots hidden; the first
    // update() tick populates the slots and uncloaks.
    saddleExtremaReadout = new SaddleExtremaReadout({
      fxxColor: VERMILLION,
      fxyColor: 0xffffff,
      fyyColor: BLUISH_GREEN,
      accentColor: YELLOW,
    });
    saddleExtremaReadout.group.position.copy(READOUT_POSITION);
    group.add(saddleExtremaReadout.group);

    // Preset row (#178) — five archetypes left → right, mirroring the
    // PRESETS array order. The starter (saddle, DEFAULT_PRESET_INDEX) is
    // marked sticky-active so the user reads which archetype is current.
    presetButtons = PRESETS.map((preset, i) => {
      const btn = new Preset({
        name: preset.label,
        grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
        activeEmissive: PRESET_ACTIVE_EMISSIVE,
      });
      btn.group.position.set(
        PRESET_ROW_START_X + i * PRESET_HORIZONTAL_PITCH,
        PRESET_ROW_Y,
        SLIDER_RACK_CENTER.z,
      );
      group.add(btn.group);
      return btn;
    });
    presetButtons[activePresetIndex]?.setActive(true);
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
      //    coords, not angles).
      if (xLabel && camera) {
        xLabel.setSecondary(formatLinearDecimal(x));
        xLabel.faceCamera(camera);
      }
      if (yLabel && camera) {
        yLabel.setSecondary(formatLinearDecimal(y));
        yLabel.faceCamera(camera);
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
    if (indicator) {
      indicator.geometry.dispose();
      (indicator.material as THREE.Material).dispose();
      indicator = undefined;
    }
    if (stageFloor) {
      stageFloor.dispose();
      stageFloor = undefined;
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
