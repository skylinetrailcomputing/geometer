# `tangent-planes` exhibit — SPEC

> Math + UX contract for the tangent-planes scene. v0.6 cuts: point
> selection on a fixed unit sphere (#147), tangent-plane mesh anchored
> at the selected point (#148), and live readout of the plane equation
> + normal (#149).

## Goal

An interactive WebXR scene where the learner drags two angular sliders to
walk a point continuously across an implicit quadric surface, watching
the tangent plane reorient as the contact point moves. Anchors the
"tangent plane reorients as the contact point moves" intuition for APPM
2350 §11.4 (Tangent Planes and Linear Approximations).

Sibling of `quadrics` in the `calculus3` cluster; the SceneRack swaps
between them at runtime.

## Equation form

The surface is the level set of `f(x, y, z) = x² + y² + z² − 1` — the
canonical unit sphere. Coefficient editability is **out of scope for
v0.6** by deliberate choice (not by accident):

- The §11.4 pedagogy goal is internalizing what the tangent plane *is* —
  a flat local approximation that reorients as the contact point moves.
  That story is fully told by *one* surface; varying the surface family
  swaps in a competing "different surfaces have different curvatures"
  lesson that belongs in a separate scene if anywhere.
- The quadrics manipulator scene already covers the
  "morph the surface family" story. Sibling scenes should differ in
  *what they teach*, not duplicate the surface UI.
- This satisfies the conditional `if a/b/c/d remain editable` line in
  the #147 acceptance vacuously — coefficient sliders are absent, so
  there are no coefficient changes to track.

Revisit if pedagogy demands; v0.7+ may layer in coefficient sliders, at
which point the `SURFACE` block in `index.ts` would split into a tagged
union of fixed surfaces.

## Point parameterization

Math frame (X right, Y forward, Z up; per `scaffold/math/frames.ts`).

- `θ ∈ [0, π]` — polar angle from +math-Z (up).
  - θ = 0 ⇒ direction = +math-Z (north pole, up)
  - θ = π ⇒ direction = −math-Z (south pole, down)
- `φ ∈ [−π, π]` — azimuth in the math-XY plane, from +math-X.
  - φ = 0 ⇒ +math-X (right)
  - φ = π/2 ⇒ +math-Y (forward, away from the user)
  - φ = ±π ⇒ −math-X (left)

Direction (math frame): `d_math = (sin θ cos φ, sin θ sin φ, cos θ)`.
The point is the nearest *forward* surface intersection along that ray
from the surface center. CPU-side raymarch + bisection in
`raycastSurface.ts`; visually agrees with the GPU shader because both
share the same `f` definition (paired GLSL/JS in `index.ts`).

## Initial pose

`θ₀ = π/3`, `φ₀ = π/4`. Off both poles, off every snap point. On first
load both sliders show immediate response — avoiding the failure mode
where θ = 0 (north pole) makes φ visually inert until θ moves.

## Slider model

Mirrors quadrics' detent contract: the emitted value (`currentValue`)
snaps inside each detent's half-width, while the underlying accumulator
(`rawValue`) integrates hand motion freely so slow drags escape the snap
naturally.

- `snapDetent` half-width: 0.05 (matches quadrics).
- θ snap points: `[0, π/2, π]` — north pole, equator, south pole.
- φ snap points: `[−π, −π/2, 0, π/2, π]` — four cardinal compass
  directions plus the wrap-equivalent ±π.

The `±π` φ snap points map to the same spatial direction (−math-X), so
the −X cardinal has an effective ~2× capture window compared to the
other three φ cardinals. This is deliberate: the slider range is
**closed (non-wrapping)** — `−π` and `π` are distinct slider positions
even though they produce identical surface points. v0.7+ could wrap
φ if headset feel asks for it.

Slider visuals: neutral light gray base color (`0xaaaaaa`), sphere thumb
shape — angular parameters carry no spatial axis to map an arrow to,
and a non-axis color separates them from the axis-coefficient sliders
in quadrics' rack.

## Indicator

Small sphere mesh — radius 0.04 m, neutral light gray (`0xdddddd`),
`MeshStandardMaterial`. Sized to read as "a point on the surface"
rather than a sphere of its own. Hidden when the raymarch returns a
miss — for v0.6's unit sphere no miss can happen (every direction from
the origin hits at distance 1), but the path is in place for future
coefficient editing where ray-origin choice may not enclose the
surface.

## Tangent plane mesh

A translucent rectangular mesh, 0.9 m × 0.9 m, anchored at the
selected surface point with normal aligned to ∇f at that point.
Visual treatment matches the cross-section slicing-plane recipe locked
in #113: sky-blue translucent body (alpha 0.10), one-tone-lighter rim
(alpha 0.65) along the outer ~5 cm, double-sided so the back face is
visible from inside the surface, depth-tested against the surface's
`gl_FragDepth` write.

Pose drives off `result.point` + `result.normal` from the same per-frame
raymarch that drives the indicator; positioning math (math → world +
surfaceCenter offset) lives in `poseTangentPlaneMesh.ts` so it's
testable without a renderer. Hides when the indicator hides (same
`result.hit` gate). For v0.6's unit sphere the hide branch never fires,
but the path stays in place for future surfaces.

Plane size (`TANGENT_PLANE_HALF_EXTENT = 0.45 m`) is the v0.6 lock,
tunable in headset. Reads as "a flat patch tangent to the surface"
rather than "a sheet that swallows the surface."

The shader + geometry primitive (`scaffold/render/TranslucentRect.ts`)
is shared with `quadrics`'s slicing planes — the locked #113 visual
recipe lives in one shader. Color/alpha/width *constants* are
intentionally per-scene so the design language can drift in v0.7+
without coupling the two scenes.

## Live readout

A two-line stacked readout above the slider rack reports the tangent
plane's algebraic state. Anchored at `(0, 1.32, -0.7)` — the same
z-plane as the slider rack and the math-frame axis indicator, mirroring
quadrics' `EQUATION_READOUT_POSITION`.

- **Top line — §11.4 textbook expanded form:**
  `n_x (x − x₀) + n_y (y − y₀) + n_z (z − z₀) = 0` with all six numerics
  rendered as `±N.NN`. The parenthesized connector's sign is the sign
  of `−x₀` — so `x₀ = +0.42` reads `(x − 0.42)`, `x₀ = −0.42` reads
  `(x + 0.42)`, and exact zero reads `(x − 0.00)` (deliberate; matches
  the textbook identity form).
- **Bottom line — geometric handle:**
  `n = ( ±N.NN , ±N.NN , ±N.NN )` with each component rendered as
  `±N.NN`.

Numerics are colored to match the math-frame axis story (vermillion =
math-X, bluish-green = math-Y, sky-blue = math-Z); algebraic glue is
neutral white with a black SDF outline. troika-three-text drives every
glyph; layout is computed once at construction (no reflow). `.sync()`
calls are throttled to ≈30 Hz, mirroring `quadrics/EquationReadout.ts`.
Yaw-only billboard so the equation reads from any user yaw without
inheriting head pitch / roll.

For the unit sphere `∇f = 2p` ⇒ unit normal `n̂ = p̂`, so on first
inspection the readout shows `n_x = x₀`, etc. — pedagogically useful
("the normal IS the point on a unit sphere") and falls out of the
component naturally without special handling. Generalizes cleanly to
v0.7+ surfaces where `n ≠ p`.

The class lives in `src/exhibits/tangent-planes/TangentPlaneReadout.ts`;
a pure formatter helper in `formatTangentPlaneReadout.ts` produces the
nine numeric strings and is unit-tested under
`test/exhibits/tangent-planes/formatTangentPlaneReadout.test.ts`. The
sibling vs. extending-`EquationReadout` decision is recorded in the
class header — different slot model, no hide-on-zero, simpler.

## Controller-aim picking (#197, v0.9)

VR-only direct-manipulation affordance alongside the angular sliders.
Aim a controller at the unit sphere and pull the trigger to land the
contact point at the ray–surface intersection; hold the trigger to drag
the contact point across the surface. Releases on trigger-up.

- **Coexists with the sliders** — does not replace them. Sliders remain
  the universal affordance (pancake mode and VR alike); picking is an
  additional VR-mode input that the user can prefer for coarse
  positioning. Mode gate: `pointer.id.startsWith('vr-')`, set by the
  shell when constructing `VRPointer`s — pancake's `DesktopPointer`s
  use `'desktop'` / `'mobile'` so the gate short-circuits without a
  separate mode read.
- **Pancake unaffected.** The mouse cursor is a sufficiently-direct
  affordance on desktop; per-mouse raycast picking is deferred (no
  acceptance loss for v0.9).
- **Snap policy** — `Slider.setValue` (not `setValueRaw`) is used to
  apply the picked angles, so each frame's pick re-applies the same
  θ / φ snap detents the sliders use under direct drag. Picking near a
  detent (e.g., a controller aiming approximately at the equator)
  lands on the detent; off-snap aim lands freely. Consistent with the
  drag-tick snap contract.
- **Slider-grab precedence.** `onSelectStart` tries `Slider.tryGrab`
  first; only an empty trigger pull (not on a thumb) escalates to
  sphere-aim picking.
- **Two-controller interaction.** Picking is a single slot —
  first-trigger-wins, mirroring `Slider.tryGrab`'s
  `if (grabbedBy) return false`. A second controller's trigger pull
  while pick is active does not steal the slot; it falls through to
  the rack / no-op. The slider-drag-while-picking case
  (one hand holds the contact point, the other fine-tunes θ or φ)
  works: each per-frame pick refresh skips the `Slider.setValue`
  on any slider currently grabbed by the *other* controller, so the
  drag tick's `rawValue` accumulator + `lastPointerAxisX` baseline
  aren't overwritten by the pick's rebase. The skipped slider
  resumes tracking the pick on the frame after the user releases it.
- **Miss policy.** A controller drift mid-drag that loses the sphere
  freezes the indicator at the last picked pose for that frame — the
  sliders' values are simply not refreshed. Releasing the trigger
  ends the picking gesture; the indicator path through the per-frame
  slider-driven raycast continues unchanged.
- **Pole degeneracy.** At a pole, `Math.atan2(0, 0) = 0` per IEEE 754,
  so the φ slider snaps to 0 if the user aims exactly at the pole.
  The indicator + tangent plane don't visibly move (φ is degenerate
  there). Near-pole aim — the in-headset common case — reads
  naturally.

The math-frame inverse `anglesFromDirection` mirrors
`directionFromAngles` and lives in `scaffold/math/`; both share the
same parametrization tests so a θ/φ axis transposition fails at the
unit-test level rather than slipping through to a headset smoke pass.

## Per-slider labels (#170)

Each slider in the rack carries a two-line billboarded label
right-anchored ~0.05 m left of the track end (0.025 m clearance to
the thumb). The primary line shows the variable name (`θ`, `φ`);
the secondary line shows the current value. Angular sliders render
their value in π-fraction format (e.g., `π/2`) at the slider's snap
points and as `Xπ` decimal (e.g., `0.33π`) off-snap; the
`scaffold/ui/formatAnglePiFraction(rad, snapPoints)` helper is gated
on the slider's actual `snapPoints` array, so an off-snap value
equal to a standard π-fraction (e.g., φ at `PHI_INITIAL = π/4` when
the slider has no π/4 snap) renders as `0.25π`, not the false-snap
`π/4` glyph.

## Render

Minimal lambert: `uBaseColor * (0.2 + 0.8 * max(dot(n, normalize(uLightDir)), 0))`.
No grid, no parametric grid, no cross-section glow. The visual focus
belongs on the indicator + tangent plane; a busy surface competes.

Same `SURFACE_CENTER`, `LIGHT_DIR`, and `uBaseColor` as quadrics so the
surface reads as a sibling. World-axis grid deferred to a later cut if
headset feel calls for orientation continuity beyond the math-frame
indicator.

## Out of scope (v0.6)

- **Coefficient editing** — see "Equation form" above.
- **Controller-aim point picking** — landed in v0.9; see "Controller-aim
  picking (#197, v0.9)" above.
- **Floor** — quadrics needs a hole-punched floor for its 3.5 m
  bounding cube; tangent-planes' 1.5 m cube doesn't intersect a
  ground-level floor at the surface center, so a floor is unwarranted
  for v0.6.
- **Equation readout, preset rack, sections.** Not warranted by this
  scene's UI.
- **Ray-origin choice for translated quadrics.** Currently fixed at the
  surface-local origin, which works only because the unit sphere
  encloses it. Note for any future surface that doesn't.
