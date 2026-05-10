# `gradient-levels` exhibit — SPEC

> Math + UX contract for the gradient + level-surfaces scene. v0.7 cuts:
> register the third cluster member with a single k slider sweeping
> { f(x, y, z) = k } across the canonical hyperboloid family (#163).
> #164 adds point selection, #165 the gradient arrow, #166 the live
> readout.

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

## No on-screen k value (intentional v0.7-#163 deferral)

The numeric value of k is not displayed in this PR. The minimum-viable
scene the issue calls for is "register + slider"; adding worldspace
text is scope creep against the issue title. Acknowledged that not
seeing the number weakens the immediate learning loop (the user is
actively dragging the parameter whose value is hidden); a follow-up
will add a numeric k label near the slider, scheduled between #164
and #165.

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
3. **CPU side (#164's concern).** Flagged here so the design tax is
   inherited: the same NaN edge case applies in JS when the user walks
   a point selection toward the apex. Resolution can wait until #164
   (likely the same `dot(g, g) < eps` guard in the JS gradient).

## Out of scope (v0.7 #163)

- **Point selection** — point indicator + θ/φ-style sliders + CPU
  raymarcher land in #164.
- **Gradient arrow** — 3D arrow at the selected point, oriented along
  ∇f. #165.
- **Live readout** — numeric ∇f and |∇f|. #166.
- **Numeric k value display** — separate follow-up between #164 and
  #165.
- **Coefficient editing** — see "Equation form" above. The `SURFACE`
  block in `index.ts` is the single source of truth for f; adding
  editable `(a, b, c)` would mean new uniforms + an extended SURFACE
  block, not a structural change.
- **Alternate f presets** — quadric is the natural family for v0.7;
  non-quadric f presets are a v0.7-polish or v0.8+ idea.
- **Floor** — the family extends to ±math-Z (vertically); a floor would
  need to be hole-punched. Plain shell-bg surface is cleaner.
