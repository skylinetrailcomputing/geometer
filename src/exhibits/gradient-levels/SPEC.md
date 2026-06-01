# `gradient-levels` exhibit — SPEC

> Math + UX contract for the gradient + level-surfaces scene. v0.7 cuts:
> #163 registered the third cluster member with a single k slider
> sweeping { f(x, y, z) = k } across the canonical hyperboloid family;
> #164 added θ/φ point selection on the active level surface; #165 added
> the gradient arrow at the selected point; #166 added the live ∇f / |∇f|
> readout; #167 added the numeric k label.

## Goal

An interactive WebXR scene where the learner drags a single slider — k —
to sweep the level surface `{ f(x, y, z) = k }` of a fixed quadric `f`.
The surface deforms continuously as k slides, traversing pedagogically
rich poses of the family. Anchors the "level surfaces are the 3D contour
family of f" intuition for APPM 2350 §11.6 (Directional Derivatives and
the Gradient Vector).

Sibling of `quadrics` and `tangent-planes` in the `calculus3` cluster;
the SceneRack swaps between them at runtime.

## Equation form

The surface is the level set of `f(x, y, z) = x² + y² − z²` in math
coordinates (math-X right, math-Y forward, math-Z up). The level value
`k` is the only editable parameter; coefficients `(a, b, c) = (1, 1, −1)`
are fixed for v0.7.

Coefficient editability is **out of scope for v0.7** by deliberate
choice (not by accident):

- The §11.6 pedagogy goal is internalizing what the *level-surface
  family* `{ f = k }` is — a continuously-parameterized family that
  traverses a topology change as k crosses zero. That story is told by
  one f and a k slider; varying f competes with the quadrics
  manipulator's "morph the surface family" story.
- Sibling scenes should differ in what they teach, not duplicate the
  surface UI.

The world-frame GLSL maps math-Z → world-Y so the negative term lands
on `p.y²` in the shader; the family then opens vertically (along
world-up), matching textbook §11.6 diagrams. The math-frame substitution
(math-X = world-X, math-Y = −world-Z, math-Z = world-Y) is documented
in the GLSL chunk in `index.ts`.

## Level-surface family

Three textbook poses live inside the slider's range:

- `k = +1` — canonical 1-sheet hyperboloid (single connected piece,
  opens along ±math-Z = world-up).
- `k = 0` — double cone with apex at the origin; the family's
  topology-transition point.
- `k = −1` — canonical 2-sheet hyperboloid (two disconnected sheets
  along ±math-Z).

The k = 0 transition *is* the §11.6 punch line — students watch a
single connected surface pinch to a cone and split into two sheets in
one continuous slider motion.

## k slider model

Mirrors the cluster siblings' detent contract: the emitted value snaps
inside each detent's half-width while the underlying accumulator
integrates hand motion freely (slow drags escape snaps naturally).

- Range: `k ∈ [−2, 2]`.
- Initial value: `K_INITIAL = +0.5`. Positive (default 1-sheet
  hyperboloid for the §11.6 pedagogy), off the cone singularity, off
  every snap point — so the user sees immediate continuous response in
  either drag direction on first load.
- `snapDetent` half-width: 0.05 (matches cluster siblings).
- Snap points: `[−1, 0, +1]` — the three textbook poses above.

`K_INITIAL` is the single source of truth for the boot-time k value:
the surface uniform `uK` is seeded with it via `extraUniforms`, and the
slider's `initial` references the same constant. If they ever drift,
the boot pose would visibly snap on the first `update()` tick; smoke at
boot catches it.

Slider visuals: neutral light gray base color (`0xaaaaaa`), sphere thumb
shape — k is a scalar level value, not an axis-aligned parameter, so
neither an axis tint nor an arrow thumb would carry meaning.

## Per-slider labels (#170 — supersedes the original #167 k label)

All three sliders (θ, φ, k) carry a two-line billboarded label
right-anchored ~0.05 m left of each slider's track-end (0.025 m
clearance to the thumb at slider min). The primary line shows the
variable name; the secondary line shows the live value. Same
visual shape across the three sliders; each label spans roughly
0.10 m vertical with 0.034 m of breathing room between adjacent
rows in the 3-row rack.

**Angular sliders (θ, φ):** value rendered via the snap-aware
`scaffold/ui/formatAnglePiFraction(rad, snapPoints)`. Textbook
π-fraction glyph (`π/2`, `−π/4`, `0`, `π`) ONLY when `rad` is in
the slider's actual snap set; otherwise `Xπ` decimal (`0.33π`,
`−0.80π`). Gating on the per-slider `snapPoints` is what
distinguishes a true snap-detent commit from an off-snap value
that happens to equal a standard π-fraction (e.g., `PHI_INITIAL =
π/4` with the φ slider's snap set `[-π, -π/2, 0, π/2, π]`
renders as `0.25π`, not the false-snap `π/4` glyph).

**k slider:** value rendered via a local `formatLinearDecimal`
helper at the top of `index.ts` — non-negative values without a
leading sign (`0.50`, `1.00`, `0.00`); negatives prepend U+2212
MINUS (`−1.00`). 2-decimal precision via `.toFixed(2)`, matching
the cluster's signed-numeric glyph convention. Helper is local;
extract-on-third-use deferred (only call site).

**History.** #167 originally introduced the k label as a one-line
`k = N.NN` readout below the k slider at y = 0.70. #170 unified
it with the new θ/φ labels: same two-line shape, same per-row
left-of-track right-aligned anchor — frees the y = 0.70 slot.

## Point parameterization (#164)

Two angular sliders (θ, φ) aim a ray from the surface center; the
indicator is the first forward intersection with the active level
surface. Math frame (X right, Y forward, Z up):

- `θ ∈ [0, π]` — polar angle from +math-Z (up). Snap detents at
  `[0, π/2, π]` (north pole, equator, south pole).
- `φ ∈ [−π, π]` — azimuth in math-XY plane from +math-X. Snap
  detents at `[−π, −π/2, 0, π/2, π]` (the four cardinal compass
  directions plus the wrap-equivalent ±π).
- Direction: `(sin θ cos φ, sin θ sin φ, cos θ)` via the shared
  `scaffold/math/directionFromAngles` helper.
- Slider range is **closed (non-wrapping)** — `±π` are distinct
  slider positions even though they map to the same direction.

Mirrors `tangent-planes`' point-selection convention (#147 §3.2)
verbatim — the math-frame routing is shared scaffold infrastructure.

## Initial pose (#164)

`θ₀ = π/3, φ₀ = π/4` — off both poles AND off every snap point,
in the equator band that hits the 1-sheet hyperboloid for the
default `K_INITIAL = +0.5`. Concrete check: `t² · cos(2π/3) = −0.5`
⇒ `t = 1`; point ≈ (0.612, 0.612, 0.5) — well inside `BOUND = 3.0`.
On first load both sliders read responsive in either drag direction.

## Indicator (#164)

A small `MeshStandardMaterial` sphere (~0.04 m radius, neutral light
gray `0xdddddd`). Verbatim port from tangent-planes for cluster-sibling
visual consistency.

## Miss-hide policy (#164) — geometry vs raycaster policy

The indicator is visible only when `raycastImplicit` returns a hit;
otherwise hidden. This is a deliberate choice (Option A in the #164
plan) over re-projection (Option B) — the disappearing-indicator UX
is pedagogically faithful to the §11.6 family deformation.

Two sources of misses, distinct in mechanism:

1. **Raycaster policy at k = 0.** Every ray from origin returns miss
   at `k = 0`, by sign-change-detector policy — NOT cone geometric
   inaccessibility. The cone `x² + y² − z² = 0` contains the full
   generator rays at `θ ∈ {π/4, 3π/4}`, but `raycastImplicit` is a
   sign-change detector and rejects identically-zero (tangent) or
   one-signed (non-tangent) `f` along a ray. The right framing is
   "no unique 'first forward intersection' is identifiable from a
   sign-change march at k = 0" — the indicator hides as a policy
   choice, not because the cone is unreachable.

2. **Analytic miss + AABB clip for k ≠ 0.** Solving `f(t·d) − k = 0`
   along a ray from origin gives `t² · cos(2θ) = −k`. Visible-hit
   regions:
   - `k > 0` (1-sheet): `θ ∈ (π/4, 3π/4)` AND `|cos(2θ)| ≥ k/BOUND²`
     (the AABB-clip threshold; near-band-edge θ's miss because the
     intersection is outside the rendered cube).
   - `k < 0` (2-sheet): `θ ∈ [0, π/4) ∪ (3π/4, π]` AND
     `|cos(2θ)| ≥ |k|/BOUND²`.

   The hit region inverts (equator ↔ poles) as k crosses 0 — that's
   the §11.6 topology-change story.

If the disappearing-indicator UX proves confusing in headset smoke,
**Option B-lite (closed-form θ clamp to the BOUND-bounded valid
region, `|cos(2θ)| ≥ |k|/BOUND² + ε`)** is the documented v0.7-polish
follow-up. Not pre-paved in #164 — over-engineering against a
deferred decision.

## Slider rack layout (#164 — k slider moved to bottom row)

The rack now stacks three sliders, top to bottom: θ at
`y = SLIDER_RACK_CENTER.y + SLIDER_ROW_PITCH = 1.14`, φ at
`SLIDER_RACK_CENTER.y = 1.00`, k at
`SLIDER_RACK_CENTER.y − SLIDER_ROW_PITCH = 0.86`. The k slider's
#163 position at y = 1.00 changes — a footprint diff visible in
the headset smoke pass on this PR. Rationale: pedagogy hierarchy
reads top→bottom as "where on this surface (θ, φ) ← which surface
(k)" — the where-question takes the top rows; the family-selector
sits underneath.

All three sliders share `SLIDER_BASE_COLOR = 0xaaaaaa` (neutral
gray) — none of θ/φ/k carries axis meaning, distinct from quadrics'
axis-tinted coefficient sliders. Each thumb is a solid sphere
emblazoned with its symbol via `thumbLabel: 'θ'` / `'φ'` / `'k'`
(#276); the textual emblazon replaced the pre-#276 axis-arrow vs
sphere visual distinction across the cluster.

## Gradient arrow (#165)

A 3D arrow primitive (merged cylinder shaft + cone tip,
`MeshStandardMaterial`, color `YELLOW = 0xf0e442` from the Wong/
Okabe-Ito palette) anchored at the selected surface point with its
tail on the point and its tip pointing along ∇f at that point. Total
length 0.40 m (shaft 0.30 m + cone 0.10 m), shaft radius 0.018 m,
cone radius 0.04 m, 32 radial segments — tunable in headset; this is
the v0.7 lock.

**Length convention: unit-length, fixed.** ∇f's *direction* is the
§11.6 punch line; |∇f|'s magnitude story is told via the numeric
readout (#166), not by varying-length arrows. |∇f| varies three-fold
across the selectable surface domain for `f = x² + y² − z²` (≈ 1.94
at the boot pose, ≈ 6 near the AABB shell at k = +2) — wide enough
that a magnitude-proportional arrow would oscillate between
near-invisible and dominating.

**Orientation convention: ∇f as-is, no inversion.** The arrow points
in the direction of *increasing f*. For k > 0 (1-sheet hyperboloid)
that's outward from the math-Z axis; for k < 0 (2-sheet hyperboloid)
that's inward, toward the cone apex. The flip is the §11.6 content,
not a sign-flip bug — students see ∇f swing through the topology
transition as k crosses zero.

**Visibility: overlay rendering.** The arrow is constructed with
`depthTest: false`, `depthWrite: false`, `renderOrder = 2`, so it
draws on top of the surface regardless of camera angle. The arrow's
pedagogical role is "always-visible UI element at the contact point"
— students manipulating θ/φ/k need uninterrupted visual feedback,
especially in the k < 0 inward-pointing case where physical
depth-testing would occlude the arrow body behind the surface from
some viewing angles.

Pose drives off `result.point` + `result.normal` from the same
per-frame raymarch that drives the indicator; positioning math (math →
world + surfaceCenter offset) lives in `poseGradientArrow.ts` so it's
testable without a renderer. Hides when the indicator hides (same
`result.hit` gate). Color picked from `tokens.ts`'s `YELLOW` —
distinct from the math-X / Y / Z axis tints (vermillion / bluish-green
/ sky-blue) so the arrow doesn't read as carrying axis identity.

## Readout (#166)

Live readout of ∇f and |∇f| at the selected point, anchored above
the slider rack. Two-line layout:

- **Top line:** `∇f = ( ±N.NN , ±N.NN , ±N.NN )` — the gradient
  decomposed into math-frame components. Each component picks up
  the cluster's axis-color convention (vermillion / bluish-green
  / sky-blue for math-X / Y / Z), mirroring `TangentPlaneReadout`'s
  bottom-line normal decomposition.
- **Bottom line:** `|∇f| = N.NN` — the scalar magnitude. Numeric
  value tinted **YELLOW**, matching the gradient arrow.

**Source.** The readout consumes the *raw* gradient `gradJs(p)` at
the selected point, NOT `result.normal` (which is the unit normal
from `raycastImplicit`). The arrow consumes the unit normal because
direction is its punch line; the readout consumes the raw gradient
because magnitude is the other half of the §11.6 story the unit-length
arrow deliberately drops. A composition test in
`test/exhibits/gradient-levels/formatGradientLevelsReadout.test.ts`
pins the raw-vs-unit wiring at the unit-test level — a unit-normal
wiring would format to `'1.00'` instead of the real |∇f|.

**YELLOW color-identity decoupling.** The arrow's rendered length is
fixed at 0.40 m regardless of |∇f| (per the unit-length lock above);
the YELLOW pairing on the |∇f| numeric communicates "these two
elements describe the same gradient vector" — the arrow showing
*direction*, the readout showing *magnitude*. It does NOT communicate
"the number equals the arrow's length." When sliding k from +0.5 to
+2, |∇f| grows from `2.00` to ~`8.94` while the arrow stays at fixed
visual length — this is the intended decoupling, not a display bug.

**Format.** Signed-magnitude `±N.NN` on top-line components (sign
char is U+2212 MINUS for negative, `+` for non-negative including
zero); unsigned `N.NN` on the |∇f| line (magnitude is non-negative
by definition). `toFixed(2)` matches the cluster's 2-decimal idiom.

**Anchor.** y = 1.42, z = -0.7 (same z-plane as the slider rack +
WorldAxes indicator). Lifted from tangent-planes' y = 1.32 to
maintain ~0.18 m bottom-to-thumb-top clearance over the now-three-row
rack (top of θ slider thumb at y ≈ 1.21).

**Cadence.** ≈30 Hz troika `.sync()` throttle on the four numerics
to bound SDF rebuild work during fast drags; yaw-only billboard
runs every frame so motion smoothness is unaffected. Per-slot
string caching skips troika rewrite when the formatted string
hasn't changed.

**Miss-policy UX contract.** During raycast miss frames (k = 0
cone, polar/equator-band rays at k ≠ 0, AABB-clip cases — all
documented under "Miss-hide policy" above), the **displayed value
is the last valid hit value**. The arrow and indicator hide; the
readout freezes. Pedagogically: "the picture is paused while no
point is selectable" rather than "the picture is broken." On
scene mount the readout boots hidden (`group.visible = false`) and
uncloaks on the first `setValues()` call — the boot pose guarantees
a first-frame hit, so under normal mount the readout populates
within one tick; deep-link / state-restore to a miss state stays
gracefully hidden. If headset smoke surfaces that the frozen
readout reads as a bug, a 50%-opacity dim during miss frames is
a documented v0.7-polish follow-up.

## Render

Minimal lambert: `uBaseColor * (0.2 + 0.8 * max(dot(n, normalize(uLightDir)), 0))`.
No grid, no parametric grid, no cross-section glow. The visual focus
belongs on the *family sweep* — a busy surface competes.

Same `SURFACE_CENTER`, `LIGHT_DIR`, and `uBaseColor` as cluster siblings
so the surface reads as a sibling. World-axis grid deferred. AABB
half-extent `BOUND = 3.0` — the family is unbounded along math-Z; at
`k = +2` the flare radius at math-Z = ±3 is `√11 ≈ 3.32` m, wider than
`BOUND` itself, so the AABB clip cuts the surface where it is already
on its outward flare. The crop reads as a gradual taper into the box
wall rather than a mid-belly slice. (Smaller `BOUND` would slice the
surface mid-flare; larger `BOUND` adds AABB-march cost without
pedagogical payoff.)

## Cone singularity (k = 0)

The cone `mx² + my² − mz² = 0` has a Lipschitz-discontinuous gradient
at the apex. Three concerns:

1. **Visual at k = 0.** GPU raymarcher tests `f` at sampled points; the
   apex contributes only if a ray passes exactly through the origin,
   which is measure-zero in a uniform-stepped march.
2. **Analytic gradient at the apex.** `gradF(vec3(0)) = vec3(0)`. The
   harness's downstream `normalize(gradF(p))` would yield NaN. The
   `gradF` GLSL chunk has an explicit
   `if (dot(g, g) < 1e-6) g = vec3(0, 1, 0);` guard, returning a
   deterministic up-facing world normal that reads as visually benign on
   a cone whose apex is symmetric around the up axis. Falling back to
   a central-difference here would also be degenerate
   (`f(h, 0, 0) = f(−h, 0, 0) = h²`), so the shader-side guard is the
   right fix.
3. **CPU side — resolved in #164 by the scaffold's defensive branch.**
   The same NaN edge case in principle applies in JS, but
   `raycastImplicit`'s defensive `gLen === 0 → miss` guard
   (`scaffold/render/raycastImplicit.ts`) handles it without a
   scene-side gradient guard. The JS path also can't reach the
   apex for `t > 0` — the march starts at `t0 ≥ 0` and the first
   sign-change check needs `t > 0`, so `gradJs` is never evaluated
   at the origin during a successful raycast. No JS-side cone-apex
   guard needed.

## Out of scope (v0.7 beyond #170)

- **Option B-lite (closed-form θ clamp).** Documented v0.7-polish
  follow-up if smoke shows the disappearing-indicator UX is too
  jarring. Clamp would need to account for BOUND
  (`|cos(2θ)| ≥ |k|/BOUND² + ε`), not just the analytic angular
  region.
- **Coefficient editing** — see "Equation form" above. `surfaceModel.ts`
  is the single source of truth for f; adding editable `(a, b, c)`
  would mean new uniforms + extended exports, not a structural change.
- **Alternate f presets** — quadric is the natural family for v0.7;
  non-quadric f presets are a v0.7-polish or v0.8+ idea.
- ~~**Floor** — the family extends to ±math-Z (vertically); a floor would
  need to be hole-punched. Plain shell-bg surface is cleaner.~~ **Lifted
  by #238 (E1.1):** floor + cutout shipped via the shared `StageFloor`
  primitive — see the "Staging (#238 / E1.1)" sub-section under
  "Design-language alignment" below for the cutout-as-projection-aperture
  framing.

## Design-language alignment (#201)

Scene inherits the quadrics-locked design language with one
intentional architectural departure (opaque raymarched surface vs.
flat translucent overlays — see exceptions). Rules live in
`scaffold/design/tokens.ts`'s header.

**Scaffold tokens consumed (post-#201):**

- `scaffold/ui/readoutTokens.ts` (PR 2) — `GradientLevelsReadout`'s
  font size, line pitch, outline, and 30-Hz sync throttle.
- `scaffold/ui/clusterRackTokens.ts` (PR 4) — rack center (via
  `createSliderRackCenter()`), row pitch, snap detent, grab-radius
  multiplier, and per-slider label (#170) layout.
- **Does NOT consume `scaffold/render/translucentRectTokens.ts`** —
  see the architectural exception below.

**Readout visibility-bootstrap policy:** `GradientLevelsReadout`
boots `group.visible = false` and uncloaks on the first `setValues`
call. Adopted during the initial-mount design in #166; #201 PR 3
brought the two earlier readouts in line with this pattern.

**Documented exceptions:**

- **Opaque raymarched surface, NOT a translucent overlay.** The
  level surface IS the scene's primary geometry, rendered as an
  opaque raymarched implicit surface via `createImplicitSurface`.
  The cluster's translucent #113 recipe is for *overlays* on top of
  another surface (quadrics' slicing planes, tangent-planes' tangent
  plane, saddle-extrema's Taylor patch). Intentional architectural
  divergence; not a drift to reconcile.
- **Neutral-gray slider thumbs (θ/φ/k).** All three are non-axis-
  coordinate parameters — θ/φ select a point on the active level
  surface, k sweeps the family. Per the slider tint rule, non-axis-
  coordinate sliders stay neutral gray (`0xaaaaaa`).
- **No preset rack.** The f-family is fixed; k is the family
  parameter as a slider rather than a preset rack.

### Staging (#238 / E1.1)

Floor: shared `StageFloor` primitive from `scaffold/staging/`,
cluster-default `outerHalfExtent: 5` (10 × 10 m). Rectangular cutout
sized to `±BOUND = ±3.0 m` (`kind: 'rect'`, centered on
`SURFACE_CENTER.xz`); reads as the math-frame domain envelope
projected onto the floor, per Path A1 (cutout-as-projection-aperture).
The cutout reaches world Z = −7, beyond the floor's −Z edge at
−5 — the strip approach's `Math.max/min` clamp truncates the cutout
to the floor edge, so the floor visibly opens to the back of the
exhibit (same shape as quadrics' shipped floor). The level surface
dips below floor for `k ≲ -2.25`; the cutout is static at mount
(sized to the math envelope, not the current `k`-driven extent).

Outer railing (#223 / E1.2): shared `StageRailing` primitive from
`scaffold/staging/`. **`backExtension: 3` (v3 — PR #244 smoke
feedback):** floor + outer railing extend asymmetrically in the −Z
direction so the back perimeter sits at world Z = −8, clearing the
level surface envelope's Z = −7 reach with 1 m margin. 4 corner
posts + 4 top-rail tubes; height 0.9 m; color `0x3a3a55`. See
`_private/plans/223-illusory-railing.md` §3.5.

Inner railing (#223 v3): shared `StageInnerRailing` primitive, rect
path. 4 corner posts at the cutout corners (`±BOUND` from
`SURFACE_CENTER.xz`) + 4 perimeter tubes. Same height + color as
the outer railing.

### Staging — Control plinth (#225 / E1.4)

Interactive UI (θ / φ / k sliders + per-slider labels + gradient-
levels readout + math-frame axis indicator) lifts onto the cluster-
shared `createPlinth` primitive from `src/scaffold/staging/Plinth.ts`,
matching quadrics' PR1 ship and the master plan
(`_private/plans/225-control-plinth.md` §4.2 PR2 / `251-cluster-on-
plinth.md` §3.2). Drafting-table-console silhouette anchored at world
`(0, 0, -0.625)` as of #263 — derived per-scene by
`composeClusterStagePose(cutoutDescriptor)`. Gradient-levels' mid
math envelope (BOUND = 3.0, no CUTOUT_VISUAL_MARGIN) puts the
railing-front edge at z = -1.0, ~0.68 m closer to the user than
quadrics'; the plinth slides forward to keep the body-back /
railing-tube clearance at 0.045 m. Working-surface depth =
`Plinth.ts` default 0.5 m: the 3-slider rack at `SLIDER_ROW_PITCH =
0.14 m` fits in slot-Y ∈ [0.135, 0.415] with breathing room above
and below. The per-scene pancake spawn `(0, 1.6, 3.025)` and VR
offset `(0, 0, 0.825)` ride on the registered `Exhibit.stage`
metadata.

Every UI primitive's `group` is reparented under `plinth.group` via
the slot manifest in `mount()`; positions are slot-local. Slot
manifest:

- **θ slider** (top row) at slot-local `(0, 0.415, 0)`.
- **φ slider** (mid row) at slot-local `(0, 0.275, 0)`.
- **k slider** (bottom row) at slot-local `(0, 0.135, 0)` — full
  `SLIDER_ROW_PITCH = 0.14 m` between rows, matching the pre-plinth
  `THETA_Y / PHI_Y / K_Y` derivation.
- **Per-slider labels** at slot-local
  `(SLIDER_LABEL_X_OFFSET, sliderY, 0)` for each row.
- **GradientLevelsReadout** at slot-local `(0, 0.57, 0)` — floats
  above the working-surface back edge at slot-Y = 0.5, mirroring
  quadrics' "readout above back edge" pattern.
- **WorldAxes** at slot-local `(0.42, 0.275, 0)`, `orientation:
  'world'` — keeps the math-frame X/Y/Z arrows aligned to the math
  frame regardless of plinth tilt.

**Math-object affordances stay in world frame.** `surfaceMesh`,
`gradientArrow`, and `indicator` are children of `ctx.group`, never
reparented under `plinth.group` — they're rendered at the math
object's position (`SURFACE_CENTER`), not on the control surface.

**Readout billboard carve-out.** `GradientLevelsReadout` overwrites
`group.rotation` every frame via `faceCamera`, so the slot's default
`'surface'` orientation is documentation-only — the readout yaw-
billboards regardless. The slot position binds it to the plinth's
slot-Y axis above the rack.

**Grab radius.** All interactive primitives (three sliders) use
`GRAB_RADIUS_MULTIPLIER_PLINTH = 1.5` from
`scaffold/ui/clusterRackTokens.ts`. The pre-plinth mid-air `2.75`
constant was deleted at PR2 (#251) once all four cluster scenes
ported onto the plinth.

## Plinth panel-backing (#252)

`GradientLevelsReadout` extends the shared `PanelReadout` base
(`scaffold/ui/PanelReadout.ts`) which contributes the cluster-shared
THREE.Group + boot-cloak + per-frame yaw `faceCamera` + dark
`MeshBasicMaterial` back-plate slab (front face flush with the original
PlaneGeometry position, extruded behind by `READOUT_PANEL_DEPTH` so
yaw-billboard motion reads as a solid screen turning — #270).

Per parent plan #225 §3.5 v3 lock (option-c), the back-plate is a
child of the readout's group, inheriting the yaw-billboard
transitively — panel + text face the user together.

**Panel dimensions:** `READOUT_PANEL_HALF_WIDTH_GRADIENT_LEVELS =
0.200 m`, `READOUT_PANEL_HALF_HEIGHT_GRADIENT_LEVELS = 0.055 m`.
Computed from worst-case top line `PREFIX_GRAD_EM (2.8) + 3 ×
NUMERIC_SIGNED_EM (2.6) + 2 × COMMA_EM (1.0) + CLOSE_PAREN_EM (1.0)
= 13.6 em × 0.028 = 0.381 m`, half + 0.012 m padding = 0.202 → 0.200.
Envelope test in `test/scaffold/ui/PanelReadout.test.ts` locks
against formatter drift. Bracket [0.195, 0.220]; smoke-tunable.

**Cloak normalization (#252 §3.6).** GradientLevelsReadout's
`setValues()` was restructured at PR3 to match the
Equation/TangentPlane pattern — added a `hasBootstrapped: boolean`
field, replaced the pre-throttle `if (!this.group.visible)
this.group.visible = true;` with a post-`.sync()` block guarded by
`hasBootstrapped`, and gated the throttle return with
`this.hasBootstrapped && ...` so the first call always paints.
Without this, the dark back-plate would render BEFORE the numeric
Text geometries resolve on first uncloak.
