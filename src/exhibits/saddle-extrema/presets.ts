import type { GraphSurfaceDomain } from './GraphSurface';

// Saddle / extrema scene preset library (#178). Each preset focuses the
// lesson on one specific critical-point archetype so the student can step
// through them deliberately rather than encountering them mixed in a single
// surface. All v0.8 critical points sit at the origin (cluster-shared
// observation in SPEC.md), so the indicator at the slider-origin pose lands
// on the critical point for every preset.
//
// Per-preset `domain` sized so the surface fits the cluster's vertical
// envelope (world-Y ≈ [-0.75, 3.75], per SPEC.md "Domain framing"). The
// shared `[-1.5, 1.5]²` from the #176 starter doesn't carry to quartics or
// cubics — `x⁴+y⁴` evaluates to 10.125 at (1.5, 1.5), well past the
// cluster top.

/**
 * Symmetric 2×2 Hessian entries. Returns `[f_xx, f_xy, f_yy]`; `f_yx`
 * equals `f_xy` and is left implicit. Consumed by #181's classification
 * readout via `D = f_xx · f_yy − f_xy²`.
 */
export type Hessian = readonly [number, number, number];

/**
 * Analytically-known critical point in math-frame `(x, y)` coords. Every
 * v0.8 preset has exactly one critical point at the origin (see SPEC.md
 * §"Pedagogical observation — all critical points at origin"); the
 * `readonly [number, number][]` shape is forward-looking so a future
 * preset with off-origin or multiple CPs drops in without an interface
 * change.
 */
export type CriticalPoint = readonly [number, number];

export interface SaddleExtremaPreset {
  readonly id: string;
  readonly label: string;
  /** `z = f(x, y)` in math-frame coords. */
  readonly f: (x: number, y: number) => number;
  /** Analytic first partials `(f_x, f_y)`. Required — feeds vertex normals. */
  readonly gradF: (x: number, y: number) => readonly [number, number];
  /** Analytic Hessian entries `(f_xx, f_xy, f_yy)`. Stored on the preset for
   *  #181's classification readout; not consumed by #178. */
  readonly hessF: (x: number, y: number) => Hessian;
  /** Per-preset (x, y) window. Picked so the surface fits the cluster envelope. */
  readonly domain: GraphSurfaceDomain;
  /**
   * Analytically-known critical points (`∇f = 0`). Rendered by #179 as
   * small markers on the graph surface; not consumed by #178 / #181.
   * v0.8 entries are all `[[0, 0]]` — every preset has one CP at the
   * origin.
   */
  readonly criticalPoints: readonly CriticalPoint[];
  /** Optional grid resolution per side. Defaults to 128 at the call site. */
  readonly res?: number;
}

export const PRESETS: readonly SaddleExtremaPreset[] = [
  // 1. Local min — z = x² + y². Paraboloid; classic D > 0 + f_xx > 0 ⇒ min.
  {
    id: 'paraboloid',
    label: 'Min (x² + y²)',
    f: (x, y) => x * x + y * y,
    gradF: (x, y) => [2 * x, 2 * y],
    hessF: () => [2, 0, 2],
    domain: { xMin: -1.2, xMax: 1.2, yMin: -1.2, yMax: 1.2 },
    criticalPoints: [[0, 0]],
  },
  // 2. Local max — z = −(x² + y²). Inverted paraboloid; D > 0 + f_xx < 0 ⇒ max.
  {
    id: 'inv-paraboloid',
    label: 'Max (−x² − y²)',
    f: (x, y) => -(x * x + y * y),
    gradF: (x, y) => [-2 * x, -2 * y],
    hessF: () => [-2, 0, -2],
    domain: { xMin: -1.2, xMax: 1.2, yMin: -1.2, yMax: 1.2 },
    criticalPoints: [[0, 0]],
  },
  // 3. Saddle — z = x² − y². The #176 starter; D < 0 ⇒ saddle.
  {
    id: 'saddle',
    label: 'Saddle (x² − y²)',
    f: (x, y) => x * x - y * y,
    gradF: (x, y) => [2 * x, -2 * y],
    hessF: () => [2, 0, -2],
    domain: { xMin: -1.5, xMax: 1.5, yMin: -1.5, yMax: 1.5 },
    criticalPoints: [[0, 0]],
  },
  // 4. Monkey saddle — z = x³ − 3xy². Degenerate critical point at origin
  //    (Hessian vanishes identically there ⇒ D = 0). Three "valleys"
  //    radiate outward; the second-derivative test is silent and the local
  //    shape is determined by the cubic terms.
  {
    id: 'monkey-saddle',
    label: 'Monkey (x³−3xy²)',
    f: (x, y) => x * x * x - 3 * x * y * y,
    gradF: (x, y) => [3 * x * x - 3 * y * y, -6 * x * y],
    hessF: (x, y) => [6 * x, -6 * y, -6 * x],
    domain: { xMin: -1.2, xMax: 1.2, yMin: -1.2, yMax: 1.2 },
    criticalPoints: [[0, 0]],
  },
  // 5. D = 0 degenerate that's still a min — z = x⁴ + y⁴. Hessian vanishes
  //    at origin (f_xx = f_xy = f_yy = 0) ⇒ D = 0 inconclusive — yet the
  //    surface is unambiguously a local minimum. The §11.7–11.8 punch-line
  //    counterexample: "the test isn't always sufficient." Quartic grows
  //    quickly; smallest domain in the set.
  {
    id: 'quartic-min',
    label: 'Min (x⁴ + y⁴)',
    f: (x, y) => x ** 4 + y ** 4,
    gradF: (x, y) => [4 * x ** 3, 4 * y ** 3],
    hessF: (x, y) => [12 * x * x, 0, 12 * y * y],
    domain: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
    criticalPoints: [[0, 0]],
  },
];

/** Index of the saddle preset — the #176 starter; boot pose for #178. */
export const DEFAULT_PRESET_INDEX = 2;
