import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '../../shell/clusters';
import { registerExhibit } from '../../shell/registry';
import {
  BLUISH_GREEN,
  DEFAULT_AXIS_COLORS,
  VERMILLION,
} from '@/scaffold/design/tokens';
import { Label } from '@/scaffold/ui/Label';
import { Slider } from '@/scaffold/ui/Slider';
import { WorldAxes } from '@/scaffold/ui/WorldAxes';
import {
  createGraphSurface,
  writeGraphPointToWorld,
  type GraphSurfaceDomain,
  type GraphSurfaceHandles,
} from './GraphSurface';

// Saddle / extrema scene (#175 epic, #176 foundation). Fourth and final
// member of the calculus3 cluster, alongside quadrics, tangent-planes,
// and gradient-levels.
//
// Pedagogy target: APPM 2350 §11.7–11.8 (Maximum/Minimum Values + Second
// Derivatives Test). Stuck-point: students mechanically compute D =
// f_xx·f_yy − f_xy² without seeing that they're asking "what does this
// surface look like in a small neighborhood?" The quadratic-overlay
// punch line lands in #180; this PR establishes the substrate — meshed
// graph surface for z = f(x, y) — that #177 (point selection), #178
// (preset library), #179 (critical-point markers), #180 (overlay), and
// #181 (Hessian readout) attach to.
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

// Slider rack — two-row symmetric straddle around SLIDER_RACK_CENTER. The
// 3-row top-heavy pattern from gradient-levels (θ/φ/k at [center+pitch,
// center, center-pitch]) doesn't carry over cleanly to a 2-row rack; the
// straddle layout reads as balanced.
const SLIDER_RACK_CENTER = new THREE.Vector3(0, 1.0, -0.7);
const SLIDER_ROW_PITCH = 0.14;
const X_SLIDER_Y = SLIDER_RACK_CENTER.y + SLIDER_ROW_PITCH / 2;
const Y_SLIDER_Y = SLIDER_RACK_CENTER.y - SLIDER_ROW_PITCH / 2;

// Slider design feel — quadric-tuned constants, ported from cluster
// siblings. Snap detents at [0] only: slider-canonical origin, not
// critical-point-aware (the coincidence that v0.8 preset critical points
// sit at the origin makes origin-snap LAND on the critical point, but the
// snap mechanism is preset-independent). Critical-point-aware snap is
// deferred to #179.
const SLIDER_SNAP_DETENT = 0.05;
const GRAB_RADIUS_MULTIPLIER = 2.75;
const SLIDER_SNAP_POINTS: readonly number[] = [0];

// Initial pose — off origin-snap, off endpoints, off both axes,
// non-equal — so first-frame drag responds in any direction.
const X_INITIAL = 0.5;
const Y_INITIAL = 0.3;

// Per-slider variable + value label layout — verbatim from gradient-levels'
// #170 layout. Right-anchored so worst-case secondary text "−1.50" stays
// clear of the slider thumb at any value.
const SLIDER_LABEL_X_OFFSET = -0.20;
const SLIDER_LABEL_PRIMARY_FONT_SIZE = 0.05;
const SLIDER_LABEL_SECONDARY_FONT_SIZE = 0.035;
const SLIDER_LABEL_LINE_GAP = 0.008;

// Indicator — verbatim port from cluster siblings for visual consistency.
const INDICATOR_RADIUS = 0.04;
const INDICATOR_COLOR = 0xdddddd;

// Cluster glyph convention for negative-magnitude formatting.
const SLIDER_VALUE_MINUS = '−'; // U+2212

// Local linear-decimal formatter for the per-slider value labels.
// Identical in shape to gradient-levels' local helper (#170 history);
// this scene becomes consumer #2 — extract-on-third-use rule honored, so
// kept local rather than extracted to scaffold/ui.
function formatLinearDecimal(v: number): string {
  if (v < 0) return `${SLIDER_VALUE_MINUS}${Math.abs(v).toFixed(2)}`;
  return v.toFixed(2);
}

// ────────────────────────────────────────────────────────────────────
// Starter preset — z = x² − y² on [-1.5, 1.5]². Sole preset for #176.
// The `id` and `label` fields exist now to pre-pave #178's preset-
// selector UI (which will mirror the manipulator's `Preset` primitive);
// #176 has only one preset and never reads them.
//
// `hessF` (second partials for #181's Hessian readout) is intentionally
// absent from this interface — added in #178 alongside the preset
// library, because no #176-scope consumer needs second partials.
// Implementer note: do not try to "complete" the interface in this PR.
// ────────────────────────────────────────────────────────────────────

interface SaddleExtremaPreset {
  readonly id: string;
  readonly label: string;
  readonly f: (x: number, y: number) => number;
  readonly gradF: (x: number, y: number) => readonly [number, number];
  readonly domain: GraphSurfaceDomain;
  readonly res?: number;
}

const STARTER_PRESET: SaddleExtremaPreset = {
  id: 'saddle',
  label: 'Saddle (x² − y²)',
  f: (x, y) => x * x - y * y,
  gradF: (x, y) => [2 * x, -2 * y],
  domain: { xMin: -1.5, xMax: 1.5, yMin: -1.5, yMax: 1.5 },
};

// ────────────────────────────────────────────────────────────────────
// Module-scoped state — named handles initialized in mount, disposed
// inline in unmount.
// ────────────────────────────────────────────────────────────────────

let graphSurface: GraphSurfaceHandles | undefined;
let worldAxes: WorldAxes | undefined;
let xSlider: Slider | undefined;
let ySlider: Slider | undefined;
let xLabel: Label | undefined;
let yLabel: Label | undefined;
let indicator: THREE.Mesh | undefined;
let camera: THREE.Camera | undefined;
let controllers: readonly THREE.Object3D[] = [];

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

  mount({ group, camera: cam, controllers: shellControllers }: ExhibitContext) {
    camera = cam;
    controllers = shellControllers;

    // Ambient + directional lights match cluster siblings. The graph
    // surface uses a custom ShaderMaterial reproducing the cluster's
    // lambert formula; the DirectionalLight here is decorative for the
    // surface (ShaderMaterial doesn't auto-bind scene lights) but lights
    // accessory geometry (indicator).
    group.add(new THREE.AmbientLight(0xffffff, 0.4));
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.copy(LIGHT_DIR).multiplyScalar(5);
    group.add(directional);

    graphSurface = createGraphSurface({
      f: STARTER_PRESET.f,
      gradF: STARTER_PRESET.gradF,
      domain: STARTER_PRESET.domain,
      res: STARTER_PRESET.res ?? 128,
      surfaceCenter: SURFACE_CENTER,
      baseColor: BASE_COLOR.clone(),
      lightDir: LIGHT_DIR.clone(),
    });
    group.add(graphSurface.mesh);

    // x slider — vermillion (math-X axis tint). Honest pickup since
    // x IS the math-X axis value, not a derived parameter. Mirrors
    // the quadrics manipulator's (a, b, c) coefficient-slider color
    // convention.
    xSlider = new Slider({
      label: 'x',
      min: STARTER_PRESET.domain.xMin,
      max: STARTER_PRESET.domain.xMax,
      initial: X_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: SLIDER_SNAP_POINTS,
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
      min: STARTER_PRESET.domain.yMin,
      max: STARTER_PRESET.domain.yMax,
      initial: Y_INITIAL,
      snapDetent: SLIDER_SNAP_DETENT,
      snapPoints: SLIDER_SNAP_POINTS,
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
      STARTER_PRESET.f(X_INITIAL, Y_INITIAL),
      SURFACE_CENTER,
      indicatorWorld,
    );
    indicator.position.copy(indicatorWorld);
    group.add(indicator);

    worldAxes = new WorldAxes({ axisColors: DEFAULT_AXIS_COLORS });
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    group.add(worldAxes.group);
  },

  update() {
    if (xSlider && ySlider) {
      // 1. Slider hover + drag tick. Order between the two sliders
      //    doesn't matter — each tracks its own grab/hover state.
      xSlider.updateHover(controllers);
      ySlider.updateHover(controllers);
      xSlider.update();
      ySlider.update();

      const x = xSlider.value;
      const y = ySlider.value;
      const z = STARTER_PRESET.f(x, y);

      // 2. Indicator pose. writeGraphPointToWorld reuses the same
      //    math-frame mapping as the surface mesh, so indicator and
      //    surface can't drift.
      if (indicator) {
        writeGraphPointToWorld(x, y, z, SURFACE_CENTER, indicatorWorld);
        indicator.position.copy(indicatorWorld);
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
    }

    // Yaw-only billboard on the WorldAxes letter labels so they read at
    // any user yaw. Same per-frame contract as cluster siblings.
    if (worldAxes && camera) worldAxes.faceCamera(camera);
  },

  unmount() {
    // 1. Release any active controller grabs so disposed sliders don't
    //    leak grab references back into the shell's controller objects.
    for (const c of controllers) {
      xSlider?.releaseFromController(c);
      ySlider?.releaseFromController(c);
    }

    // 2. Dispose named handles — each resource has exactly one disposal
    //    owner. The shell removes ctx.group + descendants automatically
    //    after unmount() returns, so no scene.remove() calls here.
    graphSurface?.dispose();
    graphSurface = undefined;
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
    if (indicator) {
      indicator.geometry.dispose();
      (indicator.material as THREE.Material).dispose();
      indicator = undefined;
    }

    // 3. Drop external references so a re-mount starts clean.
    controllers = [];
    camera = undefined;
  },

  onSelectStart(controller: THREE.Object3D) {
    // Try sliders in rack reading order (x first, y second); first hit
    // wins. Rack-first-refusal arbitration happens upstream in the
    // shell — by the time this fires, SceneRack didn't consume the
    // event.
    if (xSlider?.tryGrab(controller)) return;
    ySlider?.tryGrab(controller);
  },

  onSelectEnd(controller: THREE.Object3D) {
    xSlider?.releaseFromController(controller);
    ySlider?.releaseFromController(controller);
  },
};

registerExhibit(saddleExtremaExhibit);

export default saddleExtremaExhibit;
