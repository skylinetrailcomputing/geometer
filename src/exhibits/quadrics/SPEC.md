# `quadrics` exhibit — SPEC

> Math + UX contract for the slider-driven quadric surfaces explorer.
> v0.1 is chunked across issues #2–#8 and tracked under #9.

## Goal

An interactive WebXR exhibit where the learner drags four sliders to morph
the surface defined by

```
ax² + by² + cz² = d
```

and watches a live family-classification label update as the surface
crosses degeneracy boundaries. Built to anchor 3D spatial intuition for
quadrics in a multivariable-calculus or linear-algebra setting.

## Equation form

The surface is the level set of `f(x, y, z) = ax² + by² + cz² − d`. All
four parameters `(a, b, c, d)` are independent sliders. We deliberately do
**not** normalize to `d = 1`: that would lose the `d = 0` boundary case
(the cone), which is the most pedagogically useful transition in the
exhibit — the bifurcation between 1-sheet and 2-sheet hyperboloids passes
exactly through it.

Out of scope for v0.1 (not in the equation form):

- Cross terms `xy`, `yz`, `xz` (restricts to the axis-aligned subfamily).
- Linear terms / center translation (surface always centered at the local
  origin of the surface frame).

## Sign-flip symmetry

The set defined by `ax² + by² + cz² = d` equals the set defined by
`(−a)x² + (−b)y² + (−c)z² = −d` — multiplying both sides of the equation
by −1 leaves the solution set intact. So the *surface* is a function of
the four-tuple `(a, b, c, d)` modulo the global flip
`(a, b, c, d) ↔ (−a, −b, −c, −d)`. The taxonomy below lists every sign
combination explicitly; both halves of each flip-pair appear with matching
labels.

## Classification taxonomy

Let `n+`, `n−`, `n₀` be the counts of positive, negative, and zero entries
among `(a, b, c)`. By axis-permutation we treat `(n+, n−, n₀)` as the
classification key alongside `sgn(d)`. The label in the **Family** column
is the exact text rendered by the UI.

| `(n+, n−, n₀)` | `sgn(d)` | Family                          | Geometry                                    |
|----------------|----------|---------------------------------|---------------------------------------------|
| `(3,0,0)`      | `+`      | `Ellipsoid`                     | Bounded ellipsoidal surface                 |
| `(3,0,0)`      | `0`      | `Degenerate`                    | Single point at origin                      |
| `(3,0,0)`      | `−`      | `Empty set`                     | No real points                              |
| `(0,3,0)`      | `+`      | `Empty set`                     | No real points                              |
| `(0,3,0)`      | `0`      | `Degenerate`                    | Single point at origin                      |
| `(0,3,0)`      | `−`      | `Ellipsoid`                     | Bounded ellipsoidal surface                 |
| `(2,1,0)`      | `+`      | `Hyperboloid (1 sheet)`         | Connected ruled surface                     |
| `(2,1,0)`      | `0`      | `Cone`                          | Double cone through origin                  |
| `(2,1,0)`      | `−`      | `Hyperboloid (2 sheets)`        | Two disconnected sheets                     |
| `(1,2,0)`      | `+`      | `Hyperboloid (2 sheets)`        | Two disconnected sheets                     |
| `(1,2,0)`      | `0`      | `Cone`                          | Double cone through origin                  |
| `(1,2,0)`      | `−`      | `Hyperboloid (1 sheet)`         | Connected ruled surface                     |
| `(2,0,1)`      | `+`      | `Elliptic cylinder`             | Tube along the zero-coefficient axis        |
| `(2,0,1)`      | `0`      | `Degenerate`                    | Single line (the zero-coefficient axis)     |
| `(2,0,1)`      | `−`      | `Empty set`                     |                                             |
| `(0,2,1)`      | `+`      | `Empty set`                     |                                             |
| `(0,2,1)`      | `0`      | `Degenerate`                    | Single line (the zero-coefficient axis)     |
| `(0,2,1)`      | `−`      | `Elliptic cylinder`             | Tube along the zero-coefficient axis        |
| `(1,1,1)`      | `+`      | `Hyperbolic cylinder`           | Saddle tube along the zero-coefficient axis |
| `(1,1,1)`      | `0`      | `Pair of intersecting planes`   | Two planes through the zero-coefficient axis |
| `(1,1,1)`      | `−`      | `Hyperbolic cylinder`           | Saddle tube along the zero-coefficient axis |
| `(1,0,2)`      | `+`      | `Pair of parallel planes`       | Two planes ⊥ to the nonzero-coefficient axis |
| `(1,0,2)`      | `0`      | `Degenerate`                    | Single plane (⊥ to the nonzero-coefficient axis) |
| `(1,0,2)`      | `−`      | `Empty set`                     |                                             |
| `(0,1,2)`      | `+`      | `Empty set`                     |                                             |
| `(0,1,2)`      | `0`      | `Degenerate`                    | Single plane (⊥ to the nonzero-coefficient axis) |
| `(0,1,2)`      | `−`      | `Pair of parallel planes`       | Two planes ⊥ to the nonzero-coefficient axis |
| `(0,0,3)`      | `0`      | `Degenerate`                    | All of ℝ³                                   |
| `(0,0,3)`      | `+` or `−` | `Empty set`                   | No real points                              |

The `Degenerate` label collapses several geometrically distinct cases
(point, line, plane, all of ℝ³). The classifier records *which* degenerate
case is active for the renderer's benefit, but the UI shows only
`Degenerate` to keep the family vocabulary at v0.1 small and learnable.

## Classifier numerical contract

The classifier reads `(a, b, c, d)` from the slider uniforms and produces
both the family label and the underlying geometry tag every frame. Each
coefficient's sign is computed against an epsilon of `1e-6`: any value
with `|v| < 1e-6` is treated as exactly zero. Combined with the slider's
snap-to-zero detent (below), this keeps the classifier stable as the user
drags through a degeneracy.

## Slider model

- **Count:** four (`a`, `b`, `c`, `d`).
- **Range:** each slider in `[−2, 2]`. Magnitude beyond 2 doesn't add
  classification information — only visual scale.
- **Default starting values:** `(a, b, c, d) = (1, 1, 1, 1)` — the unit
  sphere, an ellipsoid.
- **Continuity:** continuous (no integer snapping). Slider value is a real
  in `[−2, 2]`.
- **Snap detents:** when a slider's continuous position satisfies
  `|v − p| < 0.05` for any detent target `p`, its reported value clamps
  to exactly `p`. The detent set is per-slider:
  - **Squared coefficients (`a` / `b` / `c` / `d`)** and **linear-term
    sliders (`u` / `v` / `w`)**: `{−1, 0, +1}`. Zero makes the
    degeneracy boundary cases (cone, intersecting planes, single
    plane) reachable precisely; ±1 (#139) makes the textbook unit
    poses (unit sphere, unit cone, unit hyperboloids) park on integer
    coefficients exactly instead of approximating.
  - **Cross-section sliders (`x₀` / `y₀` / `z₀`)**: `{0}` only. Their
    range is wider (±2.5) and there's no canonical pose at ±1; ±1 is
    deferred pending headset feel (#139).
  Detents apply at rest (drag/release and constructor); programmatic
  preset tweens use `setValueRaw` to bypass them so the thumb sweeps
  through cleanly mid-morph.
- **Per-slider visual:** horizontal track with a draggable thumb. Each
  slider in the rack is identified by **color** (Wong / Okabe-Ito
  colorblind-safe palette: vermillion / bluish-green / sky-blue / yellow
  for `a` / `b` / `c` / `d` respectively) and by **thumb shape**:
  bidirectional 3D arrows axis-aligned with the world axis each
  axis-coefficient slider drives. Slider `a` (math-X) is an arrow along
  the track (left-right); slider `b` (math-Y) is an arrow toward/away
  from the viewer; slider `c` (math-Z) is an arrow up/down. Slider `d`
  is the constant term — no spatial direction, so its thumb is a
  directionless sphere. The shape thus carries pedagogy on top of color
  redundancy: the user reads each slider's spatial orientation
  immediately from its thumb, not just by recalling that "color X means
  axis Y."
- **No per-slider numeric labels.** The equation readout above the rack
  carries the live coefficient values (see "Label content" below) — the
  variable-name + value labels that sat left of each track in v0.1 were
  removed in #58 since they duplicated information now centralized in
  the equation. Hover/grab affordance is conveyed by the thumb's
  emissive (pre-light on hover, stronger glow on grab) — derived as a
  scalar of the slider's own base color, so each slider's affordance
  reads in its own hue.

## Scene geometry

| Object             | Position (x, y, z)  | Notes                             |
|--------------------|---------------------|-----------------------------------|
| Surface center     | `(0, 1.5, −3)`      | ~2 m in front of the standing user; close enough to walk up to, far enough that the bounding volume doesn't clip through the spawn point. |
| Family classifier  | `(0, 1.5, −0.7)`    | Top of the rack stack. Single classification readout — the family name sits in the user's gaze area while interacting (#33). Yaw-only billboarded (#29). A second surface-anchored "hero" label was tried alongside this one in v0.1 development and removed as redundant per first-headset feedback. Pushed up from `y = 1.4` in #58 to make room for the equation readout below it. |
| Equation readout   | `(0, 1.4, −0.7)`    | Live `±N.NN x² + ±N.NN y² + ±N.NN z² = ±N.NN` between the family classifier and the top slider (#58). Four numeric coefficients colored to match their sliders (a / b / c / d → vermillion / bluish-green / sky-blue / yellow); algebraic glue (variables, operators, equals sign) is neutral white. Yaw-only billboarded as one unit. |
| Slider rack        | `(0, 1.0, −0.7)`    | Below-and-in-front; reachable with controllers without a step. |
| Floor              | `y = 0`             | Inherited from the shell convention; visual horizon and comfort anchor. |

Units are meters. The user's head start position is the WebXR session
origin (`y ≈ 1.6` for a standing user).

## Surface rendering

The quadric is ray-marched in a fragment shader against a world-aligned
bounding cube. Per-fragment depth is written from the implicit-surface
hit point so Quest's async spacewarp reprojects against the visible
surface rather than the bounding cube (#3 / earlier).

**Gridlines** are drawn as a depth cue using one of two systems,
chosen per-fragment by family — never co-rendered. Both share the
same near-black "carved" color and intensity so the visual style
stays consistent across family transitions; only the *frame* the
lines align to changes, reinforcing the family-classification flip
already shown in the rack readout.

- **Parametric** (#45) — used on the ellipsoid and both hyperboloids.
  Lines of constant `θ` ("latitude") and constant `φ` ("longitude")
  on the ellipsoid; lines of constant `u` and `v` on the 1-sheet and
  2-sheet hyperboloids, in a family-aware natural parameterization.
  Lines flow *with* the surface as parameters morph — the
  deformation is visible in the gridline pattern, not just the
  silhouette. Polar axis on the ellipsoid is world-Y (math-Z up, per
  #43's axis convention).

- **World-axis** (#34) — used on cylinders, cones, planes, and
  degenerate / empty cases (where a parametric form isn't natural).
  Distance from each fragment's hit-world coordinate to the nearest
  integer multiple of `1 / GRID_FREQ` on any of the three world
  axes; anchored to world `(0, 0, 0)`. Spacing 0.5 m.

Family + special-axis dispatch is derived in-shader from
`sign(uA, uB, uC, uD)` so the JS-side classifier API stays unchanged.
Both systems use `fwidth` for screen-space anti-aliasing so lines stay
one-pixel-wide regardless of viewing angle or distance; walking around
the surface in roomscale gives parallax through whichever grid is
currently active. Decorative depth cue only — labels / measurement
come in v0.2.

## Frame-pacing knobs (#38)

Two surgical knobs land in v0.1.1 to tighten the labels-vs-surface
asymmetry first reported post-#8 (smooth surface, slightly-jank UI):

- **Quest fixed foveated rendering** at a mild setting
  (`renderer.xr.setFoveation(0.3)` in the shell — wide detailed
  fraction, gentle falloff). Frees GPU budget on the periphery
  without making it read as visibly blurry; applies to every exhibit,
  not just this one. Static / center-of-view foveation (Quest 3S has
  no eye tracking). Ramp the level up if profiling says more headroom
  is needed.
- **Throttled equation-readout refresh** to ≈30 Hz
  (`SYNC_INTERVAL_MS` in `EquationReadout.ts`). Bounds the rate of
  troika SDF `.sync()` calls on the four numeric coefficients — head-
  pose billboarding still runs every frame, so motion smoothness is
  untouched. The cap originally applied to the per-slider value
  labels in v0.1; #58 retired those labels in favor of the equation
  readout and ported the cap to the new readout for the same reason.

Both are reversible knobs.

Real-world readings on Quest 3S (#102) showed steady-state ~40 FPS
even on degenerate / empty-set surfaces — surface-independent, which
points at the raymarcher's per-fragment STEPS loop over the bounding
cube as the dominant cost. Two profile-guided knobs landed and lifted
the steady-state to ~70–80 FPS sustained, meeting the v0.1 DoD's
72 Hz bar:

- **Quest framebuffer scale factor** at 0.85
  (`renderer.xr.setFramebufferScaleFactor(0.85)` in the shell, #114).
  Cuts per-eye render target resolution by ~15 % per axis (~28 %
  fewer fragments). Perceptually invisible in motion at the Quest 3S
  panel's pixel density; the Three.js `WebXRManager` applies the
  scale at session-start when the XR projection layer is created.
  Smoke result: ~40 → ~50–55 FPS.
- **Raymarcher STEPS** at 64, down from 96 (the `STEPS` literal in
  the fragment shader inside `src/exhibits/quadrics/index.ts`, #115).
  The loop runs for every rasterized fragment in the bounding cube
  even on no-hit, so it's a near-linear knob on steady-state
  fragment cost. The 8-iter bisection follow-up still resolves to
  sub-mm precision once a sign change is detected, so the visible
  tradeoff is missed-feature aliasing on geometry thinner than dt
  (~19 cm worst case at BOUND = 3.5); non-degenerate quadrics are
  contiguous and easily caught by 64 samples. Smoke result: ~50–55
  → ~70–80 FPS sustained.

Two further knobs from the #102 ladder (BOUND tighten 3.5 → 2.5;
foveation ramp 0.3 → 0.5–0.6) were not needed — the bar was met
after knob 2. Available as future-tightening knobs if scene
complexity climbs in v0.5+.

## Label content

Two text readouts above the slider rack — family classifier on top,
live equation below:

- **Family classifier** — single line, billboarded, anchored at the top
  of the stack above the rack. The family name sits in the user's gaze
  area during interaction. Renders one of the `Family` strings from the
  taxonomy (e.g., `Hyperboloid (1 sheet)`, `Cone`, `Empty set`,
  `Degenerate`). Re-classified every frame.

- **Equation readout** — `±N.NN x² + ±N.NN y² + ±N.NN z² = ±N.NN` (#58).
  Built from seven independent troika `Text` instances (4 numeric slots
  + 3 separators) since troika doesn't support inline rich text. The
  four numerics carry per-slider color; the algebraic glue is neutral
  white. Sign is always shown explicitly so transitions across zero are
  unambiguous. Numeric `.sync()` calls are throttled to ≈30 Hz
  (`SYNC_INTERVAL_MS` in `EquationReadout.ts`) — same rationale as the
  per-slider label cap from #38, now retired alongside this change.
  Yaw-only billboarded as a single unit so the equation reads from one
  consistent direction regardless of where the viewer stands. Replaces
  v0.1's per-slider variable-name + value labels (those left-of-track
  `a +1.00` mounts are gone — the equation centralizes the same info
  with the added pedagogy that the user sees the symbolic form they're
  manipulating, not just the numeric coefficients in isolation).

## Controller interaction

- **Hands:** either left or right controller drives any slider. No
  hand-specific roles in v0.1. Both hands may simultaneously grab and
  drag *different* sliders — pedagogically useful for exploring joint
  coefficient effects (e.g., dragging `a` and `c` together to slide
  between hyperboloids of one and two sheets through the cone). Two
  hands cannot grab the same slider at once; whichever pulls the trigger
  first wins.
- **Pointer model:** ray-pointer extending from each controller. Visible
  laser line when the ray intersects an interactable.
- **Grab:** trigger press while the ray intersects a slider thumb grabs
  the thumb. Trigger release drops it. While grabbed, the thumb tracks
  the controller's position projected onto the slider track and clamped
  to the slider's range.
- **Haptics:** light pulse (~10 ms, amplitude 0.5) on grab and on release.
- **Other inputs are ignored:** grip button, joystick, A/B/X/Y, system menu
  pass through to the runtime.

Hand tracking is explicitly v0.2.

## Definition of done — v0.1

- [x] Every render-meaningful family in the taxonomy reachable from the
  default starting values by slider manipulation alone.
  *Confirmed by construction: `classify.ts`'s table covers every
  `(n+, n−, n₀) | sgn(d)` combination, and each slider's `[−2, 2]`
  range with the zero detent admits all sign combinations on
  `(a, b, c, d)`.*
- [x] Family label updates within one frame of any slider change.
  *`update()` in `index.ts` re-classifies and writes to both labels
  every frame.*
- [x] Cone case (`d = 0` with mixed-sign coefficients) reachable via the
  zero-detent and renders without flicker.
  *Slider's `ZERO_DETENT` pins emitted value to exactly `0`; classifier
  reads that as `sgn(d) = 0` and resolves to `Cone` for the
  mixed-sign cases per the taxonomy.*
- [ ] No flickering, holes, or visual artifacts at boundary cases.
  *Requires headset verification at the v0.1 release smoke.*
- [ ] Render frame rate ≥ 72 Hz on Quest 3S in the single-surface scene.
  *Requires headset measurement at the v0.1 release smoke.*
- [x] Documented in repo `README.md` with a screenshot or short GIF.
  *`screenshots/quadrics.jpg` (Quest 3S capture) referenced from the
  README's `## Demo` section.*

## v0.2 candidates (named only)

Carried out of v0.1 deliberately. None of these are commitments; just a
tracked list so the design choices in v0.1 don't accidentally foreclose
them.

- Cross-section / level-set slicing — interactive plane through the
  surface, showing the conic cross-section as a 2D curve.
- Off-axis quadrics — cross terms `xy`, `yz`, `xz`.
- Translated centers — `(x − h)²` etc.
- Hand tracking.
- Equation rendering (LaTeX-style).
- Multiple simultaneous surfaces for side-by-side comparison.
- Save / load preset coefficient configurations.
- Per-axis labels and *measurement* gridlines (numbered tick marks on
  the world axes). Distinct from v0.1's decorative depth-cue gridlines
  (above) — those are unlabeled and exist purely for parallax.

## Design-language alignment (#201)

The quadrics manipulator is the inherited template for the cluster's
design language — every other scene's "Design-language alignment"
section cross-references this one. v0.9 lifted the duplicated locals
into shared scaffold tokens; the rules are documented in
`scaffold/design/tokens.ts`'s header comment.

**Scaffold tokens consumed (post-#201):**

- `scaffold/render/translucentRectTokens.ts` (PR 1) — `SlicingPlane`'s
  body / rim colors, alphas, and rim width come from the locked #113
  recipe.
- `scaffold/ui/readoutTokens.ts` (PR 2) — `EquationReadout`'s font
  size, line pitch, outline, and 30-Hz sync throttle.
- `scaffold/ui/clusterRackTokens.ts` (PR 4) — `SLIDER_RACK_CENTER`
  (via `createSliderRackCenter()`), row pitch, snap detent,
  grab-radius multiplier.

**Readout visibility-bootstrap policy:** `EquationReadout` boots
`group.visible = false` and uncloaks on the first `setValues` call
(#201 PR 3). This is the *whole-readout* boot policy. The pre-existing
**hide-on-zero per-slot reflow** (#95) is a separate axis — per-slot
conditional visibility based on coefficient zero-ness, fires on every
`setValues` after bootstrap; unaffected by the boot policy.

**Documented exceptions to the cluster's design-language rules:**

- **No per-slider labels (#170 not applied).** The 10-slider rack
  (4 squared + 3 linear + 3 cross-section) is dense enough that
  per-slider labels would crowd the rack; the live equation readout
  above the rack carries the coefficient values instead. Cluster
  siblings with 2–3-slider racks use #170 labels.
- **Axis-colored slider thumbs.** Every slider's value IS a named
  coefficient on a named axis: `a/b/c` and `u/v/w` are tinted by axis
  (VERMILLION/BLUISH_GREEN/SKY_BLUE), `d` is YELLOW (the "important
  math fact at a point" tint applied to the constant term).
  `x₀/y₀/z₀` cross-section sliders reuse axis tints per axis. Matches
  the slider tint rule in `tokens.ts`.
- **Preset row stays one-shot.** Quadrics' presets are snap-to-pose:
  press flash IS the feedback. `Preset` constructed without
  `activeEmissive` (#201 PR 6 added the option for sticky-active
  scenes; quadrics doesn't pass it). Sticky-active is documented in
  saddle-extrema's "Design-language alignment" section.

### Staging (#222 / E1.1)

Floor: shared `StageFloor` primitive from `src/scaffold/staging/`,
10 × 10 m outer extent, dark navy `0x222244`. Rectangular cutout
sized to the AABB (`±BOUND = ±3.5 m` in math-frame coords, centered
on `SURFACE_CENTER.xz`). The cutout exits the outer floor on the
−Z side; the strip primitive handles this naturally (the "behind"
strip is degenerate and dropped at `addStrip`'s early-return).

Originally lifted from the per-exhibit `floorMaterial` +
`floorGeometries` construction at `quadrics/index.ts:806–839` (#125,
v0.5); refactored into the shared primitive in #222 with zero visual
change. Future cluster-wide rollout to the other three scenes lives
in #238 — the cutout-as-projection-aperture vs dipping-hole UX
decision is owned there, not here.

Outer railing (#223 / E1.2): shared `StageRailing` primitive from
`scaffold/staging/`. **`backExtension: 3` (v3 — PR #244 smoke
feedback):** the floor + outer railing extend asymmetrically in the
−Z direction so the back perimeter sits at world Z = −8, clearing
the AABB envelope's Z = −7.5 reach with 0.5 m margin. X stays
symmetric at ±5. 4 corner posts + 4 top-rail tubes; height 0.9 m;
color `0x3a3a55`. See `_private/plans/223-illusory-railing.md` §3.5.

Inner railing (#223 v3): shared `StageInnerRailing` primitive,
circumscribes the cutout. Rect path: 4 corner posts at the cutout
corners + 4 perimeter tubes scaled to the cutout footprint. Same
color and dimensions as the outer railing; recognized by *where it
is* (around the cutout) rather than by visual differentiation.
Museum-style "protect the exhibit" framing.

**`CUTOUT_VISUAL_MARGIN = 1.05` (v4 — PR #244 follow-up smoke).**
Cutout half-extents (and consequently the inner railing perimeter)
are scaled 1.05× outward from `SURFACE_CENTER.xz`, so the rendered
surface doesn't kiss the cutout / railing edge at extreme
`a/b/c/d` parameters. Preserves the Path A "math envelope projected
onto floor" framing while adding a small annular breathing margin.

### Staging — Control plinth (#225 / E1.4)

Quadrics' free-floating UI (sliders, presets, section tabs, equation
+ classifier readouts, math-frame axis indicator) lifts onto the
shared `createPlinth` primitive from `src/scaffold/staging/Plinth.ts`
as the densest cluster member — the API stress test for the slot
model. Drafting-table-console silhouette anchored at world `(0, 0,
0.05)`. As of #263 the anchor is derived per-scene by
`composeClusterStagePose(cutoutDescriptor)` from
`scaffold/staging/clusterStagePose.ts`; quadrics is the helper's
**calibration case** so the derived value matches the pre-#263
literal to within ±0.5 mm under `roundToMm`. The derivation:
railing-front-Z (`SURFACE_CENTER.z + halfExtentZ = -4 + 3.675 =
-0.325`) + tube radius (`0.03`) + body-back clearance (`0.045`) +
body depth (`0.3`) = `0.05`. v1 of #225 PR1 anchored at z = 0 so
the body sat 0.025 m clear of the railing-front edge; v2 nudged
the anchor 0.05 m further in +world-Z so the body back lands at
z = -0.25, 0.045 m clear of the tube's +Z visual edge at z =
-0.295 — those values are now the helper's defaults.

`~20°` working-surface tilt, 0.9 m wide × `PLINTH_WORKING_HEIGHT_
QUADRICS = 0.55` m deep working surface — slightly deeper than the
Plinth default so the 4-slider rack fits at the cluster's standard
0.14 m pitch without needing a per-scene pitch override.

The pancake spawn pose `(0, 1.6, 3.7)` and VR offset `(0, 0, 1.5)`
both come from the same `composeClusterStagePose(...)` call and
ride on the registered `Exhibit.stage` metadata (per #263 §3.2).
Shell wiring: `cameraControls.createCameraControls` consumes the
pancake spawn at boot; `applyPancakeSpawnForExhibit` refreshes on
each scene-hop; `shell.onXrSessionStart` applies the VR offset
once per VR session. Foreground floor at the pancake pose is
~2.2 m (was ~1.5 m pre-#225 PR1). The SceneRack
(`shell/SceneRack.ts`) is positioned per-scene via the shell's
`rack.group.position` write from each exhibit's `rackAnchorWorldXYZ`
(= plinth anchor for cluster scenes; cluster-uniform fallback
`(0, 0, 0.05)` for non-cluster exhibits). For quadrics this lands
the rack at world `(0, ~1.73, 0.05)` to match the
plinth anchor so the navigation bulbs sit directly above the
plinth front edge instead of being stranded over the math-object
rendering box at the cluster's pre-plinth z = -0.7. The 0.75 m
offset from the other three cluster scenes' still-pre-plinth UI is
a temporary mismatch closed by PR2 (#251) when they port to the
same primitive.

Every primitive's `group` is reparented under `plinth.group` via the
slot manifest in `mount()`; positions are slot-local (origin at the
working-surface front edge center, +X right, +Y up the tilted face
toward the back, +Z out from the surface normal). The squared /
linear / cross-section slider racks deliberately share the same
slot-Y positions — `Section.setActive(false)` hides whichever rack
isn't currently selected via the `group.visible` cascade, so the
overlap never co-renders.

**WorldAxes carve-out: `orientation: 'world'`.** The math-frame
indicator's X/Y/Z arrows have to read as the math frame the equation
is written in, not as the tabletop frame. The slot's `'world'`
orientation keeps the indicator world-aligned regardless of plinth
tilt; WorldAxes' own `faceCamera` only rotates the child letter-Text
labels, so the world-aligned slot orientation survives across frames.

**Readout billboard carve-out.** `EquationReadout` and the family
classifier `Label` overwrite `group.rotation` every frame via
`faceCamera`, so their slot's `orientation: 'surface'` is
documentation-only — they yaw-billboard regardless. The slot position
still binds them to the plinth's slot-Y axis above the rack; the
yaw-billboarding keeps text legible across pancake and headset
viewing distances rather than foreshortening with the surface tilt.

**FPS-overlay carve-out: shell-owned (#261).** The `?fps=1`-gated
dev `FpsOverlay` (#99) is intentionally NOT a plinth slot — it's
debug-only readout, not user-facing UI. As of #261 the overlay is
shell-owned (`src/shell/shell.ts` `FPS_OVERLAY_POSITION` at world
`(0, 1.85, 0.05)`), allocated once at boot when the flag is set,
ticked from the shell animation loop, and disposed via the shell's
LIFO drain. The matching `RendererInfoProbe` console probe (#102)
stays quadrics-local — only this scene has the raymarcher
fragment-cost question that probe was added to answer — and still
shares the same `?fps=1` gate via a per-scene `isFpsOverlayEnabled`
helper. Plinth-mounted UI primitives are unaffected.

**Section-tab + canonical-forms-heading anchoring (#255 PR1).** The
4-element vertical rack at the left of the plinth (canonical-forms
heading + 3 SectionTabs) is centered on the working-surface
mid-Y = 0.275. Constants in `index.ts`:

- `PLINTH_SECTION_TAB_HEADING_Y = 0.44`
- `PLINTH_SECTION_TAB_TOP_Y = 0.31`
- `PLINTH_SECTION_TAB_PITCH = 0.13` (unchanged)

Tabs land at slot-Y `0.31 / 0.18 / 0.05`. The geometry honors the
fact that SectionTab labels sit ABOVE their button bodies (per
`SectionTab.ts:34–36`: `labelOffsetY = +0.04`, `labelAnchorY =
'bottom'`, `labelFontSize = 0.035`), so the tight edges are the
**heading label vs slab back edge** (top of rack) and the **bottom
tab sphere vs slab front edge** (bottom of rack). With these
constants: heading label top at slot-Y `0.518` (32 mm clear of back
edge); bottom-tab sphere bottom at slot-Y `0.029` (29 mm clear of
front edge); rack envelope `[0.029, 0.518]` centered on `0.275`. See
the bracket + next-step doc comment on the constants for the
binary-search bracket.

Pre-PR1 (`main`): HEADING_Y was at 0.55 (flush with the back edge),
so the heading button's upper hemisphere read as floating in air
behind the surface and the rack as a whole bunched against the back.

**SectionTab label rendering on the tilted surface (#255 PR2).**
SectionTab + canonical-forms heading sit ON the slab (not in mid-air
above it like the readouts), so the readout-billboard carve-out
above doesn't fit — yaw-billboarding their text labels would produce
a compound rotation (label inherits surface tilt from parent group,
AND yaws about that tilted local-Y axis) that clips text into the
slab volume. The fix: `SectionTab.ts` opts its module-level VISUALS
into `labelOrientation: 'surface'` (a new `TapButtonVisuals` field
added in PR2). `TapButton` reads this at ctor time, identity-sets
`label.rotation`, and short-circuits the yaw-billboard write in
`faceCamera`. Labels co-tilt with the slab through the parent
group's transform — no plane divergence, no clipping. Worst-case
viewer-relative foreshortening across plausible head poses is ~8%
(per the §3.2 pose matrix in
`_private/plans/255-section-tab-anchoring-labels.md`), well below
the legibility floor at the existing 0.035 m font + 8% troika
outline. Preset / SceneTab keep the default `'face-camera'` — they
mount in mid-air above the slab where yaw-billboard is desired
(audited as part of PR2's subclass option-forwarding sweep).

**Grab radius retune.** `GRAB_RADIUS_MULTIPLIER_PLINTH = 1.5`
(`scaffold/ui/clusterRackTokens.ts`) replaces the mid-air `2.75` for
every interactive primitive on the plinth — sliders / presets /
tabs / heading / cross-section toggles. Plinth-mounted UI changes
the kinematics from controller-aim-AT to hand-TO-surface, where a
tighter radius reads as precise rather than fiddly. First-pass
smoke-tunable (bracket `[1.25, 2.0]`); the value is pancake-biased,
and the §6 headset smoke checklist evaluates grab comfort separately
per form factor.

**AxisToggle carve-out (`:1073`).** The cross-section axis toggle's
slider-local position (`toggle.group.position.set(CROSS_SECTION_TOGGLE
_OFFSET_X, 0, 0)`) is unchanged — the toggle is a child of its
slider's group via `slider.group.add(toggle.group)`, so it inherits
the slider's plinth-slot transform transitively. Not a slot itself;
not in the manifest. The toggle's hit-sphere math against the
slider thumb stays disjoint at the new 1.5× multiplier (the
`CROSS_SECTION_TOGGLE_OFFSET_X = -0.22` separation is generous
relative to the tighter hit radius).

PR2 (#251) closed the cluster sweep — all four cluster scenes
(quadrics, tangent-planes, gradient-levels, saddle-extrema) now use
`GRAB_RADIUS_MULTIPLIER_PLINTH = 1.5` and slot their interactive UI
under their own plinth. The pre-plinth `GRAB_RADIUS_MULTIPLIER = 2.75`
export was deleted from `scaffold/ui/clusterRackTokens.ts` at the
same PR; the static-grep regression test in `test/exhibits/`
enforces zero references in `.ts` files repo-wide.

## Plinth panel-backing (#252)

`EquationReadout` extends the shared `PanelReadout` base
(`scaffold/ui/PanelReadout.ts`) which contributes (1) the THREE.Group
construction + boot-cloak, (2) the per-frame yaw-only `faceCamera`
billboard (formerly duplicated identical-by-copy across the four
cluster readouts), and (3) a dark `MeshBasicMaterial` back-plate slab
sized to the readout's worst-case content + padding (front face flush
with the original PlaneGeometry position, extruded behind by
`READOUT_PANEL_DEPTH` so yaw-billboard motion reads as a solid screen
turning, not a flat decal sliding — #270).

Per parent plan #225 §3.5 v3 lock (option-c), the back-plate sits as
a child of the readout's group, so it inherits the yaw-billboard
rotation transitively — panel + text yaw-billboard together as a
single facing-the-user panel. PR3 does NOT counter-rotate the panel
to surface-tilt with the plinth slab; that path is reserved as a
smoke-escape follow-up if the option-c read disagrees in headset.

**Panel dimensions:** `READOUT_PANEL_HALF_WIDTH_EQUATION = 0.260 m`,
`READOUT_PANEL_HALF_HEIGHT_EQUATION = 0.055 m`. Computed from the
existing em-width constants — worst-case bottom line `4 × NUMERIC_SLOT_EM
(2.6) + 3 × SEPARATOR_SLOT_EM (2.4) = 17.6 em × 0.028 m = 0.493 m`,
half + 0.012 m padding = 0.258 → rounded 0.260. The envelope assertion
in `test/scaffold/ui/PanelReadout.test.ts` locks the math against
future formatter drift. Bracket [0.255, 0.280]; smoke-tunable.

**Cloak normalization.** EquationReadout was already at the
target pattern pre-#252 — `hasBootstrapped` field + throttle-bypass
on first call + post-sync `group.visible = true`. No setValues
changes in this scene.
