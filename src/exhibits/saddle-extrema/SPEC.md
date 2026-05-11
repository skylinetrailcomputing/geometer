# `saddle-extrema` exhibit — SPEC

> Math + UX contract for the saddle / extrema classification scene.
> v0.8 cuts: #176 registers the fourth cluster member, introduces a
> new meshed graph-surface rendering primitive, and ships one locked
> starter preset (`z = x² − y²`). #177 adds (x, y) point selection;
> #178 expands the preset library; #179 adds critical-point markers;
> #180 ships the local-quadratic-approximation overlay (the §11.7–11.8
> punch line); #181 ships the live Hessian + classification readout.

## Goal

An interactive WebXR scene where the learner observes a graph surface
`z = f(x, y)` for a curated set of polynomial functions, each chosen
to exhibit one specific critical-point archetype (saddle, min, max,
monkey saddle, D = 0 degenerate). Pedagogy hook: APPM 2350 §11.7–11.8
(Maximum/Minimum Values + Second Derivatives Test). Two stuck-points
the scene is designed to encode:

1. **The second-derivative test is a *local shape* judgment, not a
   sign-checking ritual.** Mechanically computing `D = f_xx · f_yy −
   f_xy²` and checking signs misses the underlying question: "what does
   this surface look like in a small neighborhood?" The quadratic
   overlay in #180 makes the local shape literal.
2. **Degenerate critical points (D = 0) are not edge cases to memorize**
   — they're where the local quadratic fails to determine the shape
   and higher-order terms take over. The preset library in #178
   includes degenerate cases (monkey saddle, `x⁴ + y⁴`) so the
   test-failure mode reads visually rather than as a footnote.

Sibling of `quadrics`, `tangent-planes`, and `gradient-levels` in the
`calculus3` cluster; the SceneRack swaps between the four at runtime.

## Equation form

The surface is the **graph** `z = f(x, y)`, not the implicit
`f(x, y, z) = k` form used by the prior three cluster scenes. The
divergence is pedagogically honest to §11.7's framing — the
second-derivative test operates on a function `f(x, y)` whose graph is
a 2-surface in 3-space — and gives future flexibility for student-
supplied `f(x, y)` (deferred to v1.x+).

Math-frame convention (X right, Y forward, Z up; per
`scaffold/math/frames.ts`): the `(x, y)` domain lives in the math-XY
plane and `z = f(x, y)` lifts vertically along math-Z. World-frame
mapping is JS-side per vertex via `writeGraphPointToWorld` in
`GraphSurface.ts`.

`writeMathToWorld` itself is a pure axis remap + sign flip (math
`(x, y, z)` → world `(x, z, -y)`); no translation. Worldspace anchoring
(`+ SURFACE_CENTER`) is the caller's responsibility — `writeGraphPointToWorld`
bundles both steps so downstream consumers don't re-derive the
contract.

## Starter preset

`f(x, y) = x² − y²` on `(x, y) ∈ [−1.5, 1.5]²`. Analytic data:

- First partials: `f_x = 2x`, `f_y = −2y`.
- Hessian: `f_xx = 2`, `f_yy = −2`, `f_xy = 0`.
- Critical point at the origin (gradient vanishes).
- `D = f_xx · f_yy − f_xy² = (2)(−2) − 0² = −4 < 0` ⇒ saddle.

Visually the eponymous shape — math-X edges curve upward, math-Y edges
curve downward. The §11.7 "what does it look like at the critical
point?" question reads at a glance.

### Note (forward-looking for #178)

*All v0.8 preset critical points sit at the origin.* The starter
saddle, the paraboloid (`x² + y²`), the inverted paraboloid
(`−(x² + y²)`), the monkey saddle (`x³ − 3xy²`), and the D = 0
degenerate min (`x⁴ + y⁴`) all have their critical point at
`(x, y) = (0, 0)`. This is itself a useful pedagogical observation —
critical points don't have to be "out there somewhere"; they live at
a chosen origin so the focus can stay on the *local shape*, not the
*location*. #179's critical-point markers will all render at the
origin for v0.8.

## Graph-surface primitive (`GraphSurface.ts`)

`createGraphSurface(opts)` builds a meshed `BufferGeometry` of
`res × res` vertices over the rectangular `(x, y)` domain, with
analytic vertex normals derived from the supplied `gradF`.

API contract (full TypeScript signatures in `GraphSurface.ts`):

- `f: (x, y) => number` — function value in math-frame coords.
- `gradF: (x, y) => readonly [number, number]` — analytic first partials
  `(f_x, f_y)`. Required (not optional); used for vertex normals.
- `domain: { xMin, xMax, yMin, yMax }` — math-frame `(x, y)` rectangle.
- `res?: number` — grid resolution per side; default 128. Validated:
  must be integer ≥ 2.
- `surfaceCenter: THREE.Vector3` — worldspace anchor; math-origin lifts
  to this point. Math-Z = 0 ⇒ world-Y = surfaceCenter.y.
- `baseColor: THREE.Color` — diffuse color (cluster sky-blue for v0.8).

Returns `{ mesh, material, dispose() }`. The mesh's per-vertex positions
already bake in `surfaceCenter` (via `writeGraphPointToWorld`);
`mesh.position` stays at world origin. `dispose()` invokes
`geometry.dispose()` and `material.dispose()` — the exhibit's `unmount`
calls it once.

### Tessellation

Uniform grid, `res = 128` for v0.8. Produces 16384 vertices and 32258
triangles per surface — comfortably under Quest 3's per-frame triangle
budget. Edge-to-edge tessellation distance on the starter preset at
`[−1.5, 1.5]²` is `3.0 / 127 ≈ 23.6 mm` in world space. Adaptive
tessellation deferred — all v0.8 presets are smooth polynomials with
order-1 curvature across the rendered domain; uniform sampling doesn't
waste triangles on flat regions in any concerning way.

### Index buffer type

Selected by vertex count: `res² > 65535` ⇒ `Uint32Array`; else
`Uint16Array`. `res = 128` (16384 vertices) fits Uint16. `res = 256`
(65536 vertices) tips into Uint32.

### Validation

`createGraphSurface` throws at construction if:

- `res` is not an integer ≥ 2 (division by `res − 1` would NaN).
- `domain.xMin >= domain.xMax` or non-finite (same for y).

Validation errors surface as TypeScript exceptions with clear messages
rather than as silent NaN geometry that would only show as faceting in
headset smoke. The Vitest suite at
`test/exhibits/saddle-extrema/GraphSurface.test.ts` pins all
validation cases.

### Analytic vertex normals

Math-frame normal at `(x, y)`: the graph is the implicit surface
`{ z − f(x, y) = 0 }`, whose gradient is `(−f_x, −f_y, 1)`. Normalized
per vertex; converted to world frame via `writeMathToWorld(...)` as a
direction (no `surfaceCenter` offset). Two scratch `Vector3` objects
(one for position, one for normal) are allocated at builder-call time
and reused across all `res²` iterations — reusing a single scratch
would clobber position when computing normal in the same iteration.

`computeVertexNormals()` is deliberately NOT used: it averages face
normals over each vertex's incident triangles — accurate for arbitrary
meshes but inferior for analytically-derived smooth surfaces.

## Render

`MeshStandardMaterial` with `metalness: 0`, `roughness: 0.6`,
`side: THREE.DoubleSide`. Approximately matches the cluster's
hand-rolled `0.2 + 0.8 × max(dot(n, L), 0)` lambert under the same
`AmbientLight(0xffffff, 0.4)` + `DirectionalLight(0xffffff, 0.8)`
lighting; BUT Cook-Torrance with `roughness=0.6` does produce a soft
specular lobe, and PBR ambient injection differs from the hardcoded
`0.2` floor.

### Material parity fallback

If headset smoke reveals visible parity drift (specular highlight at
the saddle's edges; noticeably cooler or shinier than the
implicit-surface cluster siblings during a scene swap), replace
`MeshStandardMaterial` with a thin `ShaderMaterial` reproducing the
cluster's exact lambert. The fallback shader (pre-coded in the #176
plan):

```glsl
// Vertex
varying vec3 vNormal;
void main() {
  // World-space normal (matches DoublePlane.ts precedent and the
  // world-space uLightDir below). normalMatrix would put vNormal in
  // view space, which would drift under head rotation.
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix
              * vec4(position, 1.0);
}

// Fragment
uniform vec3 uBaseColor;
uniform vec3 uLightDir;
varying vec3 vNormal;
void main() {
  float lambert = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  gl_FragColor = vec4(uBaseColor * (0.2 + 0.8 * lambert), 1.0);
}
```

The fallback is a one-line ctor swap inside `GraphSurface.ts`. Decision
rule for smoke: "if any specular highlight is visible at the saddle's
edges → swap before merge."

## Domain framing + spatial-footprint

The cluster's `BOUND = 3.0` is the **AABB half-extent**. Sibling
raymarched surfaces live inside a BoxGeometry of side `2 × BOUND = 6 m`,
spanning world-X `[-3, 3]`, world-Y `[-1.5, 4.5]` (centered on
`SURFACE_CENTER.y = 1.5`), world-Z `[-7, -1]` (centered on
`SURFACE_CENTER.z = -4`).

The starter saddle on `[−1.5, 1.5]²` uses **half** the cluster's
per-axis x/y extent (3 m × 3 m, vs. the cluster's 6 m × 6 m). The
saddle's z-range `[−2.25, 2.25]` is inside the cluster's half-extent;
the bottom corner sits at world-Y `= -0.75` (below `SURFACE_CENTER.y`
by 2.25 m). The cluster doesn't render a floor and gradient-levels'
family extends arbitrarily along ±math-Z too, so visually consistent
with cluster convention.

`[−1.5, 1.5]²` is a v0.8-starter lock; iterate in-headset if it reads
too small. Future presets in #178 carry per-preset domains in the
preset record.

## Camera framing

**Inherited from the shell's XR spawn camera** (world-origin, ~1.6 m
head height, looking down −world-Z). No per-exhibit camera mutation.
The cluster's `SURFACE_CENTER = (0, 1.5, −4)` anchor was chosen
specifically so cluster surfaces sit at a comfortable viewing position
from the spawn with no per-exhibit framing logic.

Visibility check for the starter saddle:

- Surface center 4 m forward of spawn.
- Surface extends ±1.5 m in world-X (horizontal) and from world-Y
  `−0.75` to `3.75` (full vertical extent 4.5 m).
- Horizontal angular extent: `2 × atan(1.5 / 4) ≈ 41°`.
- Vertical angular extent: from `atan((-0.75 - 1.6) / 4) ≈ −30°`
  (bottom corner below eye level) to `atan((3.75 - 1.6) / 4) ≈ 28°`
  (top corner above eye level), total ~58°.
- Quest 3 FOV: ~96°×96° per eye. Saddle fits well within FOV.

## Out of scope (v0.8 beyond #176)

- **Point selection (#177).** Two (x, y) sliders walking the domain
  + selected-point indicator on the surface. Per-slider variable +
  value labels reusing the #170 scaffold. Introduces the
  `SLIDER_RACK_CENTER` constant (deliberately deferred from #176 per
  the v1 roundtable's GPT #4 finding — scope creep otherwise).
- **Preset library (#178).** Four additional presets (paraboloid,
  inverted paraboloid, monkey saddle, `x⁴ + y⁴`); preset-selector UI
  (mirror the manipulator's `Preset` scaffold primitive); preset-record
  interface extended with `hessF` (second partials for #181's readout).
- **Critical-point markers (#179).** Small visual markers at the
  analytically-known critical points (all at origin for v0.8 presets).
- **Quadratic overlay (#180).** Always-on, translucent second-order
  Taylor approximation rendered as a second graph surface hugging the
  main one at the selected point. Reuses `GraphSurface` and
  `writeGraphPointToWorld`. The §11.7–11.8 punch line.
- **Hessian + classification readout (#181).** Live 2×2 Hessian,
  `D = f_xx · f_yy − f_xy²`, classification verdict
  (min / max / saddle / inconclusive).
- **`GraphSurface` extraction to `src/scaffold/`.** Deferred until a
  second scene wants the primitive (likely v1.x). The overlay in #180
  is a same-scene consumer; doesn't count for the extract-on-second-
  consumer rule.
- **Numerical critical-point solver.** Preset-supplied analytical
  critical points only.
- **User-supplied `f(x, y)`.** Strong long-term motivator for the
  primitive's design; input UX is its own scope (v1.x+).
- **Runtime `f` / `gradF` non-finite-value validation.** v0.8 presets
  are all polynomials; sampling validation is over-engineering against
  a deferred risk.
