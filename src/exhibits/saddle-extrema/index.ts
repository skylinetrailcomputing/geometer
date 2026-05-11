import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '../../shell/clusters';
import { registerExhibit } from '../../shell/registry';
import { DEFAULT_AXIS_COLORS } from '@/scaffold/design/tokens';
import { WorldAxes } from '@/scaffold/ui/WorldAxes';
import {
  createGraphSurface,
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
// inline in unmount. No `controllers` or `SLIDER_RACK_CENTER` capture
// in #176 — no consumer until #177's sliders arrive (TS strict-mode
// `noUnusedLocals` would also reject dead capture).
// ────────────────────────────────────────────────────────────────────

let graphSurface: GraphSurfaceHandles | undefined;
let worldAxes: WorldAxes | undefined;
let camera: THREE.Camera | undefined;

// ────────────────────────────────────────────────────────────────────
// Exhibit
// ────────────────────────────────────────────────────────────────────

const saddleExtremaExhibit: Exhibit = {
  id: 'saddle-extrema',
  title: 'Critical points',
  cluster: CLUSTER_CALCULUS3,

  mount({ group, camera: cam }: ExhibitContext) {
    camera = cam;

    // Ambient + directional lights matching cluster siblings. The graph
    // surface uses MeshStandardMaterial under these lights to approximate
    // the cluster's hand-rolled lambert; SPEC.md "Material parity fallback"
    // documents the ShaderMaterial swap if smoke shows divergence.
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

    worldAxes = new WorldAxes({ axisColors: DEFAULT_AXIS_COLORS });
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    group.add(worldAxes.group);
  },

  update() {
    // No sliders or per-frame uniforms in #176. Keep WorldAxes labels
    // billboarded so they read at any user yaw — same per-frame contract
    // as cluster siblings.
    if (worldAxes && camera) worldAxes.faceCamera(camera);
  },

  unmount() {
    // No controller grabs to release in #176 (no sliders yet); #177 will
    // walk the (x, y) sliders here.

    graphSurface?.dispose();
    graphSurface = undefined;
    worldAxes?.dispose();
    worldAxes = undefined;

    // Drop external references so a re-mount starts clean. The shell
    // removes ctx.group + descendants automatically.
    camera = undefined;
  },

  onSelectStart() {
    // No interactive elements in #176; #177 introduces (x, y) sliders.
  },

  onSelectEnd() {
    // Symmetric — no grabs to release.
  },
};

registerExhibit(saddleExtremaExhibit);

export default saddleExtremaExhibit;
