# `tangent-planes` exhibit — SPEC

> Math + UX contract for the tangent-planes scene. v0.6 first cut: point
> selection on a fixed unit sphere (#147). Tangent plane mesh (#148) and
> live readout (#149) extend this in subsequent PRs.

## Goal

An interactive WebXR scene where the learner drags two angular sliders to
walk a point continuously across an implicit quadric surface, watching
the contact point move while the same surface stays put. Anchors the
"tangent plane reorients as the contact point moves" intuition for APPM
2350 §11.4 (Tangent Planes and Linear Approximations) — without yet
showing the plane (which lands in #148).

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

## Render

Minimal lambert: `uBaseColor * (0.2 + 0.8 * max(dot(n, normalize(uLightDir)), 0))`.
No grid, no parametric grid, no cross-section glow. The visual focus
belongs on the indicator + (later) the tangent plane; a busy surface
competes.

Same `SURFACE_CENTER`, `LIGHT_DIR`, and `uBaseColor` as quadrics so the
surface reads as a sibling. World-axis grid deferred to a later cut if
headset feel calls for orientation continuity beyond the math-frame
indicator.

## Out of scope (v0.6)

- **Tangent plane mesh** (#148) — consumes `result.point` + `result.normal`
  from `raycastImplicit`'s return type. No new entry points needed in
  `raycastSurface.ts`.
- **Live readout of plane equation / normal** (#149) — same.
- **Coefficient editing** — see "Equation form" above.
- **Controller-aim point picking** — natural in headset, unusable on
  the pancake build (#105) and Cloudflare PR previews. Deferred to v0.9.
- **Floor** — quadrics needs a hole-punched floor for its 3.5 m
  bounding cube; tangent-planes' 1.5 m cube doesn't intersect a
  ground-level floor at the surface center, so a floor is unwarranted
  for v0.6.
- **Equation readout, preset rack, sections.** Not warranted by this
  scene's UI.
- **Ray-origin choice for translated quadrics.** Currently fixed at the
  surface-local origin, which works only because the unit sphere
  encloses it. Note for any future surface that doesn't.
