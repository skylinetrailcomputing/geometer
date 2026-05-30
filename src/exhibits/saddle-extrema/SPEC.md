# `saddle-extrema` exhibit — SPEC

> Math + UX contract for the saddle / extrema classification scene.
> v0.8 cuts: #176 registers the fourth cluster member, introduces a
> new meshed graph-surface rendering primitive, and ships one locked
> starter preset (`z = x² − y²`). #177 adds (x, y) point selection;
> #178 expands the preset library to five archetypes + adds `hessF`
> to the preset record + ships the preset-selector UI; #181 ships the
> live Hessian + classification readout; #179 adds critical-point
> markers + `criticalPoints` on the preset record; #180 ships the
> local-quadratic-approximation overlay (the §11.7–11.8 punch line).

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
- `criticalPoints: readonly [number, number][]` — analytically-known critical points (`∇f = 0`) in math-frame `(x, y)`. v0.8 entries are all `[[0, 0]]`; consumed by #179's markers, not by #178 / #181.

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

## Classification readout (#181)

Live three-line readout above the preset row (`READOUT_POSITION = (0,
1.50, -0.7)`) showing the symmetric Hessian entries, the
discriminant, and the second-derivative-test verdict at the
slider-selected `(x, y)`:

```
line 1 (top): f_xx = ±N.NN   f_xy = ±N.NN   f_yy = ±N.NN
line 2 (mid): D = ±N.NN
line 3 (bot): <verdict>
```

Verdict is one of `local min` / `local max` / `saddle` /
`inconclusive`. Branches per §11.7–11.8:

- `D > 0` and `f_xx > 0` ⇒ local min.
- `D > 0` and `f_xx < 0` ⇒ local max.
- `D < 0` ⇒ saddle.
- `|D| < ε` (default `1e-9`) ⇒ inconclusive (test failure; higher-
  order terms determine the shape).

`f_xx` and `f_yy` are tinted with the cluster's math-X / math-Y axis
colors (vermillion / bluish-green) to reinforce "pure-x² / pure-y²
term"; the cross term `f_xy` stays white to read as "neither pure
axis." `D` and the verdict use YELLOW — the same accent the
gradient-levels readout (#166) uses for `|∇f|`.

### Always-on at any (x, y) (not just critical points)

Strictly the second-derivative test classifies *critical* points —
at a non-critical point the linear term dominates and "local min /
saddle / ..." isn't a well-formed claim about the surface there.
The readout displays the Hessian-based verdict at whatever `(x, y)`
the sliders select anyway, mirroring the always-on local-quadratic
overlay's (#180) approach: this is "what *would* the local shape be
IF this were a critical point." The interpretation that the verdict
only *applies* at a critical point is a SPEC-level claim, not a
runtime gate on the display.

Pedagogical payoff: the student steps `(x, y)` toward the origin on
the monkey saddle preset and watches `D` cross zero as the local
shape transitions — visualizing the test's failure mode rather than
memorizing it as a footnote. Pure formatting + classification logic
lives in `formatSaddleExtremaReadout.ts`, covered by
`test/exhibits/saddle-extrema/formatSaddleExtremaReadout.test.ts`.

### Layout sizing

Slot widths are sized to worst-case preset values within the
slider-reachable domains:

- Hessian entries: `NUMERIC_ENTRY_EM = 3.2` fits `−12.00` (quartic
  at domain corner `(1, 1)`: `f_xx = 12`).
- D: `NUMERIC_D_EM = 4.2` fits `−103.68` (monkey saddle at domain
  corner `(1.2, 1.2)`: `D = -36·(x² + y²) ≈ -103.68`).

`SYNC_INTERVAL_MS = 33` throttles troika-Text `.sync()` calls to
≈30 Hz, mirroring `GradientLevelsReadout` / `TangentPlaneReadout`.
Per-slot string caching skips the write entirely when the formatted
string hasn't changed.

## Critical-point markers (#179)

Each preset declares its critical points analytically via
`criticalPoints: readonly [number, number][]` on the preset record;
#179 renders one small marker per CP at `(x_c, y_c, f(x_c, y_c))` on
the graph surface so the student can navigate the `(x, y)` sliders to
a known-interesting location and watch the local shape change.

All v0.8 presets declare exactly `[[0, 0]]` — every critical point sits
at the origin, per the cluster-shared pedagogical observation above.
The shape `readonly [number, number][]` is forward-looking so a future
preset with off-origin or multiple CPs drops in without an interface
change.

### Visual treatment

Small YELLOW sphere (radius `0.024 m`) at each CP, lit
`MeshStandardMaterial`. The marker is deliberately smaller than the
selected-point indicator's `0.04 m` off-white sphere (≈60% the
diameter) — the lesson is the *shape*, not the marker (#179 issue
text). YELLOW continues the cluster's accent convention for
"important math fact at a point" (gradient arrow #165, `|∇f|`
numeric #166, `D` + verdict in the classification readout #181); the
size + color contrast against the indicator keeps a side-by-side
reading unambiguous.

When the user navigates the indicator to a critical point, the
indicator's larger off-white sphere nests over the marker — reading as
"you've reached the critical point." The classification readout (#181)
confirms the arrival with the live `D` + verdict.

### Lifecycle

Markers are built whole-cloth from `preset.criticalPoints` on mount and
rebuilt on every preset swap — mirrors the `graphSurface` swap pattern
in `applyPreset`. No per-frame update is needed (the active preset's
critical points are analytically fixed for the preset's lifetime); the
helper exposes `{ group, dispose() }` only. Geometry + material are
shared across all markers of one preset and disposed once per swap.

### Out of scope for #179

- **Slider snap-detents on the critical points.** ~~Visual-only per the
  issue. … critical-point-aware snap is a quadric-tuned scaffold knob
  and defers to v0.9 polish.~~ Landed in v0.9 via #200: the slider's
  `snapPoints` array is now rebuilt on every preset swap from
  `preset.criticalPoints` (projected per axis, origin always seeded).
  Visible behavior is unchanged for every v0.8 preset (all CPs at
  origin → projected snap set is `[0]` per axis), but the mechanism is
  in place for future off-origin presets. `Slider` grew the
  `setSnapPoints` method and a shared `validateSnapPoints` validator
  that the constructor also routes through.
- **Numerical critical-point solver.** Preset-supplied analytical CPs
  only.

## Quadratic overlay (#180)

The §11.7–11.8 *pedagogical* punch line of the scene. At the slider-
selected point `(x₀, y₀)`, a second graph surface hugs the main one,
rendered as the second-order Taylor expansion of the active preset's
`f`:

```
q(x, y) = f(x₀, y₀)
        + f_x(x₀, y₀)·(x − x₀)
        + f_y(x₀, y₀)·(y − y₀)
        + ½·[ f_xx·(x − x₀)²
            + 2·f_xy·(x − x₀)·(y − y₀)
            + f_yy·(y − y₀)² ]
```

Two cases the overlay makes literal:

- **At a critical point**, the linear term vanishes and the overlay
  IS the local quadratic — bowl up (min), bowl down (max), saddle, or
  the degenerate flat plane (`monkey-saddle` / `quartic-min`, where
  the Hessian vanishes and the quadratic collapses to a constant).
- **Away from a critical point**, the linear term tips the overlay
  into a curved tangent-shaped patch. Reading the overlay as "linear
  plus a little curvature" makes the second-derivative test's
  domain-of-validity legible.

Always-on (mirrors tangent-planes #148; toggle UI deferred to v0.9 if
the always-on read is cluttered in-headset).

### Primitive — `TaylorOverlay.ts`

A new same-scene helper distinct from `GraphSurface.ts`. The main
surface is *built once per preset* (opaque cluster-lambert
ShaderMaterial); the overlay is *mutated every frame* (translucent
body+rim shader). The two lifecycles + materials + domains differ
enough that a shared primitive would compromise both call sites.
`TaylorOverlay` reuses only the math-frame helpers
(`writeGraphPointToWorld`, `writeMathToWorld`) — `GraphSurface`
deliberately designed those as cross-consumer.

Scaffold extraction to `src/scaffold/` is deferred per the
extract-on-second-consumer rule. The overlay is consumer #1 of "per-
frame mutating graph surface"; a future ODE phase-portrait scene may
trigger extraction in v1.x.

### Neighborhood size

Per-preset half-extent = `25% × min(domain x-range, domain y-range) / 2`:

| Preset | Domain | Half-extent |
|---|---|---|
| `paraboloid` / `inv-paraboloid` / `monkey-saddle` | range 2.4 | 0.30 |
| `saddle` | range 3.0 | 0.375 |
| `quartic-min` | range 2.0 | 0.25 |

Min-of-range keeps the patch square in math coords (uniform rim band
on all four edges, no stretched-rect look). At origin pose the patch
is well inside every preset's domain.

**No clamping at slider edges.** When `(x₀, y₀)` is near a corner,
the overlay extends past the main surface's edge. The Taylor
approximation is defined on all of ℝ²; the floating-past-edge read is
a feature, not a bug. Symmetric edge-shrink is the v0.9 escape hatch
if smoke flags this read poorly. `quartic-min` at `(0.9, 0)` is the
worst case (flat overlay, right half floating); explicitly smoke-
checked.

### Tessellation — `res = 49`

Odd resolution so the center vertex `(u = v = 0)` lands exactly at
the middle index. With `res = 49`, that's index `24` in both `i` and
`j`, flat index `1200`. Vertex spacing on the saddle preset (the
largest half-extent): `2·0.375 / 48 ≈ 15.6 mm` in math coords; on the
quartic: `2·0.25 / 48 ≈ 10.4 mm`. Smooth at any headset distance.

Even resolutions (e.g., 48) would put the center between vertices,
defeating the "overlay center IS the indicator" visual claim by a
small linear-interpolation error and breaking the center-vertex
tests.

`49² = 2401` vertices ⇒ ~58 KB of position + normal buffer writes per
frame. Negligible for Quest 3; well under the main surface's 16384-
vertex one-time build.

### Per-frame update path

`setPose(x0, y0)` reads the active preset's `f`, `gradF`, `hessF` at
`(x0, y0)`, then walks the `res × res` grid in `(u, v)` and writes
positions + normals into the existing typed arrays. `position` and
`normal` BufferAttributes are marked `needsUpdate = true`; `aLocal`
(the math-frame `(u, v)` attribute, used by the fragment shader for
rim distance) is unchanged on the per-frame path.

Math-frame normal at `(u, v)`: the overlay surface is the graph of
`q`, an implicit surface `{ z − q(x, y) = 0 }`, whose gradient is
`(−q_x, −q_y, 1)`. Since `u = x − x₀` and `v = y − y₀`,
`q_x = ∂q/∂u = f_x + f_xx·u + f_xy·v` and `q_y = ∂q/∂v = f_y + f_xy·u
+ f_yy·v`.

Two scratch `Vector3` objects (one for position, one for normal) are
allocated once and reused across all `res²` iterations — same as
`GraphSurface.ts:155-156`. Merging into a single scratch would
clobber position before it lands in the typed array on each iteration.

### Render

Translucent body + brighter rim, sky-blue per the locked #113 visual
language. Same body / rim colors and alphas as `TangentPlane.ts` and
`SlicingPlane.ts`; rim width tighter (0.015 m on a ~0.30 m half-
extent gives a 5% rim-to-half-extent ratio, vs. the slicing-plane's
1.7%).

Two adaptations from the flat-rect precedent:

1. **`aLocal` vec2 attribute.** `TranslucentRect.ts` reads
   `position.xy` for the rim-distance computation because its mesh is
   an axis-aligned plane geometry. The overlay's `position` is in
   world space (lifted via `writeGraphPointToWorld`), so a separate
   `aLocal` attribute carries the math-frame `(u, v)` directly to the
   fragment shader.
2. **Subtle lambert on the body** (`color = uBodyColor × (0.6 + 0.4 ·
   max(dot(n, L), 0))`). A flat-lit translucent curved surface reads
   as a uniform tint that hides the bowl / saddle / flat curvature
   that's the whole reason for the overlay. Low-amplitude lambert
   (vs. the main surface's `0.2 + 0.8·dot`) makes curvature legible
   without competing with the main surface for "solid surface"
   presence. The rim stays flat (lambert applied only to body) so the
   patch boundary stays uniform regardless of surface tilt.

### Material flags

```ts
transparent: true,
depthWrite: false,
side: THREE.DoubleSide,
polygonOffset: true,
polygonOffsetFactor: -1,
polygonOffsetUnits: -1,
```

`renderOrder = 1` on the mesh (renders after the opaque main
surface).

**Why `polygonOffset` ships day one.** For the three exact-quadratic
presets (`paraboloid`, `inv-paraboloid`, `saddle`), the second-order
Taylor approximation IS the surface across the entire patch (no
truncation error). The overlay coincides with the main surface in
*thousands of fragments*, not just at the center vertex. Without
`polygonOffset` the GPU's tie-breaking is implementation-defined and
the result is z-fighting. Negative factor + units shift the overlay's
depth toward the camera so coplanar fragments consistently pass the
depth test on top.

### Occlusion contract

`depthWrite: false` means the overlay does NOT write to the depth
buffer; it still *reads* depth. So:

- **Behind the main surface**: overlay fragments fail the depth test
  → not drawn. Correct (back half hides behind front half).
- **In front of the main surface**: overlay fragments pass → alpha-
  blend over the main surface. Correct (translucent tint + rim halo).
- **Coplanar with the main surface**: `polygonOffset` shifts depth
  toward camera; overlay consistently passes the depth test.
- **In front of the opaque indicator / CP marker**: overlay alpha-
  blends over them. Indicator (off-white) shows as slightly bluer
  off-white sphere; CP marker (yellow) shows as slightly cyan yellow
  — both still distinct.
- **Behind the indicator / CP marker**: overlay fails the depth test
  against the marker's opaque depth → marker reads on top of overlay
  in those pixels.

### Buffer + culling

`position` and `normal` BufferAttributes use
`setUsage(THREE.DynamicDrawUsage)` — driver hint that these buffers
are written every frame. `aLocal` stays `StaticDrawUsage` (only
rewritten on preset swap, cadence ~seconds).

`mesh.frustumCulled = false`. Three.js doesn't auto-invalidate the
cached bounding sphere when position attributes are marked
`needsUpdate`; per-frame position writes leave the cached bounds
stale. The overlay is small and anchored near `SURFACE_CENTER` (which
is always in view by cluster framing), so frustum culling on it never
pays for itself anyway. Pinned by Vitest so a future "performance
cleanup" can't silently re-enable it.

### Lifecycle

Built once at mount with the initial preset. On preset swap
(`setPreset(preset, x0, y0)`):

1. Cache the new preset reference.
2. Recompute `halfExtent` from the new preset's domain.
3. Rewrite the `aLocal` typed array; mark `aLocalAttr.needsUpdate`.
4. Update the `uHalfExtent` uniform so the rim shader's smoothstep
   comparator agrees with the new local-coords range.
5. Refresh positions + normals at the (possibly clamped) slider
   values so the next frame doesn't render the prior preset's shape.

Disposed once at unmount: dispose `geometry` + `material`. No shared
resources with the main `graphSurface` mesh.

## Out of scope (v0.9+)

- **Toggle UI for overlay on/off.** Deferred to v0.9 polish iff the
  always-on read is cluttered in-headset.
- **Symmetric overlay-shrink near domain edges.** v0.9 escape hatch
  if smoke shows the floating-past-edge read as a bug rather than a
  feature (especially on `quartic-min` at `(0.9, 0)`).
- **`GraphSurface` extraction to `src/scaffold/`.** Deferred until a
  second scene wants the primitive (likely v1.x). The overlay in #180
  is a same-scene consumer; doesn't count for the extract-on-second-
  consumer rule.
- **`TaylorOverlay` extraction to `src/scaffold/`.** Same posture —
  consumer #1; a future ODE phase-portrait scene may trigger
  extraction.
- **Numerical critical-point solver.** Preset-supplied analytical
  critical points only.
- **User-supplied `f(x, y)`.** Strong long-term motivator for the
  primitive's design; input UX is its own scope (v1.x+).
- **Runtime `f` / `gradF` non-finite-value validation.** v0.8 presets
  are all polynomials; sampling validation is over-engineering against
  a deferred risk.
- **Higher-order Taylor (cubic +).** Second-order is the §11.7–11.8
  lesson; cubic would address the monkey-saddle and quartic-min
  degenerate cases but the visual machinery doubles in size and the
  pedagogical lift is unclear.

## Design-language alignment (#201)

Scene inherits the quadrics-locked design language with two
intentional pedagogy-driven exceptions (TaylorOverlay rim width and
Lambert shading — see below). Rules live in
`scaffold/design/tokens.ts`'s header.

**Scaffold tokens consumed (post-#201):**

- `scaffold/render/translucentRectTokens.ts` (PR 1) —
  `TaylorOverlay`'s body / rim colors and alphas come from the
  locked #113 recipe; rim width is scene-local (see exceptions).
- `scaffold/ui/readoutTokens.ts` (PR 2) — `SaddleExtremaReadout`'s
  font size, line pitch, outline, and 30-Hz sync throttle.
- `scaffold/ui/clusterRackTokens.ts` (PR 4) — rack center (via
  `createSliderRackCenter()`), row pitch, snap detent, grab-radius
  multiplier, and per-slider label (#170) layout.
- `scaffold/ui/Preset.ts` (PR 6) — preset row uses `Preset` with the
  new `activeEmissive` option for sticky-active behavior.

**Readout visibility-bootstrap policy:** `SaddleExtremaReadout`
boots `group.visible = false` and uncloaks on the first `setValues`
call. Adopted during the initial-mount design in #181; matches the
cluster-wide policy locked in #201 PR 3.

**Documented exceptions:**

- **Axis-colored slider thumbs.** x and y are direct math-frame
  axis-coordinate selectors — the indicator's `(x, y)` IS the slider
  values. Per the slider tint rule, axis-coordinate sliders get the
  axis tint: x → VERMILLION, y → BLUISH_GREEN. Matches quadrics'
  pattern; departs from tangent-planes / gradient-levels' neutral
  gray (those sliders are point selectors / family parameters, not
  axis coordinates).
- **TaylorOverlay rim width 0.015 m** vs. the scaffold default
  `LOCKED_113_RIM_WIDTH_DEFAULT = 0.05` m. The overlay's half-extent
  is ~0.30 m (vs. ~3.5 m for the slicing planes); a 0.05 m rim on
  the smaller patch dominates the curvature read this overlay is
  designed to teach. Pedagogy-driven exception, documented at the
  override site (`TaylorOverlay.ts` near `OVERLAY_RIM_WIDTH`).
- **TaylorOverlay Lambert shading on body.** Body has subtle
  ambient (0.6) + diffuse (0.4) shading so curvature reads. The
  cluster's flat translucent overlays (SlicingPlane, TangentPlane)
  are flat-lit. The overlay's purpose is teaching local *shape*
  (bowl up / bowl down / saddle / degenerate); flat-lit reads as a
  uniform tint that hides the very shape the overlay teaches.
- **Sticky-active preset row.** Saddle-extrema's presets are
  persistent surface-family selectors (the surface IS the preset's
  f), not one-shot snaps like quadrics'. `Preset` constructed with
  `activeEmissive: 0x66ccdd` (#201 PR 6); scene drives
  `setActive(true)` on tap and `setActive(false)` on the previously-
  active sibling.

### Staging (#238 / E1.1)

Floor: shared `StageFloor` primitive from `scaffold/staging/`,
cluster-default `outerHalfExtent: 5` (10 × 10 m). Rectangular cutout
sized to `±STAGE_CUTOUT_HALF` (`kind: 'rect'`, centered on
`SURFACE_CENTER.xz`); reads as the math-frame domain envelope
projected onto the floor, per Path A1 (cutout-as-projection-aperture).
`STAGE_CUTOUT_HALF` is **derived at module scope** from `PRESETS` —
`Math.max(...presets' domain half-extents)` — so a future preset
with a wider window automatically widens the cutout at mount.
Today's value evaluates to `1.5` (driven by the `saddle` preset at
`±1.5`). The cutout reaches world Z = −5.5, just past the floor's
−Z edge at −5; strip clamp truncates to the floor edge, so the
floor visibly opens to the back of the exhibit. Static at mount —
does not resize on preset change. Three of five presets (inv-
paraboloid, saddle, monkey-saddle) dip below floor; the other two
(paraboloid, quartic-min) sit above.

Outer railing (#223 / E1.2): shared `StageRailing` primitive from
`scaffold/staging/`. **`backExtension: 3` (v3 — PR #244 smoke
feedback):** cluster-uniform value matches quadrics + gradient-levels;
the widest preset (`saddle` at `±1.5`) reaches `Z = -5.5`, 2.5 m
margin to the extended back at z=-8. 4 corner posts + 4 top-rail
tubes; height 0.9 m; color `0x3a3a55`. See
`_private/plans/223-illusory-railing.md` §3.5.

Inner railing (#223 v3): shared `StageInnerRailing` primitive, rect
path. 4 corner posts at the cutout corners + 4 perimeter tubes.
Static at mount — sized to the widest preset domain, same as the
floor cutout.

**`CUTOUT_VISUAL_MARGIN = 1.05` (v4 — PR #244 follow-up smoke).**
Cutout half-extents (and consequently the inner railing perimeter)
are scaled 1.05× outward from `SURFACE_CENTER.xz`, so the `saddle`
preset's `x² − y²` surface — which reaches the full
±STAGE_CUTOUT_HALF domain — has a small annular breathing margin
between math and railing. Other presets at narrower domains get
the same margin scaled appropriately.

### Staging — Control plinth (#225 / E1.4)

Interactive UI (x / y sliders + per-slider labels + 5-preset row +
classification readout + math-frame axis indicator) lifts onto the
cluster-shared `createPlinth` primitive from
`src/scaffold/staging/Plinth.ts`, matching quadrics' PR1 ship and
the master plan (`_private/plans/225-control-plinth.md` §4.2 PR2 /
`251-cluster-on-plinth.md` §3.3). Drafting-table-console silhouette
anchored at world `(0, 0, -2.05)` as of #263 — derived per-scene
by `composeClusterStagePose(cutoutDescriptor)`. Saddle-extrema's
preset-driven envelope (`STAGE_CUTOUT_HALF ≈ 1.5 × CUTOUT_VISUAL_
MARGIN = 1.575`) puts the railing-front edge at z ≈ -2.425, ~2.1 m
closer to the user than quadrics'; the plinth slides forward to
keep the body-back / railing-tube clearance at 0.045 m. Working-
surface depth = `Plinth.ts` default 0.5 m: the 2-slider rack fits
comfortably in slot-Y ∈ [0.205, 0.345]; the 5-preset row and
3-line readout deliberately float above the back edge at slot-Y >
0.5, mirroring quadrics' preset-grid + classifier pattern. The
per-scene pancake spawn `(0, 1.6, 1.6)` and VR offset `(0, 0,
-0.6)` ride on the registered `Exhibit.stage` metadata.

Every UI primitive's `group` is reparented under `plinth.group` via
the slot manifest in `mount()`; positions are slot-local (11 slots
total: 2 sliders + 2 labels + 5 presets + 1 readout + 1 world-axes).
Slot manifest:

- **x slider** (top row) at slot-local `(0, 0.345, 0)`.
- **y slider** (bottom row) at slot-local `(0, 0.205, 0)` —
  inter-slider distance 0.14 m, matching the pre-plinth
  `X_SLIDER_Y - Y_SLIDER_Y = 0.14 m` straddle.
- **Per-slider labels** at slot-local
  `(SLIDER_LABEL_X_OFFSET, sliderY, 0)` for each row.
- **Preset row** of 5 buttons at slot-local
  `(PLINTH_PRESET_ROW_START_X + i * PLINTH_PRESET_COL_PITCH, 0.55, 0)`
  for `i ∈ [0, 4]` — columns at slot-X ∈ {-0.26, -0.13, 0, 0.13,
  0.26} with cluster pitch 0.13. Just above the back edge at
  slot-Y = 0.5, mirroring quadrics' 2 × 4 preset-grid pattern
  simplified to one row.
- **SaddleExtremaReadout** at slot-local `(0, 0.70, 0)` — above the
  preset row; mirrors quadrics' `PLINTH_RACK_LABEL_Y = 0.74`
  row-above-content pattern.
- **WorldAxes** at slot-local `(0.42, 0.275, 0)`, `orientation:
  'world'` — keeps the math-frame X/Y/Z arrows aligned to the math
  frame regardless of plinth tilt.

**Math-object affordances stay in world frame.** `graphSurface.mesh`,
`criticalPointMarkers`, `taylorOverlay.mesh`, and `indicator` are
children of `ctx.group`, never reparented under `plinth.group`. The
`applyPreset()` rebuild (which swaps `graphSurface` /
`criticalPointMarkers` / `taylorOverlay` on preset change) operates
on `exhibitGroup`, not on the plinth — the sliders themselves stay
reference-stable under `plinth.group` across preset swaps, with
`setRange` / `setSnapPoints` adjusting their internal state in
place.

**Readout billboard carve-out.** `SaddleExtremaReadout` overwrites
`group.rotation` every frame via `faceCamera`, so the slot's default
`'surface'` orientation is documentation-only — the readout yaw-
billboards regardless.

**Grab radius.** All interactive primitives (two sliders + five
presets) use `GRAB_RADIUS_MULTIPLIER_PLINTH = 1.5` from
`scaffold/ui/clusterRackTokens.ts`. The pre-plinth mid-air `2.75`
constant was deleted at PR2 (#251) once all four cluster scenes
ported onto the plinth.

## Plinth panel-backing (#252)

`SaddleExtremaReadout` extends the shared `PanelReadout` base
(`scaffold/ui/PanelReadout.ts`) which contributes the cluster-shared
THREE.Group + boot-cloak + per-frame yaw `faceCamera` + dark
`MeshBasicMaterial` back-plate quad.

Per parent plan #225 §3.5 v3 lock (option-c), the back-plate is a
child of the readout's group, inheriting the yaw-billboard
transitively — panel + text face the user together.

**Panel dimensions:** `READOUT_PANEL_HALF_WIDTH_SADDLE_EXTREMA =
0.325 m`, `READOUT_PANEL_HALF_HEIGHT_SADDLE_EXTREMA = 0.090 m`.
Computed from worst-case top line `3 × PREFIX_ENTRY_EM (3.5) + 3 ×
NUMERIC_ENTRY_EM (3.2) + 2 × TOP_ENTRY_GAP_EM (1.2) = 22.5 em ×
0.028 = 0.630 m`, half + 0.012 m padding = 0.327 → 0.325. Three-line
layout (`topY = +LINE_PITCH`, `midY = 0`, `bottomY = -LINE_PITCH`)
drives the 0.090 m half-height; vertical span 0.12 m + glyph +
padding. The verdict ('inconclusive' worst case, anchorX:'center',
not em-slot-allocated) is comfortably narrower than the top line.
Envelope test in `test/scaffold/ui/PanelReadout.test.ts` locks
against formatter drift. Bracket [0.320, 0.345]; smoke-tunable.

**Cloak normalization (#252 §3.6).** SaddleExtremaReadout's
`setValues()` was restructured at PR3 to match the
Equation/TangentPlane pattern — added a `hasBootstrapped: boolean`
field, replaced the pre-throttle uncloak with a post-`.sync()` block
guarded by `hasBootstrapped`, and gated the throttle return with
`this.hasBootstrapped && ...` so the first call always paints.
Without this, the dark back-plate would render BEFORE the numeric
Text geometries resolve on first uncloak.
