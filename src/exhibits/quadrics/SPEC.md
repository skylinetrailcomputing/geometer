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
- **Snap-to-zero detent:** when a slider's continuous position satisfies
  `|v| < 0.05`, its reported value clamps to exactly `0`. This makes the
  degeneracy boundary cases (cone, intersecting planes, single plane)
  reachable precisely instead of by approximation. The detent applies only
  at zero — no other snapping in v0.1.
- **Per-slider visual:** horizontal track with a draggable thumb, labeled
  with its variable name (`a`, `b`, `c`, `d`) and current numeric value to
  two decimal places. The label is mounted just left of the track,
  parented to the slider's group so it tracks position automatically;
  variable name on the primary line (large), signed value on the
  secondary line (small). Yaw-only billboarded, sharing the same
  `Label` primitive as the family label.

## Scene geometry

| Object         | Position (x, y, z)  | Notes                                 |
|----------------|---------------------|---------------------------------------|
| Surface center | `(0, 1.5, −3)`      | ~2 m in front of the standing user; close enough to walk up to, far enough that the bounding volume doesn't clip through the spawn point. |
| Slider rack    | `(0, 1.0, −0.7)`    | Below-and-in-front; reachable with controllers without a step. |
| Rack readout   | `(0, 1.4, −0.7)`    | Single classification readout above the slider rack — the family name sits in the user's gaze area while interacting (#33). Family name only; per-slider labels render values inline. Yaw-only billboarded (#29). A second surface-anchored "hero" label was tried alongside this one in v0.1 development and removed as redundant per first-headset feedback. |
| Floor          | `y = 0`             | Inherited from the shell convention; visual horizon and comfort anchor. |

Units are meters. The user's head start position is the WebXR session
origin (`y ≈ 1.6` for a standing user).

## Surface rendering

The quadric is ray-marched in a fragment shader against a world-aligned
bounding cube. Per-fragment depth is written from the implicit-surface
hit point so Quest's async spacewarp reprojects against the visible
surface rather than the bounding cube (#3 / earlier).

**World-axis gridlines** (#34) are mixed into the surface color at every
fragment whose hit point is near an integer multiple of the grid spacing
on any of the three world axes. The grid is anchored to world `(0, 0, 0)`
— not to the surface center — so the surface reads as carved out of a
fixed 3D coordinate frame, and walking around the surface in roomscale
gives parallax through the grid lines (stronger 3D readout than a
uniformly-lit single-color quadric). Line spacing 0.5 m, near-black
"carved" line color, anti-aliased via `fwidth`. Decorative depth cue
only — labels / measurement come in v0.2.

## Frame-pacing knobs (#38)

Two surgical knobs land in v0.1.1 to tighten the labels-vs-surface
asymmetry first reported post-#8 (smooth surface, slightly-jank UI):

- **Quest fixed foveated rendering** at maximum
  (`renderer.xr.setFoveation(1.0)` in the shell). Frees GPU budget on
  the periphery; applies to every exhibit, not just this one. Static
  / center-of-view foveation (Quest 3S has no eye tracking).
- **Throttled per-slider value-label refresh** during an active drag
  (≤30 Hz, see `LABEL_SYNC_INTERVAL_MS` in `Slider.ts`). Bounds the
  rate of troika SDF `.sync()` calls — head-pose billboarding still
  runs every frame, so motion smoothness is untouched. Outside an
  active drag the label refreshes every tick so the post-release
  value is exact.

Both are reversible knobs. Profile-guided follow-ups (ray-march
`STEPS`, framebuffer scale factor, etc.) deferred to a follow-on PR
if these don't fully close the gap.

## Label content

One classification readout plus one label per slider:

- **Rack readout** — single line, billboarded, anchored above the
  slider rack. The family name sits in the user's gaze area during
  interaction. Renders one of the `Family` strings from the taxonomy
  (e.g., `Hyperboloid (1 sheet)`, `Cone`, `Empty set`, `Degenerate`).

- **Per-slider labels** — variable name (large) and signed value to
  two decimals (small), parented to each slider's group. Sign is
  always shown explicitly so the visual jump from `+0.05` to `−0.05`
  is unambiguous to the learner. See "Slider model" above.

All labels re-classify / re-format every frame.

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
