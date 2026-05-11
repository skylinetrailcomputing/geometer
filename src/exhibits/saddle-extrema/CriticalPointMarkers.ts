import * as THREE from 'three';
import { YELLOW } from '@/scaffold/design/tokens';
import { writeGraphPointToWorld } from './GraphSurface';
import type { SaddleExtremaPreset } from './presets';

// Small marker spheres at each analytically-known critical point of the
// active preset (#179). All v0.8 preset critical points sit at the origin
// (cluster-shared observation in SPEC.md §"Pedagogical observation"), so
// every preset renders one marker that lands on the slider-origin pose;
// the data shape `CriticalPoint[]` is forward-looking for future presets
// with off-origin or multiple CPs.
//
// Visual-only — sliders do NOT snap to markers. The (x, y) domain is small
// enough that sliders find the origin easily via the existing origin-snap
// detent (`SLIDER_SNAP_POINTS = [0]` in index.ts), and snap-detents are an
// explicit per-scene design knob in the scaffold; the issue defers that
// decision to v0.9 polish.

// YELLOW for the marker continues the cluster's accent convention for
// "important math fact at a point" — same color as the gradient-arrow
// (#165), the |∇f| numeric (#166), and the D / verdict in the
// classification readout (#181). Distinct from the off-white selected-
// point indicator (`INDICATOR_COLOR = 0xdddddd`) so a side-by-side
// reading is unambiguous; when the user slides the indicator onto a
// critical point, the off-white sphere nesting over the yellow marker
// reads as "you've reached the critical point."
const MARKER_COLOR = YELLOW;

// 0.024 m = 60% of the selected-point indicator's 0.04 m radius. The
// marker is meant to be unobtrusive ("the lesson is the *shape*, not the
// marker" — issue #179); smaller than the indicator keeps it visually
// recessive while still readable at headset distance.
const MARKER_RADIUS = 0.024;

// Sphere tessellation matches the cluster's indicator + slider-thumb +
// TapButton convention (16×12). Plenty smooth at the marker's small
// visual size.
const MARKER_WIDTH_SEGMENTS = 16;
const MARKER_HEIGHT_SEGMENTS = 12;

export interface CriticalPointMarkersOptions {
  /** Active preset — provides `f` and `criticalPoints`. */
  preset: SaddleExtremaPreset;
  /** World-space anchor where math-origin lifts to. Same value the
   *  graph-surface mesh + selected-point indicator anchor on. */
  surfaceCenter: THREE.Vector3;
}

export interface CriticalPointMarkersHandles {
  /**
   * Group containing one marker mesh per critical point. Caller adds it
   * to the scene; the markers are static within the group (the active
   * preset's critical points are analytically fixed for the preset's
   * lifetime, so no per-frame update is needed).
   */
  readonly group: THREE.Group;
  /**
   * Dispose all marker geometries + materials. Single owner — the scene's
   * `unmount` (and `applyPreset` rebuild path) calls this once.
   */
  dispose(): void;
}

export function createCriticalPointMarkers(
  opts: CriticalPointMarkersOptions,
): CriticalPointMarkersHandles {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];

  // Reused per critical point; the SphereGeometry's world position is
  // baked into the mesh.position at construction, so a single scratch
  // can't clobber anything.
  const scratchWorld = new THREE.Vector3();

  // Shared geometry + material across all markers of the active preset
  // — every marker is the same color and radius, so one instance feeds
  // multiple meshes. Dispose-once via the shared refs below.
  const geometry = new THREE.SphereGeometry(
    MARKER_RADIUS,
    MARKER_WIDTH_SEGMENTS,
    MARKER_HEIGHT_SEGMENTS,
  );
  const material = new THREE.MeshStandardMaterial({ color: MARKER_COLOR });

  for (const [cx, cy] of opts.preset.criticalPoints) {
    const cz = opts.preset.f(cx, cy);
    writeGraphPointToWorld(cx, cy, cz, opts.surfaceCenter, scratchWorld);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(scratchWorld);
    group.add(mesh);
    meshes.push(mesh);
  }

  return {
    group,
    dispose() {
      // Shared geometry + material: one dispose call each, regardless of
      // marker count. The meshes themselves don't own GPU resources
      // beyond what they reference.
      geometry.dispose();
      material.dispose();
      for (const mesh of meshes) group.remove(mesh);
    },
  };
}
