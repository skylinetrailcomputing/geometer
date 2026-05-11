# `saddle-extrema` exhibit — SPEC

> Math + UX contract for the saddle / extrema classification scene.
> v0.8 cuts: #176 registers the fourth cluster member, introduces a
> new meshed graph-surface rendering primitive, and ships one locked
> starter preset (`z = x² − y²`). #177 adds (x, y) point selection;
> #178 expands the preset library to five archetypes + adds `hessF`
> to the preset record + ships the preset-selector UI; #179 adds
> critical-point markers; #180 ships the local-quadratic-approximation
> overlay (the §11.7–11.8 punch line); #181 ships the live Hessian +
> classification readout.

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

## Preset library (#178)

Five curated presets, one per critical-point archetype. The student
steps through them deliberately — each preset replaces the active
`f`, `gradF`, `hessF`, and `(x, y)` domain — so the lesson focuses on
one archetype at a time rather than a single function mixing several.
The boot pose is the saddle (the #176 starter; also visually the most
recognizable archetype).

Reading order in the preset row matches the array order in
`presets.ts` — paraboloid → inv-paraboloid → saddle → monkey saddle →
quartic — which is also the pedagogical sequence: simplest classical
cases first, then the eponymous saddle, then the degenerate
counterexamples that drive the §11.7–11.8 stuck-point.

| `id`              | Function            | Domain          | `D` at origin   | Classification |
|-------------------|---------------------|-----------------|-----------------|----------------|
| `paraboloid`      | `x² + y²`           | `[-1.2, 1.2]²`  | `4` (> 0)       | Local min      |
| `inv-paraboloid`  | `−(x² + y²)`        | `[-1.2, 1.2]²`  | `4` (> 0)       | Local max      |
| `saddle`          | `x² − y²`           | `[-1.5, 1.5]²`  | `−4` (< 0)      | Saddle         |
| `monkey-saddle`   | `x³ − 3xy²`         | `[-1.2, 1.2]²`  | `0`             | Inconclusive (degenerate; cubic terms determine local shape) |
| `quartic-min`     | `x⁴ + y⁴`           | `[-1, 1]²`      | `0`             | Inconclusive (test failure — surface is still a local min)   |

Analytic data on each preset:

- `f(x, y)` — function value in math-frame coords.
- `gradF(x, y) → [f_x, f_y]` — first partials. Required (vertex normals on the graph-surface primitive read from this).
- `hessF(x, y) → [f_xx, f_xy, f_yy]` — symmetric Hessian, three distinct entries. Stored on the preset for #181's classification readout (`D = f_xx · f_yy − f_xy²`); not consumed by #178 itself.
- `domain: { xMin, xMax, yMin, yMax }` — per-preset rectangle, sized so the rendered surface fits the cluster envelope.

### Why per-preset domains?

The cluster's vertical envelope is roughly world-Y `[−0.75, 3.75]`
(4.5 m, centered on `SURFACE_CENTER.y = 1.5`, see "Domain framing"
below). A shared `[−1.5, 1.5]²` doesn't work across the set:

- Paraboloid / inv-paraboloid at `(±1.5, ±1.5)` evaluates to `±4.5` —
  top corner extends to world-Y = 6, well above the cluster envelope.
- Monkey saddle at corner `(1.5, 1.5)` evaluates to `−6.75` — bottom
  corner at world-Y ≈ −5.25, far below the cluster floor.
- Quartic at corner `(1.5, 1.5)` evaluates to `10.125` — top corner at
  world-Y ≈ 11.6, completely out of FOV from spawn.

Smaller domains for higher-degree presets keep the surface within the
viewing volume without sacrificing the critical-point neighborhood (every
preset's critical point sits at the origin, well inside its domain).

### Pedagogical observation — all critical points at origin

*All v0.8 preset critical points sit at the origin.* Critical points
don't have to be "out there somewhere"; they live at a chosen origin
so the focus stays on the *local shape*, not the *location*. #179's
critical-point markers will all render at the origin for v0.8.
Origin-snap on the (x, y) sliders (`snapPoints = [0]`) coincides with
the critical point for every preset — slider-canonical, not
critical-point-aware (the snap mechanism doesn't know about presets).

## Preset-selector UI (#178)

Five `TapButton` instances in a single horizontal row above the slider
rack, at `y = 1.30`, centered on `x = 0` with `0.13 m` horizontal pitch
(span 0.52 m; columns at `[-0.26, -0.13, 0, 0.13, 0.26]`). Always
visible — five archetypes is small enough to live on screen at all
times (the quadrics manipulator's 8-preset rack needed an
expand/collapse chevron; here that machinery would be friction without
payoff).

Button visuals mirror the manipulator's `Preset` primitive
(`src/scaffold/ui/Preset.ts`) — cool-blue base, label below the
button, smaller font than `SectionTab` — **plus** sticky-active
emissive. Saddle-extrema's preset is a persistent mode (the surface IS
the preset's `f`); the manipulator's `Preset` deliberately omits
`activeEmissive` because its presets are one-shot snap-to-pose
affordances. Different semantic → different visual contract.

`Preset` (the scaffold class) couples its API to quadrics-coefficient
`values: PresetValues = [number, number, number, number]`, so this
scene uses `TapButton` directly rather than the `Preset` subclass.
Generalizing `Preset` to a typed payload would touch the manipulator
for one new consumer and the rule-of-three threshold hasn't been
crossed (scaffold's `Preset` is consumer #1; saddle-extrema is
consumer #2). Defer scaffold extraction to consumer #3.

### Apply-preset semantics

When a preset button activates:

1. Press flash fires (TapButton-internal feedback).
2. Previous active preset's button → inactive; new preset's button → active.
3. Old `graphSurface.mesh` removed from the exhibit group, then disposed.
4. New `graphSurface` constructed with the new preset's `f` / `gradF` /
   `domain`, added to the group.
5. `xSlider.setRange(...)` and `ySlider.setRange(...)` update slider
   domains; current values clamp into the new range and re-apply snap.
6. Indicator + labels pick up the new active preset's `f` on the next
   `update()` tick via the `PRESETS[activePresetIndex]` lookup.

No tween between preset surfaces. The active `f` changes
fundamentally between presets (different polynomial families,
different domains), so a coefficient-tween — what the manipulator does
between its presets — is meaningless here. Instant swap also matches
the lesson: each preset shows one archetype.

Slider values carry over across preset switches (clamped into the new
domain). A student comparing min vs. saddle at the same `(x, y)` point
sees the local-shape difference; forcing reset to `(0, 0)` on each
switch would hide that pedagogy.

Tapping the already-active preset is a press-flash-only no-op (no
surface rebuild).

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

Custom **`ShaderMaterial`** reproducing the cluster's exact lighting
formula `uBaseColor * (0.2 + 0.8 × max(dot(n, L), 0))` under the
scene's `AmbientLight(0xffffff, 0.4)` + `DirectionalLight(0xffffff,
0.8)` (the directional light is decorative — `ShaderMaterial` doesn't
auto-bind scene lights; the world-space `uLightDir` uniform drives the
lambert directly). Vertex shader uses `mat3(modelMatrix) * normal`
(not `normalMatrix * normal`) to keep the normal in world space,
matching the world-space `uLightDir` and the cluster's `DoublePlane.ts:52`
precedent.

```glsl
// Vertex
varying vec3 vNormal;
void main() {
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

### Material history (why ShaderMaterial, not MeshStandardMaterial)

The v1/v2 plan initially specified `MeshStandardMaterial({metalness: 0,
roughness: 0.6})` as the default with the ShaderMaterial above as a
"if smoke trips, swap to this" fallback (Sonnet #2 + DeepSeek #2 from
the v1 roundtable both flagged the parity risk). **In-headset smoke on
PR #182 confirmed the trip:** the saddle read as visibly off-white
under PBR's Cook-Torrance BRDF + PBR ambient injection, while the
cluster siblings (raymarched via `ImplicitSurface.ts`'s hand-rolled
lambert) read as a clear light blue. The plan's pre-coded fallback is
what ships in #176.

The shader is identical in math to what the cluster's raymarched
siblings use in their per-fragment `shadeHit(...)` — the only
difference is that here it runs at the vertex-interpolated normal
stage rather than at per-fragment ray-march hit points. Visual parity
across the cluster is the design goal.

## Domain framing + spatial-footprint

The cluster's `BOUND = 3.0` is the **AABB half-extent**. Sibling
raymarched surfaces live inside a BoxGeometry of side `2 × BOUND = 6 m`,
spanning world-X `[-3, 3]`, world-Y `[-1.5, 4.5]` (centered on
`SURFACE_CENTER.y = 1.5`), world-Z `[-7, -1]` (centered on
`SURFACE_CENTER.z = -4`).

Each preset's `domain` (see "Preset library" above) sizes the rendered
surface to fit comfortably inside the cluster envelope. The starter
saddle on `[−1.5, 1.5]²` uses **half** the cluster's per-axis x/y
extent (3 m × 3 m, vs. the cluster's 6 m × 6 m). The saddle's z-range
`[−2.25, 2.25]` is inside the cluster's half-extent; the bottom corner
sits at world-Y `= -0.75` (below `SURFACE_CENTER.y` by 2.25 m). The
cluster doesn't render a floor and gradient-levels' family extends
arbitrarily along ±math-Z too, so visually consistent with cluster
convention.

Per-preset domains are tabulated in the "Preset library" section
above and are revisited in-headset; iterate if any preset reads too
small or too tall.

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

## Out of scope (v0.8 beyond #178)

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
