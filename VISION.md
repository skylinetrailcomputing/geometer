# VISION

> The north-star "what is this project for, and what does success
> look like." Read this before opening an issue or proposing a new
> exhibit.

## Pedagogical thesis

VR earns its keep on math when the *bottleneck for the learner is
3D spatial intuition*.

Most undergraduate math has a clean algebraic surface and a tougher
geometric surface. Students often do the algebra without ever
forming the mental picture. `geometer` exists to make the geometric
surface direct and physical — stereo depth, walk-around scale, and
grab-rotate are real cognitive offloads when the bottleneck is
mental 3D rendering.

This is a content claim, not a "VR is cool" claim. The thesis fails
for math content where 2D paper or a 2D web app already conveys the
geometry well — so the project deliberately won't build content of
that type.

## VR-fit filter

The decision lens for whether a topic belongs in `geometer`:

**High VR-fit (build these):**

- Quadric surfaces (`ax² + by² + cz² = d` and family).
- Vector fields in 3D — gradient, divergence, curl visualization.
- Eigenvectors and eigenspaces of linear maps; the unit-sphere →
  ellipsoid mapping.
- Determinant as signed volume of the parallelepiped spanned by
  columns.
- Cross product as a physically perpendicular vector with
  right-hand-rule muscle memory.
- ODE phase portraits in 3D; stability of fixed points via local
  linearization (Jacobian eigenstructure).
- Parametric surfaces — Möbius strip, Klein bottle (immersed),
  Lissajous, Viviani, tori with adjustable radii.

**Low VR-fit (don't build these here):**

- 1D function graphs.
- Single-variable derivatives.
- Most algebraic manipulation.
- Anything where 2D paper or a 2D web app already conveys the
  geometry sufficiently.

The first question for any new exhibit proposal is *"what 3D spatial
intuition does this build that a 2D representation cannot?"* If the
answer is unconvincing, it's a low-fit topic — better belongs in a
2D companion tool, not here.

## Exhibit roadmap

Rough priority order. Each exhibit is a self-contained scene under
a shared shell. New exhibits are additions to a registry, not forks
of the codebase.

1. **Quadric surfaces explorer (MVP).** Slider-driven `(a, b, c, d)`
   for `ax² + by² + cz² = d`. GPU-raymarched implicit surface; live
   classification label that updates as parameters sweep through
   degenerate cases (Ellipsoid → Cone → Hyperboloid of two sheets,
   etc.).
2. **Linear algebra core.** Eigenvectors of 2D and 3D matrices,
   determinant as signed volume, matrix composition as physical
   chaining of transforms on a held object, cross product as the
   perpendicular vector.
3. **Vector fields in 3D.** `F: R³ → R³` rendered as a field of
   arrows you walk through. Divergence and curl visualized at a
   point via small probe spheres or curl meters.
4. **ODE phase portraits in 3D.** Trajectories of autonomous
   systems; stability of fixed points via local linearization.
5. **Parametric surfaces and curves.** Möbius strip, Klein bottle
   (immersed), Lissajous and Viviani curves, tori with adjustable
   major/minor radii.

## Definition of done — exhibit-level

An exhibit is "done" when:

- The math is correct on the spec'd input range, including
  degenerate and boundary cases.
- The interaction is smooth at 72Hz on Quest 3S (the project's
  reference hardware).
- The pedagogical claim it makes is observable in the experience —
  the quadric morph through `a → 0` is visible and smooth; the
  eigenvector exhibit's "directions that don't rotate" reveal
  themselves; etc.
- A `SPEC.md` colocated with the exhibit documents the input
  contract, the math contract (especially classification and
  edge-case behavior), rendering invariants, and explicit scope
  boundaries.

## Definition of done — project-level

`geometer` becomes ready-to-share-broadly when:

- Multiple exhibits ship. Single-exhibit demos are too thin to
  anchor the "Geometric Reasoning Sandbox" framing.
- Shell ergonomics (entering / exiting an exhibit, navigating
  between them) are smooth on both Quest 3 and Quest 3S.
- A short README walkthrough or video shows the experience without
  requiring a headset to evaluate it.

There's no "1.0" target date. This is a passion project; cadence is
"ship when it's right."

## Non-goals

- **Not a teaching curriculum.** No lesson plans, prerequisites, or
  scripted progression. `geometer` provides geometric intuitions
  the learner uses *with* their existing course or text.
- **Not a textbook.** No long-form text. A short floating-text
  label or two per exhibit is the upper bound.
- **Not a curricular-platform competitor.** Prisms VR, zSpace, and
  Class VR serve K-12 and structured-curriculum needs. `geometer`
  serves intuition-building for self-driven undergrad+ learners.
- **Not a multi-user space.** Single-user only. No avatars, no
  shared sessions, no chat.
- **Not analytics-instrumented.** No telemetry, no usage tracking.
  Open the URL and use it; nothing phones home.
- **Not a paid product.** Free to use, free to fork, MIT-licensed.
  Skyline Trail Computing LLC ships this as a community resource,
  not a revenue surface.

## How project knowledge is organized

- **`README.md`** — what / why / how to run.
- **`VISION.md`** (this file) — thesis, scope, definition of done.
- **`CONTRIBUTING.md`** — how to file issues and PRs; conventions.
- **`DEV_QUEST_SETUP.md`** — first-time Quest setup, dev loop.
- **GitHub Issues** — actionable tasks: bugs, features, polish.
- **GitHub Milestones** (if/when used) — ordered roadmap chunks.
- **Per-exhibit `SPEC.md`** — math and UX contracts colocated with
  each exhibit's code (e.g. `src/exhibits/quadrics/SPEC.md`).
- **`docs/adr/`** — Architecture Decision Records for cross-cutting
  design choices (renderer approach, build tool, framework, etc.).
