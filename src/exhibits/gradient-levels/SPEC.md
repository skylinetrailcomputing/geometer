# `gradient-levels` exhibit — SPEC

> Math + UX contract for the gradient + level-surfaces scene. v0.7 cuts:
> #163 registered the third cluster member with a single k slider
> sweeping { f(x, y, z) = k } across the canonical hyperboloid family;
> #164 added θ/φ point selection on the active level surface; #165 adds
> the gradient arrow at the selected point; #166 the live readout, #167
> the numeric k label.

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

## No on-screen k value (intentional v0.7-#163 deferral; pending #167)

The numeric value of k is not displayed yet. The minimum-viable scene
#163 called for was "register + slider"; adding worldspace text was
scope creep against that issue title. Acknowledged that not seeing the
number weakens the immediate learning loop (the user is actively
dragging the parameter whose value is hidden); the follow-up is
[#167](https://github.com/skylinetrailcomputing/geometer/issues/167),
scheduled for v0.7 and especially load-bearing once #164 ships
point selection — correlating "indicator vanished" with "k near 0"
becomes a single-glance read once the value is on-screen.

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
gray) and `thumbShape: 'sphere'`. None of θ/φ/k carries axis
meaning — distinct from quadrics' axis-tinted coefficient sliders.

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

## Out of scope (v0.7 beyond #165)

- **Live readout** — numeric ∇f and |∇f|. #166. Same source.
- **Numeric k value display** — #167.
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
- **Floor** — the family extends to ±math-Z (vertically); a floor would
  need to be hole-punched. Plain shell-bg surface is cleaner.
