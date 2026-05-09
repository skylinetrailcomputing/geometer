import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { registerExhibit } from '../../shell/registry';
import {
  BLUISH_GREEN,
  DEFAULT_AXIS_COLORS,
  SKY_BLUE,
  VERMILLION,
  YELLOW,
} from '@/scaffold/design/tokens';
import { classify, getPlanePose } from './classify';
import { createDoublePlane, type DoublePlaneHandles } from './DoublePlane';
import { EquationReadout } from './EquationReadout';
import { FpsOverlay } from '@/scaffold/perf/FpsOverlay';
import { Label } from '@/scaffold/ui/Label';
import { Preset, type LinearPresetValues, type PresetValues } from '@/scaffold/ui/Preset';
import { PresetTween } from '@/scaffold/anim/PresetTween';
import { createImplicitSurface } from '@/scaffold/render/ImplicitSurface';
import { RendererInfoProbe } from '@/scaffold/perf/RendererInfoProbe';
import { Section } from '@/scaffold/ui/Section';
import { SectionTab } from '@/scaffold/ui/SectionTab';
import { Slider, type ThumbShape } from '@/scaffold/ui/Slider';
import { AxisToggle } from './AxisToggle';
import { createSlicingPlanes, type SlicingPlanesHandles } from './SlicingPlane';
import { WorldAxes, type AxisName } from '@/scaffold/ui/WorldAxes';

// Pushed back from z=-3 to z=-4 as the v0.1.x comfort buffer (#44) — gives
// extreme-parameter expansions ~1 m of headroom before they invade the
// viewer's space at default spawn. Secondary benefit observed in headset:
// a wider parameter band on slider `b` (math-Y, the axis pointing at the
// user) where the user remains *outside* the surface entirely, avoiding
// the more-disorienting "rendering the inside of the ellipsoid" failure
// mode. The companion 45° yaw originally landed alongside this push-back
// was reverted post-headset (didn't add the comfort / intuition it was
// meant to, and broke the rectilinear math/standing-frame alignment);
// door open for non-rectilinear perspectives once teleportation lets the
// user self-position.
const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);
const SLIDER_RACK_CENTER = new THREE.Vector3(0, 1.0, -0.7);

// Vertical stacking (top → bottom):
//   centered column (x = 0):
//     y = 1.85  — debug FPS overlay (?fps=1, hidden by default)
//     y = 1.72  — preset 2 × 4 grid row 0 (centered on x = 0, slightly above
//                 classifier so labels don't overlap the family text)
//     y = 1.59  — preset 2 × 4 grid row 1
//     y = 1.41  — family classifier readout
//     y = 1.32  — live equation readout (#58)
//     y = 1.21  — top slider 'a' (= SLIDER_RACK_CENTER.y + 1.5 * SLIDER_ROW_PITCH)
//   left rack (x = -0.44) — section / canonical-forms tabs (#93 follow-up):
//     y = 1.50 — Canonical forms expandable heading (▸ collapsed / ▾ expanded)
//     y = 1.27 — Squared terms tab
//     y = 1.04 — Linear terms tab
//     y = 0.81 — Cross sections tab
//   right side (x ≈ 0.35):
//     y = 1.17 — math-frame axis indicator origin (Z arrow points up to ≈ 1.32,
//                aligning the indicator's top with the equation readout)
// The vertical tab rack replaced an earlier horizontal row at y = 1.78
// (#93 first-pass landed it horizontally; the second pass moved it left
// per headset feedback that the horizontal row was crowding the upper
// viewport and reading further from the sliders it controls than the
// rack center where the slider names live).
// #110 first-pass anchored the preset row at the heading's y. Headset
// feedback (#110 follow-up) was: 1) the grid sat left-of-center, asking
// the eye to scan away from the surface to read it; 2) the rack tabs
// crowded the grid's labels with no horizontal breathing room. Fixed by
// decoupling — grid centered on x=0 just above the classifier; rack
// shifted down + right so its column sits well clear of the leftmost
// preset col.
const RACK_LABEL_POSITION = new THREE.Vector3(0, 1.41, -0.7);
const EQUATION_READOUT_POSITION = new THREE.Vector3(0, 1.32, -0.7);

// Debug-only FPS readout (#99), gated behind `?fps=1`. Sits above the
// family classifier so it doesn't crowd the surface viewport when
// enabled. Same z-plane as the rack stack so yaw-billboarding behaves
// the same as the other readouts.
const FPS_OVERLAY_POSITION = new THREE.Vector3(0, 1.85, -0.7);

// Smaller than Label's 0.16 default; matches the closer ~0.7 m viewing
// distance from the user's spawn point.
const RACK_LABEL_PRIMARY_FONT_SIZE = 0.06;

// Math-frame axis indicator (#43): pinned next to the slider rack so it
// stays visible regardless of the surface's current parameters. x = 0.35
// sits well clear of the right end of the 0.3 m slider track (spans ±0.15
// from rack center). y = 1.17 raises the origin so the Z-axis arrow (which
// extends up by AXIS_LENGTH = 0.15) terminates at y ≈ 1.32 — aligned with
// the equation readout, per #110 follow-up. Was at y = 0.925 (centered
// on the rack), but headset feedback was that the indicator read as
// "down by the floor" instead of as a reference for the math frame the
// equation is written in. z matches the slider plane.
const AXIS_INDICATOR_POSITION = new THREE.Vector3(0.35, 1.17, -0.7);

// Section-selector tab rack (#57; rotated to a vertical left column in
// #93; relocated in #110 follow-up): a stack of buttons at the left of
// the slider rack. Each button is a tab (Squared terms, Linear terms)
// or the canonical-forms expandable heading; tapping a section tab swaps
// which sliders are visible and grabbable. Today's sections: "Squared
// terms" and "Linear terms" (#88; the squared-terms tab was originally
// named "Coefficients" — renamed in the #110 follow-up so the two tab
// labels read as a parallel pair: squared coefficients vs. linear
// coefficients, both sharing the same axis-color story).
//
// Once the preset grid was decoupled from the heading and centered on
// x=0, the rack lost its anchoring purpose at the top of the viewport
// and became free to descend. Headset feedback after #110 first pass:
// give the rack horizontal breathing room from the grid (the tab label
// was visually colliding with the H-2-sheets / Cylinder column) and
// bring it down to a comfortable reach height. x = -0.44 sits just
// inside v0.1's -0.45 while leaving comfortable horizontal clearance
// from the leftmost preset col at -0.195; y = 1.50 + pitch 0.23 lands
// Squared terms across from the equation readout, Linear terms just below
// the bottom slider 'd' / 'w', and Cross sections one slot further down
// — clear of the slider rack rather than crammed inside it. With three
// sections the rack now spans the full vertical extent of the slider
// column; if a fourth lens lands the pitch will need to tighten to fit.
const SECTION_TAB_RACK_X = -0.44;
const SECTION_TAB_RACK_TOP_Y = 1.50;
const SECTION_TAB_RACK_PITCH = 0.23;

// Canonical-pose preset grid (#46, relocated #93, restructured #110):
// 2 × 4 grid anchored to the canonical-forms heading on the left rack,
// extending rightward and downward. Hidden by default; tapping the
// heading reveals it.
//
// Was a vertical column to the left of the slider rack at x = -0.45 (#46);
// moved out of that slot in #93 because the rack was reading as a third
// UI element competing with the slider rack and the section tabs. Presets
// are also now globally scoped — they drive the coefficient rack to a
// canonical pose and zero (or, for paraboloid / saddle, fix) the linear-
// term rack regardless of the active section (the latter half came in via
// #92, with the linearValues hook landing in #110), which fits naturally
// with their new position above the section boundary rather than inside
// one tab.
//
// 2 × 4 layout (#110): the original 1 × 7 row reached too far rightward
// to comfortably scan; reshaping into 2 rows × 4 cols keeps the same
// horizontal pitch (0.13 m, sized to the longest label "H 2-sheets") but
// halves the rightward reach. Drop "Sphere" — Reset is identical (both
// (1,1,1,1)) and "Reset" carries the wider UX meaning, with Ellipsoid
// adjacent for the closest related pose. Add Paraboloid + Saddle to fill
// out the bottom row, completing the rank-2 quadric tour the v0.1 row
// was missing.
//
// Reading order is row-major left → right, top → bottom:
//   Row 0: Reset, Ellipsoid, Cone, H 1-sheet
//   Row 1: H 2-sheets, Cylinder, Paraboloid, Saddle
//
// Values are slider-frame (a, b, c, d) per the math convention from #43:
// X right, Y forward, Z up. So Cylinder (1, 1, 0, 1) is `X² + Y² = 1`, a
// vertical (math-Z-aligned) cylinder; Cone (1, 1, -1, 0) opens along
// math-Z (vertical); Paraboloid (1, 1, 0, 0) with linearValues (0, 0, -1)
// reads as Z = X² + Y² (open upward along math-Z); Saddle (1, -1, 0, 0)
// with the same linearValues reads as Z = X² - Y².
const PRESETS: readonly {
  readonly name: string;
  readonly values: PresetValues;
  readonly linearValues?: LinearPresetValues;
}[] = [
  // Row 0
  { name: 'Reset', values: [1, 1, 1, 1] },
  { name: 'Ellipsoid', values: [2, 0.5, 1, 1] },
  { name: 'Cone', values: [1, 1, -1, 0] },
  { name: 'H 1-sheet', values: [1, 1, -1, 1] },
  // Row 1
  { name: 'H 2-sheets', values: [1, 1, -1, -1] },
  { name: 'Cylinder', values: [1, 1, 0, 1] },
  { name: 'Paraboloid', values: [1, 1, 0, 0], linearValues: [0, 0, -1] },
  { name: 'Saddle', values: [1, -1, 0, 0], linearValues: [0, 0, -1] },
];

// Preset grid expansion (#93, 2 × 4 in #110, decoupled in #110 follow-up).
// 8 preset buttons in a 2-row × 4-col grid, centered horizontally on x = 0
// directly above the family-classifier readout. Hidden by default; the
// heading's chevron toggle makes the grid visible.
//
// First pass in #110 anchored the grid at the heading's (x, y) and
// extended rightward, putting the grid's center off to the left and
// asking the eye to scan away from the surface to read it. Headset
// feedback was: re-center over the classifier text. Decoupling the grid
// from the heading lets each find its own comfortable spot — heading
// down + left as the section-tab anchor, grid up + center as the
// canonical-pose menu sitting visually above the live classification.
// The chevron on the heading still affords expand/collapse; spatial
// adjacency isn't the only legible signal.
//
// 4 buttons × 0.13 m horizontal pitch span 0.39 m, centered on x = 0
// (cols at -0.195, -0.065, 0.065, 0.195) — fits within arm's reach and
// stays clear of the family-classifier label's horizontal extent.
// Vertical pitch matches the horizontal so cells read as roughly square,
// and so row 1 lands above the classifier with comfortable clearance.
// First-iteration trial in #93 used 0.08 horizontal pitch and was
// reported as "smooshed" in headset: labels (down to "H 2-sheets") need
// ~0.11 m of horizontal real estate at the chosen 0.022 m font, so 0.08
// had labels overlapping into adjacent buttons.
const PRESET_COLS = 4;
const PRESET_ROW_TOP_Y = 1.72;
const PRESET_HORIZONTAL_PITCH = 0.13;
const PRESET_VERTICAL_PITCH = 0.13;
// Centers the 4-col span on x = 0: leftmost col at -1.5 × pitch.
const PRESET_ROW_START_X = -1.5 * PRESET_HORIZONTAL_PITCH;

// Canonical-forms heading label text. Includes a chevron that flips on
// expand/collapse so the affordance is unambiguous even at a glance:
// ▸ when collapsed (tap to expand to the right), ▾ when expanded.
const CANONICAL_FORMS_LABEL_COLLAPSED = 'Canonical forms ▸';
const CANONICAL_FORMS_LABEL_EXPANDED = 'Canonical forms ▾';

// Half-extent of the raymarcher's AABB around uSurfaceCenter. Bumped from
// 2.5 to 3.5 (#87) to give linear-term sliders u/v/w (#85, ±2 each) room to
// translate the implicit surface without pushing its visible region outside
// the cube. The cost is per-step thickness in the raymarch (cube grows ~1.4×
// per axis); per #102 the per-fragment STEPS loop turned out to be the
// dominant steady-state cost, so the four-knob ladder there compensates
// (FBO scale 0.85 in #114, then STEPS 96 → 64 here, with BOUND tighten
// queued as knob 3 if more headroom is needed).
const BOUND = 3.5;
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();

// Slider snap-to-zero detent half-width, per SPEC.md "Slider model".
// Lets the user park exactly on a degeneracy boundary (cone, single
// plane, etc.) instead of approximating. Passed into every
// scaffold/ui/Slider construction in this exhibit.
const SLIDER_SNAP_DETENT = 0.05;

// Preset → preset family-morph tween parameters (#56). 0.9 s after a
// headset trial of the original 0.3 s — three-times slower reads as
// deliberate enough to actually watch the family-classifier readout
// flip across the morph, where 0.3 s was over before the eye could
// track. Tunable; the issue defers final calibration to in-headset
// feel. Cubic ease-in-out reads as "deliberate" rather than "snappy"
// at this duration. Both are passed explicitly to PresetTween.
const PRESET_TWEEN_DURATION_MS = 900;
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Ray–thumb / ray–button hit-test sphere is this multiple of each
// primitive's visual radius. Wider than the visual makes re-grab
// forgiving when the hand drifts off-aim during release. Used
// consistently across this exhibit's Slider, Preset, and SectionTab
// constructions so all three feel the same when sweeping the
// controller across the rack. Formerly hardcoded inside each
// primitive (#120 made it a required ctor option).
const GRAB_RADIUS_MULTIPLIER = 2.75;

// Vertical stacking pitch for the rack. SPEC pins the rack center but
// not per-slider positions. Lower bound is set by the slider's grab
// region: at thumbRadius (0.025) × GRAB_RADIUS_MULTIPLIER (2.75), each
// thumb's hit sphere is ~0.069 m, so adjacent thumbs need ≥ 0.138 m of
// pitch to keep their grab regions disjoint (otherwise a ray near the
// midpoint could resolve to either slider). 0.14 leaves ~2.5 mm of
// clearance — tighter than the original 0.15 (#110 follow-up: headset
// feedback called the rack overly spread out and asked for a more
// compact stack), but still above the disjoint-grab floor.
const SLIDER_ROW_PITCH = 0.14;

// Wong / Okabe-Ito colorblind-safe palette imported from
// @/scaffold/design/tokens (#120). The fourth slot — yellow on slider
// `d` — marks the constant term as conceptually distinct from the axis
// coefficients (Q1, see #58 history).

// Per-slider config: name + base color + thumb shape. Color is the
// at-a-glance identification; shape additionally maps each axis-coefficient
// slider's thumb to its spatial direction — bidirectional 3D arrows
// aligned with the corresponding world axis (slider 'a' = math-X arrow
// along the track; slider 'b' = math-Y arrow forward/back from the
// viewer; slider 'c' = math-Z arrow up/down). Slider 'd' is the constant
// term and has no spatial direction, so a directionless sphere reads
// pedagogically truthful. Replaces the original sphere/cube/octahedron/
// cylinder set from #58 (Q4 redundancy cue) — those were visually
// distinct but didn't carry meaning; the arrows do.
type CoeffName = 'a' | 'b' | 'c' | 'd';
const SLIDER_CONFIG: readonly {
  readonly name: CoeffName;
  readonly color: number;
  readonly shape: ThumbShape;
}[] = [
  { name: 'a', color: VERMILLION,   shape: 'arrow-x' },
  { name: 'b', color: BLUISH_GREEN, shape: 'arrow-y' },
  { name: 'c', color: SKY_BLUE,     shape: 'arrow-z' },
  { name: 'd', color: YELLOW,       shape: 'sphere' },
];

// Linear-terms section (#88, scoped by #85). Each slider drives the linear
// coefficient on its same-axis math-frame variable: `u` shifts the surface
// along math-X, `v` along math-Y, `w` along math-Z. Reusing the
// vermillion / bluish-green / sky-blue palette + axis-arrow shapes from
// the coefficient rack keeps the "color = math axis" identification
// consistent across sections — a vermillion thumb means math-X regardless
// of which section is active. The label tells the user which math role
// (squared coefficient vs. linear coefficient) the axis is parameterized
// by; the section tab tells them which lens they're in.
type LinearName = 'u' | 'v' | 'w';
const LINEAR_SLIDER_CONFIG: readonly {
  readonly name: LinearName;
  readonly color: number;
  readonly shape: ThumbShape;
}[] = [
  { name: 'u', color: VERMILLION,   shape: 'arrow-x' },
  { name: 'v', color: BLUISH_GREEN, shape: 'arrow-y' },
  { name: 'w', color: SKY_BLUE,     shape: 'arrow-z' },
];

// Cross-sections section (#84, expanded #112, toggles #134). Three sliders
// x₀/y₀/z₀ driving math-axis-aligned slicing planes through the implicit
// surface. The shader brightens a per-axis-colored glow band where the
// surface meets each plane, so dragging a slider sweeps a glowing
// intersection curve along that axis — the conic-sections-from-a-cone
// story made manipulable, with the *axis-asymmetry* lesson restored (e.g.
// a 1-sheet hyperboloid sliced on its axis of revolution gives ellipses;
// sliced orthogonally gives hyperbolas — different families from the same
// surface).
//
// All three rings co-render in their own per-axis color so the default
// all-zeros pose draws three orthogonal cross-sections through the
// surface center — the section's pedagogy is visible without dragging.
// Each slider also carries an axis-colored on/off toggle (#134) at the
// inside end of its track; toggling an axis off hides that ring + plane
// without affecting the other two or re-zeroing its slider, so the user
// can isolate one axis after the introductory pose ("show only the
// z-slice while I sweep z₀").
//
// Range ±2.5 keeps each plane within the surface envelope: the raymarcher
// AABB half-extent is BOUND = 3.5 in surface-local coords, but the visible
// surface is concentrated in the inner ~±2 region for non-degenerate
// poses, so ±2.5 covers "sweep all the way through and a bit past" without
// wasting slider travel on regions where the curve doesn't show.
const CROSS_SECTION_SLIDER_RANGE = 2.5;
// Axis-toggle position offset from the slider's group origin, in slider-
// local coords (slider.group has no rotation, so local = world frame).
// Slider track spans x ∈ [−trackHalfLength, +trackHalfLength] = [−0.15,
// +0.15] at the default 0.3 m track. The toggle parks past the inside
// (−x) end of the track — the rack-controls side of the layout sits to
// the left (section tabs at x = −0.44, world axes indicator on the
// right at x = +0.35), so "inside" toward the existing controls cluster
// reads more naturally than the +x end.
//
// Offset −0.22: the slider thumb's hit sphere (radius 0.025 × multiplier
// 2.75 = 0.069 m) extends past its visible thumb by ~0.044 m on each
// side. At thumb mid-range (default value 0, thumb at x = 0), the
// toggle's hit sphere at x ∈ [−0.253, −0.187] sits 0.118 m clear of
// the thumb's hit sphere [−0.069, +0.069] — a comfortably disjoint
// region for ray-aim. At the slider's leftmost extreme (−2.5, thumb
// at x = −0.15, hit sphere [−0.219, −0.081]), the toggle's hit sphere
// overlaps the thumb's by 0.032 m, but the toggle-first dispatch order
// in selectstart resolves overlapping rays to the toggle — so the
// toggle stays tappable at any slider value. Pushing the offset further
// out (e.g. −0.26, fully disjoint at all values) would visually
// disconnect the toggle from its slider; −0.22 keeps it clearly grouped.
const CROSS_SECTION_TOGGLE_OFFSET_X = -0.22;
type CrossSectionName = 'x₀' | 'y₀' | 'z₀';
const CROSS_SECTION_SLIDER_CONFIG: readonly {
  readonly name: CrossSectionName;
  readonly color: number;
  readonly shape: ThumbShape;
}[] = [
  { name: 'x₀', color: VERMILLION,   shape: 'arrow-x' },
  { name: 'y₀', color: BLUISH_GREEN, shape: 'arrow-y' },
  { name: 'z₀', color: SKY_BLUE,     shape: 'arrow-z' },
];
// Section names are also the labels rendered on each tab. The cross-
// section name doubles as the active-section identifier driving
// uPlaneActive (#84) — the glow band only fires when this section is
// focused.
const CROSS_SECTION_SECTION_NAME = 'Cross sections';

// Math-frame axis indicator colors. Geometer's house convention
// (matching the slider rack: slider `a` ⇔ math-X ⇔ vermillion, etc.)
// lives in scaffold/design/tokens as DEFAULT_AXIS_COLORS; quadrics
// passes it explicitly to WorldAxes below.
const AXIS_COLORS: Record<AxisName, number> = DEFAULT_AXIS_COLORS;

// Numeric-slot colors for the equation readout, indexed in visual reading
// order [a, b, c, u, v, w, d] (#89). Linear-term slots (u/v/w) reuse the
// quadratic-term axis colors so the equation block tells the same axis
// story twice — once on the top line for the squared coefficients, once on
// the bottom for the linear ones — matching the slider rack's color story.
const EQUATION_COEFFICIENT_COLORS: readonly [
  number, number, number, number, number, number, number,
] = [
  VERMILLION,    // a
  BLUISH_GREEN,  // b
  SKY_BLUE,      // c
  VERMILLION,    // u
  BLUISH_GREEN,  // v
  SKY_BLUE,      // w
  YELLOW,        // d
];

// Debug sweep on `a`: gated off once controller sliders took over (#5).
// Re-enable for shader / boundary-case debugging without controllers.
// Sweeps `uA` only — `uB`/`uC`/`uD` continue tracking their sliders, which
// is fine for the original use case (verify single-axis morphing) but
// produces mixed live/sweep state if you forget. Adjust if needed.
const DEBUG_SWEEP = false;
const SWEEP_PERIOD = 8;

// Quadrics-side GLSL feeding `createImplicitSurface` from
// scaffold/render/ImplicitSurface (#129). The harness owns the vertex
// shader, ray–AABB clip, fixed-step march + bisection, surface-local
// frame, and depth write; everything below is the surface-specific
// remainder — uniform decls, helper functions, the implicit form
// `f(p) = ax² + by² + cz² + ux + vy + wz − d`, and the `shadeHit` body
// (lambert + parametric/world-axis grid switch + cross-section glow).

const QUADRICS_UNIFORM_DECLS = /* glsl */ `
  uniform float uA;
  uniform float uB;
  uniform float uC;
  uniform float uD;
  uniform float uU;
  uniform float uV;
  uniform float uW;
  // Cross-sections section (#84, expanded #112, toggles #134): math-axis
  // slicing-plane offsets in surface-local *math* coords (x₀, y₀, z₀
  // direct from the sliders — the math→world swap happens in shadeHit).
  // uPlaneActive is 0 when any other section is focused so the glow
  // bands only render while the user is viewing the slicing lens.
  // uPlaneEnableX/Y/Z (1 / 0) further gate each axis individually within
  // the section, driven by the per-slider AxisToggle (#134).
  uniform float uPlaneX;
  uniform float uPlaneY;
  uniform float uPlaneZ;
  uniform float uPlaneActive;
  uniform float uPlaneEnableX;
  uniform float uPlaneEnableY;
  uniform float uPlaneEnableZ;
  uniform vec3  uLightDir;
  uniform vec3  uBaseColor;
`;

const QUADRICS_HELPERS = /* glsl */ `
  // Per-axis glow colors for the slicing-plane intersection rings,
  // matching the slider rack's vermillion/green/sky-blue math-axis
  // palette so each ring's color identifies which plane drew it.
  // Pedagogically critical for the all-zeros default pose where three
  // orthogonal rings co-render through the surface center — without the
  // color split they'd read as one curve.
  const vec3  PLANE_GLOW_COLOR_X = vec3(0.84, 0.37, 0.00);  // vermillion
  const vec3  PLANE_GLOW_COLOR_Y = vec3(0.00, 0.62, 0.45);  // bluish-green
  const vec3  PLANE_GLOW_COLOR_Z = vec3(0.34, 0.71, 0.91);  // sky-blue
  // Half-width of the glow band in surface-local meters. 0.04 ≈ 4 cm at
  // SURFACE_CENTER's natural scale; wide enough that the ring is legible
  // through anti-aliasing as the plane sweeps, narrow enough that the ring
  // reads as a curve rather than a wash.
  const float PLANE_GLOW_HALF_WIDTH = 0.04;
  // Peak additive contribution at plane-center. Strong enough to read as
  // "this is the cross-section" against the dimmest base color, capped so
  // the ring doesn't blow out highlights on already-bright Lambertian areas.
  const float PLANE_GLOW_INTENSITY = 0.85;

  // Gridline color + intensity — shared between world-axis (#34) and
  // parametric (#45) gridlines, which never co-render (#45 switch
  // behavior). Near-black so the lines read as "carved into" the surface;
  // intensity caps the darkening at line-center.
  const float GRID_FREQ = 2.0;            // World-axis: lines every 0.5 m.
  const float GRID_INTENSITY = 0.6;
  const vec3  GRID_COLOR = vec3(0.05);

  // Parametric grid line counts. LAT/LON are uniform on bounded angular
  // ranges; hyperboloid u is unbounded, so spaced by density rather than
  // fixed count. Density 1.5 ⇒ a line every ~0.67 in hyperbolic-arc units,
  // ~8 lines across the visible surface at default scale.
  const int   PARAM_LAT_LINES      = 12;
  const int   PARAM_LON_LINES      = 12;
  const float PARAM_HYP_DENSITY    = 1.5;
  // Generous compared to the classifier's 1e-6 — slider snap-detent already
  // pins zeros exactly, so anything between PARAM_SIGN_EPSILON and 0.05
  // never appears in practice. Keeps the shader dispatch stable through
  // floating-point noise.
  const float PARAM_SIGN_EPSILON   = 1e-4;

  // Anti-aliased fract-based line mask. Used independently for each grid
  // direction so each gets its own fwidth — avoids the near-pole smear
  // that fwidth(min(latDist, lonDist)) would produce on the ellipsoid
  // (longitude derivatives blow up near the poles where lines converge).
  float lineMaskAA(float t) {
    float d = abs(fract(t) - 0.5);
    return 1.0 - smoothstep(0.0, 1.5 * fwidth(d), d);
  }

  // Inverse hyperbolic sine via the analytic identity. GLSL ES 3.00 has
  // asinh as a builtin, but Three.js ShaderMaterial defaults to GLSL ES
  // 1.00 syntax (compiled against WebGL2), where asinh isn't available —
  // so we roll our own to stay version-portable.
  float asinhSafe(float x) {
    return log(x + sqrt(x * x + 1.0));
  }

  // Family dispatch derived from sign(uA, uB, uC, uD) directly — keeps the
  // shader self-contained (no extra uniforms) and avoids duplicating the
  // taxonomy from classify.ts. Three buckets where parametric is natural:
  //   * ellipsoid → spherical (θ, φ); polar axis = world-Y (math-Z up
  //     per #43's axis convention).
  //   * 1-sheet hyperboloid → (u, v); axis of revolution = the
  //     opposite-sign-from-uD coefficient.
  //   * 2-sheet hyperboloid → (u, v); axis of separation (sheet axis) =
  //     the same-sign-as-uD coefficient.
  // Cylinders / cones / planes / degenerates / empty set get .y = 0.0
  // ("family inactive") and the caller draws the world-axis grid instead.
  // Returns vec2(gridMask, familyActive) — when inactive, gridMask is
  // unspecified and the caller must gate on familyActive.
  vec2 parametricGrid(vec3 p) {
    float aSign = (abs(uA) < PARAM_SIGN_EPSILON) ? 0.0 : sign(uA);
    float bSign = (abs(uB) < PARAM_SIGN_EPSILON) ? 0.0 : sign(uB);
    float cSign = (abs(uC) < PARAM_SIGN_EPSILON) ? 0.0 : sign(uC);
    float dSign = (abs(uD) < PARAM_SIGN_EPSILON) ? 0.0 : sign(uD);

    if (aSign == 0.0 || bSign == 0.0 || cSign == 0.0 || dSign == 0.0) {
      return vec2(0.0, 0.0);
    }

    // Normalize to RHS = +|uD| by absorbing sgn(uD): post-normalize,
    // ellipsoid ⇔ all + ; 1-sheet ⇔ exactly one − ; 2-sheet ⇔ exactly two −.
    float aN = aSign * dSign;
    float bN = bSign * dSign;
    float cN = cSign * dSign;
    int neg = int(aN < 0.0) + int(bN < 0.0) + int(cN < 0.0);
    if (neg == 3) return vec2(0.0, 0.0);  // Empty set — never rasterizes.

    // Dimensionless on-surface coords. q.x = p.x / r_x where
    // r_x = sqrt(|uD|/|uA|). On the ellipsoid: q.x²+q.y²+q.z² = 1.
    vec3 q = p * sqrt(vec3(abs(uA), abs(uB), abs(uC)) / abs(uD));

    const float PI = 3.14159265;
    const float TWO_PI = 6.28318530;

    if (neg == 0) {
      // Ellipsoid. Polar axis = world-Y (math-Z, vertical, per #43).
      // θ ∈ [0, π], φ ∈ [-π, π].
      float theta = acos(clamp(q.y, -1.0, 1.0));
      float phi   = atan(q.z, q.x);
      float mLat = lineMaskAA(theta / PI * float(PARAM_LAT_LINES));
      float mLon = lineMaskAA((phi + PI) / TWO_PI * float(PARAM_LON_LINES));
      return vec2(max(mLat, mLon), 1.0);
    }

    if (neg == 1) {
      // 1-sheet hyperboloid. Special axis (axis of revolution) = the one
      // whose normalized sign is negative. Param:
      //   non-special axes: (cosh u · cos v, cosh u · sin v)
      //   special axis    : sinh u
      // ⇒ u = asinhSafe(qSpecial), v = atan2(qOnB, qOnA).
      float qSpecial, qOnA, qOnB;
      if (aN < 0.0)      { qSpecial = q.x; qOnA = q.y; qOnB = q.z; }
      else if (bN < 0.0) { qSpecial = q.y; qOnA = q.x; qOnB = q.z; }
      else               { qSpecial = q.z; qOnA = q.x; qOnB = q.y; }
      float u = asinhSafe(qSpecial);
      float v = atan(qOnB, qOnA);
      float mU = lineMaskAA(u * PARAM_HYP_DENSITY);
      float mV = lineMaskAA((v + PI) / TWO_PI * float(PARAM_LON_LINES));
      return vec2(max(mU, mV), 1.0);
    }

    // neg == 2 → 2-sheet hyperboloid. Special axis (sheet axis) = the only
    // positive one (= same sign as uD post-normalization). Param:
    //   non-special axes: (sinh u · cos v, sinh u · sin v)
    //   special axis    : ±cosh u  (sign picks the sheet)
    // u ≥ 0 measures distance from each sheet's apex outward; u=0 at the
    // apex on either sheet, increasing radially. Sheet selector implicit
    // in sign(qSpecial) — irrelevant for gridline placement.
    float qSpecial, qOnA, qOnB;
    if (aN > 0.0)      { qSpecial = q.x; qOnA = q.y; qOnB = q.z; }
    else if (bN > 0.0) { qSpecial = q.y; qOnA = q.x; qOnB = q.z; }
    else               { qSpecial = q.z; qOnA = q.x; qOnB = q.y; }
    float u = asinhSafe(sqrt(qOnA * qOnA + qOnB * qOnB));
    float v = atan(qOnB, qOnA);
    float mU = lineMaskAA(u * PARAM_HYP_DENSITY);
    float mV = lineMaskAA((v + PI) / TWO_PI * float(PARAM_LON_LINES));
    return vec2(max(mU, mV), 1.0);
  }
`;

const QUADRICS_F_IMPLICIT = /* glsl */ `
  float fImplicit(vec3 p) {
    return uA * p.x * p.x + uB * p.y * p.y + uC * p.z * p.z
         + uU * p.x + uV * p.y + uW * p.z
         - uD;
  }
`;

// Analytic gradient of QUADRICS_F_IMPLICIT, opting out of the harness's
// central-difference default (#131). Closed-form for a quadratic polynomial,
// so no extra `fImplicit` calls per fragment, and — more important —
// constant on flat poses where central differences amplify floating-point
// noise into the math-Y = 0 fuzzy artifact tracked in #116.
const QUADRICS_GRAD_F = /* glsl */ `
  vec3 gradF(vec3 p) {
    return vec3(
      2.0 * uA * p.x + uU,
      2.0 * uB * p.y + uV,
      2.0 * uC * p.z + uW
    );
  }
`;

const QUADRICS_SHADE = /* glsl */ `
  // Gridlines as a depth cue. Two systems, never co-rendered (#45
  // headset feedback: simultaneous display read as cluttered):
  //
  //   * Parametric (#45) — lines of constant θ/φ (ellipsoid) or u/v
  //     (hyperboloids) in a family-aware natural parameterization.
  //     Lines flow with the surface as parameters morph.
  //   * World-axis (#34) — distance to the nearest integer multiple of
  //     (1 / GRID_FREQ) on each world axis. Anchored to world (0,0,0),
  //     so the surface reads as carved out of a fixed 3D coordinate
  //     frame. Used as the fallback when the family doesn't admit a
  //     natural parametric form (cylinders / cones / planes / degenerates).
  //
  // Both systems share GRID_COLOR / GRID_INTENSITY so the line character
  // stays consistent across family transitions — only the *frame* the
  // lines align to changes, reinforcing the family-classification flip
  // already shown in the rack readout above.
  //
  // fwidth-based AA keeps lines one-pixel-wide regardless of viewing
  // angle or distance; walking around the surface gives parallax through
  // whichever grid is currently active.
  vec3 shadeHit(vec3 pHit, vec3 n, vec3 hitWorld, vec3 rd) {
    float lambert = max(dot(n, normalize(uLightDir)), 0.0);
    vec3 baseColor = uBaseColor * (0.2 + 0.8 * lambert);

    vec2 paramGrid = parametricGrid(pHit);
    float gridMask;
    if (paramGrid.y > 0.5) {
      gridMask = paramGrid.x;
    } else {
      vec3 g = abs(fract(hitWorld * GRID_FREQ) - 0.5);
      float lineDist = min(min(g.x, g.y), g.z);
      float lineWidth = 1.5 * fwidth(lineDist);
      gridMask = 1.0 - smoothstep(0.0, lineWidth, lineDist);
    }
    vec3 color = mix(baseColor, GRID_COLOR, gridMask * GRID_INTENSITY);

    // Cross-sections glow bands (#84, expanded #112). Brighten pixels on
    // the surface whose surface-local position is close to each math-axis
    // slicing plane, in that plane's per-axis color. Additive (over the
    // grid mix) so the glow stays legible against either base color or
    // grid line, and smooth falloff over the band width keeps the rings
    // anti-aliased.
    //
    // Math→world axis mapping when comparing pHit (world frame) against
    // uPlane{X,Y,Z} (math-frame offsets, slider values direct):
    //   math-X plane offset x₀ → world-X = +x₀  ⇒ |pHit.x − uPlaneX|
    //   math-Y plane offset y₀ → world-Z = −y₀  ⇒ |pHit.z + uPlaneY|
    //   math-Z plane offset z₀ → world-Y = +z₀  ⇒ |pHit.y − uPlaneZ|
    // The math-Y sign flip mirrors the linear-term routing (uW = -v)
    // documented at the slider→uniform block, and exists because math-Y
    // (forward) maps to −world-Z (camera-toward).
    if (uPlaneActive > 0.5) {
      float dX = abs(pHit.x - uPlaneX);
      float dY = abs(pHit.z + uPlaneY);
      float dZ = abs(pHit.y - uPlaneZ);
      float mX = 1.0 - smoothstep(0.0, PLANE_GLOW_HALF_WIDTH, dX);
      float mY = 1.0 - smoothstep(0.0, PLANE_GLOW_HALF_WIDTH, dY);
      float mZ = 1.0 - smoothstep(0.0, PLANE_GLOW_HALF_WIDTH, dZ);
      // Per-axis toggle gating (#134). Multiplying by uPlaneEnable*
      // is equivalent to wrapping each band in an enable-> 0.5 branch
      // but avoids the divergence — same shader path regardless of
      // which axes are on.
      color += PLANE_GLOW_COLOR_X * (PLANE_GLOW_INTENSITY * mX * uPlaneEnableX);
      color += PLANE_GLOW_COLOR_Y * (PLANE_GLOW_INTENSITY * mY * uPlaneEnableY);
      color += PLANE_GLOW_COLOR_Z * (PLANE_GLOW_INTENSITY * mZ * uPlaneEnableZ);
    }
    return color;
  }
`;

let material: THREE.ShaderMaterial | undefined;
// Sections own their sliders (#57). `sliders`, `linearSliders`, and
// `crossSectionSliders` alias each section's slider array — they always
// drive the shader uniforms regardless of which section is currently
// active, so stable references are convenient for the slider→uniform
// routing block in update(). The active section gates *grab dispatch*
// (so hidden sliders aren't accidentally grabbable), not the slider-value
// -to-uniform read — that runs unconditionally for every section so e.g.
// a value mid-tween from another section keeps driving the surface even
// after a tab switch. The one exception is `uPlaneActive`, which gates the
// cross-section glow band on the active section so the ring only appears
// while the user is in the slicing lens (#84).
//
// Presets live outside the Section abstraction (#93): they're a global
// "snap to canonical pose" row that drives the coefficient rack and zeros
// the linear-term rack regardless of which section is focused. Always
// rendered, always grabbable.
let sliders: readonly Slider[] = [];
let linearSliders: readonly Slider[] = [];
let crossSectionSliders: readonly Slider[] = [];
// One toggle per cross-section slider, ordered x / y / z. Drives both
// the shader's per-axis glow gate (uPlaneEnableX/Y/Z, #134) and each
// SlicingPlane's per-mesh `.visible`. Default all-on so the section
// opens in the introductory pose from #112.
let crossSectionToggles: readonly AxisToggle[] = [];
let slicingPlanes: SlicingPlanesHandles | undefined;
// Stand-in mesh for the rank-1 + d_eff = 0 tangent-zero regime (#138).
// The raymarcher's sign-change hit detection mathematically can't catch
// a tangent zero, so we render the plane explicitly when the predicate
// fires and hide the raymarched mesh in the same step. See DoublePlane.ts.
let doublePlane: DoublePlaneHandles | undefined;
let surfaceMesh: THREE.Mesh | undefined;
let presets: Preset[] = [];
let sections: Section[] = [];
let tabs: SectionTab[] = [];
let activeSectionIndex = 0;
// Canonical-forms expandable heading (#93 follow-up). When `presetsExpanded`
// is false (default), the preset row is hidden + skipped from controller
// dispatch; the heading itself stays interactive. Tapping the heading
// flips the flag and shows / hides the row.
let canonicalFormsHeading: SectionTab | undefined;
let presetsExpanded = false;
let controllers: THREE.Object3D[] = [];
let rackLabel: Label | undefined;
let equationReadout: EquationReadout | undefined;
let fpsOverlay: FpsOverlay | undefined;
let rendererInfoProbe: RendererInfoProbe | undefined;
let worldAxes: WorldAxes | undefined;
let camera: THREE.Camera | undefined;
let elapsed = 0;
// Active preset tween (#56). Replaced on each preset press; canceled on
// slider grab so the user takes control from wherever the tween last set
// the thumb. Module-scoped so update() can tick it.
let presetTween: PresetTween | undefined;

const quadricsExhibit: Exhibit = {
  id: 'quadrics',
  title: 'Quadric surfaces',

  mount({ scene, renderer, camera: cam }: ExhibitContext) {
    camera = cam;

    // #125: hole-punch the floor inside the AABB's world-XZ footprint so it
    // doesn't occlude the lower half of the cube. Math-Z routes to world-Y;
    // with SURFACE_CENTER.y = 1.5 and BOUND = 3.5, the cube's bottom face sits
    // at world-Y = -2 while the floor sits at 0, cutting off math-Z ∈
    // [-3.5, -1.5] (most visible on vertical 2-sheet hyperboloids and 1-sheet
    // hyperboloids whose axis is math-Z). Strips outside the cube footprint
    // preserve the ground reference; the rectangle inside is left open.
    const FLOOR_HALF = 5;
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x222244 });
    const holeMinX = Math.max(SURFACE_CENTER.x - BOUND, -FLOOR_HALF);
    const holeMaxX = Math.min(SURFACE_CENTER.x + BOUND, FLOOR_HALF);
    const holeMinZ = Math.max(SURFACE_CENTER.z - BOUND, -FLOOR_HALF);
    const holeMaxZ = Math.min(SURFACE_CENTER.z + BOUND, FLOOR_HALF);
    const addFloorStrip = (
      xMin: number,
      xMax: number,
      zMin: number,
      zMax: number,
    ): void => {
      if (xMax <= xMin || zMax <= zMin) return;
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(xMax - xMin, zMax - zMin),
        floorMaterial,
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set((xMin + xMax) / 2, 0, (zMin + zMax) / 2);
      scene.add(strip);
    };
    addFloorStrip(-FLOOR_HALF, FLOOR_HALF, holeMaxZ, FLOOR_HALF); // front of cube
    addFloorStrip(-FLOOR_HALF, FLOOR_HALF, -FLOOR_HALF, holeMinZ); // behind cube
    addFloorStrip(-FLOOR_HALF, holeMinX, holeMinZ, holeMaxZ); // left of cube
    addFloorStrip(holeMaxX, FLOOR_HALF, holeMinZ, holeMaxZ); // right of cube

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.copy(LIGHT_DIR).multiplyScalar(5);
    scene.add(directional);

    const surfaceHandles = createImplicitSurface({
      surfaceCenter: SURFACE_CENTER,
      bound: BOUND,
      uniforms: QUADRICS_UNIFORM_DECLS,
      helpers: QUADRICS_HELPERS,
      fImplicit: QUADRICS_F_IMPLICIT,
      gradF: QUADRICS_GRAD_F,
      shade: QUADRICS_SHADE,
      extraUniforms: {
        uA: { value: 1.0 },
        uB: { value: 1.0 },
        uC: { value: 1.0 },
        uD: { value: 1.0 },
        uU: { value: 0.0 },
        uV: { value: 0.0 },
        uW: { value: 0.0 },
        uPlaneX: { value: 0.0 },
        uPlaneY: { value: 0.0 },
        uPlaneZ: { value: 0.0 },
        uPlaneActive: { value: 0.0 },
        uPlaneEnableX: { value: 1.0 },
        uPlaneEnableY: { value: 1.0 },
        uPlaneEnableZ: { value: 1.0 },
        uLightDir: { value: LIGHT_DIR.clone() },
        uBaseColor: { value: new THREE.Color(0.4, 0.7, 0.95) },
      },
    });
    material = surfaceHandles.material;
    surfaceMesh = surfaceHandles.mesh;
    scene.add(surfaceHandles.mesh);

    // Double-plane stand-in mesh (#138). Hidden by default; update()
    // toggles visibility against the raymarched mesh based on the
    // isDoublePlane predicate. Base color + light direction match the
    // raymarched surface so the regime transition reads as the same
    // family of object — only the geometry the user is looking at
    // changes, not the visual style.
    doublePlane = createDoublePlane({
      surfaceCenter: SURFACE_CENTER,
      halfExtent: BOUND,
      baseColor: new THREE.Color(0.4, 0.7, 0.95),
      lightDir: LIGHT_DIR,
    });
    scene.add(doublePlane.group);

    // Top → bottom: a, b, c, d. Span centered on SLIDER_RACK_CENTER.
    // Per-slider color + shape pull from SLIDER_CONFIG (#58); the
    // equation readout above the rack now carries the live coefficient
    // values, so per-slider numeric labels are gone in this version.
    const topY =
      SLIDER_RACK_CENTER.y + ((SLIDER_CONFIG.length - 1) / 2) * SLIDER_ROW_PITCH;
    const coefficientSliders = SLIDER_CONFIG.map((cfg, i) => {
      const slider = new Slider({
        label: cfg.name,
        min: -2,
        max: 2,
        initial: 1,
        snapDetent: SLIDER_SNAP_DETENT,
        grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
        baseColor: cfg.color,
        thumbShape: cfg.shape,
      });
      slider.group.position.set(
        SLIDER_RACK_CENTER.x,
        topY - i * SLIDER_ROW_PITCH,
        SLIDER_RACK_CENTER.z,
      );
      scene.add(slider.group);
      return slider;
    });
    sliders = coefficientSliders;

    // Preset 2 × 4 grid, anchored to the canonical-forms heading on the
    // left rack and extending rightward + downward (#93, restructured
    // #110). Hidden by default — the heading toggle below controls
    // visibility. Reading order is row-major left → right, top → bottom,
    // matching the array order in PRESETS above.
    presets = PRESETS.map((p, i) => {
      const preset = new Preset({ ...p, grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER });
      const col = i % PRESET_COLS;
      const row = Math.floor(i / PRESET_COLS);
      preset.group.position.set(
        PRESET_ROW_START_X + col * PRESET_HORIZONTAL_PITCH,
        PRESET_ROW_TOP_Y - row * PRESET_VERTICAL_PITCH,
        SLIDER_RACK_CENTER.z,
      );
      preset.group.visible = false;
      scene.add(preset.group);
      return preset;
    });

    // Linear-terms section sliders (#88). Same spatial position as the
    // coefficient rack — Section.setActive(false) hides whichever rack is
    // not currently selected, so they never co-render. Three rows for
    // u/v/w. Default value 0 (so the linear-terms section starts as
    // "pure quadric" until the user drags); range ±2 mirrors the
    // coefficient-slider domain.
    //
    // Top row aligned with the coefficient rack's top row (#110): u stacks
    // exactly on slider 'a', v on slider 'b', w on slider 'c'. The
    // sections never co-render, so there's no need to physically separate
    // their vertical centers — aligning the same-axis sliders keeps the
    // mental model "color = math axis" continuous when toggling between
    // sections, with the slider 'd' slot left empty in the linear section
    // (no constant-term linear analogue).
    const linearTopY = topY;
    const linearTermSliders = LINEAR_SLIDER_CONFIG.map((cfg, i) => {
      const slider = new Slider({
        label: cfg.name,
        min: -2,
        max: 2,
        initial: 0,
        snapDetent: SLIDER_SNAP_DETENT,
        grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
        baseColor: cfg.color,
        thumbShape: cfg.shape,
      });
      slider.group.position.set(
        SLIDER_RACK_CENTER.x,
        linearTopY - i * SLIDER_ROW_PITCH,
        SLIDER_RACK_CENTER.z,
      );
      scene.add(slider.group);
      return slider;
    });
    linearSliders = linearTermSliders;

    // Cross-sections section (#84, expanded #112). Three sliders x₀/y₀/z₀
    // driving math-axis-aligned slicing planes. Vermillion / bluish-green
    // / sky-blue + arrow-x/y/z mirrors the squared rack (a/b/c) and the
    // linear rack (u/v/w) row-for-row — same axis, different math role
    // per section — so "color = math axis, position = math axis" stays
    // consistent across lenses. Default 0 each so the section opens
    // showing three orthogonal cross-section rings through the surface
    // center: the section's pedagogy is visible without dragging.
    const crossSectionTopY = topY;
    const crossSectionTermSliders = CROSS_SECTION_SLIDER_CONFIG.map(
      (cfg, i) => {
        const slider = new Slider({
          label: cfg.name,
          min: -CROSS_SECTION_SLIDER_RANGE,
          max: CROSS_SECTION_SLIDER_RANGE,
          initial: 0,
          snapDetent: SLIDER_SNAP_DETENT,
          grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
          baseColor: cfg.color,
          thumbShape: cfg.shape,
        });
        slider.group.position.set(
          SLIDER_RACK_CENTER.x,
          crossSectionTopY - i * SLIDER_ROW_PITCH,
          SLIDER_RACK_CENTER.z,
        );
        scene.add(slider.group);
        return slider;
      },
    );
    crossSectionSliders = crossSectionTermSliders;

    // Per-axis on/off toggles (#134). One small axis-colored sphere per
    // cross-section slider, parented to that slider's group at the inside
    // (-x) end of the track. Default all-on preserves #112's introductory
    // pose; tapping a toggle hides that axis's ring + plane without
    // affecting the other two or re-zeroing its slider.
    crossSectionToggles = crossSectionTermSliders.map((slider, i) => {
      const cfg = CROSS_SECTION_SLIDER_CONFIG[i];
      const toggle = new AxisToggle({
        baseColor: cfg.color,
        grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
        initialEnabled: true,
      });
      toggle.group.position.set(CROSS_SECTION_TOGGLE_OFFSET_X, 0, 0);
      // Parenting to the slider's group keeps the toggle co-located if
      // the slider ever moves (e.g. a future per-section layout shuffle),
      // and lets Section.setActive on the slider's section hide the
      // toggle in lockstep with the slider via group.visible cascade.
      slider.group.add(toggle.group);
      return toggle;
    });

    // Translucent slicing-plane meshes (#113). Layers above the on-
    // surface ring shipped in #84/#111: the ring marks the cut on the
    // surface, the planes mark the cuts' own boundaries in free space.
    // Hidden by default; the section-active branch in update() flips
    // visibility on / off as the user switches lenses.
    slicingPlanes = createSlicingPlanes({
      surfaceCenter: SURFACE_CENTER,
      halfExtent: BOUND,
    });
    slicingPlanes.group.visible = false;
    scene.add(slicingPlanes.group);

    // Three sections (#88, #84). The dispatch loop below reads from
    // `sections[activeSectionIndex]` for grab dispatch and per-section
    // billboarding; the slider→uniform read in update() runs across all
    // sections every frame so non-active sliders still drive the shader
    // (cheap, and keeps any tween-in-flight from stalling on a tab switch).
    sections = [
      new Section({
        name: 'Squared terms',
        sliders: coefficientSliders,
      }),
      new Section({
        name: 'Linear terms',
        sliders: linearTermSliders,
      }),
      new Section({
        name: CROSS_SECTION_SECTION_NAME,
        sliders: crossSectionTermSliders,
      }),
    ];
    activeSectionIndex = 0;
    // Section.active defaults to true, so non-active sections need an
    // explicit hide pass at startup — otherwise both racks would render
    // simultaneously and both would be grabbable.
    for (let i = 0; i < sections.length; i++) {
      sections[i].setActive(i === activeSectionIndex);
    }

    // Vertical tab rack on the left (#93). Top → bottom: canonical-forms
    // heading (built below the section tabs but positioned above them in
    // y), then one button per Section. The slot for the heading is
    // SECTION_TAB_RACK_TOP_Y; section tabs follow at SECTION_TAB_RACK_PITCH
    // intervals below.
    tabs = sections.map((section, i) => {
      const tab = new SectionTab({
        name: section.name,
        grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
      });
      tab.group.position.set(
        SECTION_TAB_RACK_X,
        SECTION_TAB_RACK_TOP_Y - (i + 1) * SECTION_TAB_RACK_PITCH,
        SLIDER_RACK_CENTER.z,
      );
      scene.add(tab.group);
      return tab;
    });
    tabs[activeSectionIndex].setActive(true);

    // Canonical-forms expandable heading at the top of the rack (#93).
    // Reuses SectionTab for the hover / press flash / active emissive
    // machinery; the active state doubles as the expanded-state
    // indicator alongside the chevron flip.
    canonicalFormsHeading = new SectionTab({
      name: presetsExpanded
        ? CANONICAL_FORMS_LABEL_EXPANDED
        : CANONICAL_FORMS_LABEL_COLLAPSED,
      grabRadiusMultiplier: GRAB_RADIUS_MULTIPLIER,
    });
    canonicalFormsHeading.group.position.set(
      SECTION_TAB_RACK_X,
      SECTION_TAB_RACK_TOP_Y,
      SLIDER_RACK_CENTER.z,
    );
    canonicalFormsHeading.setActive(presetsExpanded);
    scene.add(canonicalFormsHeading.group);

    controllers = setupControllers(scene, renderer);

    // Family classifier readout sits at the top of the stack above the
    // rack. The live equation readout (#58) carries the four coefficient
    // numerics directly below it, replacing the per-slider labels that
    // used to live left of each track.
    rackLabel = new Label({ primaryFontSize: RACK_LABEL_PRIMARY_FONT_SIZE });
    rackLabel.group.position.copy(RACK_LABEL_POSITION);
    scene.add(rackLabel.group);

    equationReadout = new EquationReadout({
      coefficientColors: EQUATION_COEFFICIENT_COLORS,
    });
    equationReadout.group.position.copy(EQUATION_READOUT_POSITION);
    scene.add(equationReadout.group);

    worldAxes = new WorldAxes({ axisColors: AXIS_COLORS });
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    scene.add(worldAxes.group);

    // Optional in-VR FPS readout (#99) + console renderer.info dump
    // (#102). Both off by default; opt-in via a `?fps=1` query string
    // on the URL. The console probe pairs with the in-VR overlay: FPS
    // says how fast we're rendering, renderer.info says what we're
    // asking the GPU to render.
    if (isFpsOverlayEnabled()) {
      fpsOverlay = new FpsOverlay();
      fpsOverlay.group.position.copy(FPS_OVERLAY_POSITION);
      scene.add(fpsOverlay.group);
      rendererInfoProbe = new RendererInfoProbe(renderer);
    }
  },

  update({ delta }) {
    // Tabs always tick / face camera — they're cross-cutting like the
    // family classifier, not section-scoped.
    for (const t of tabs) t.updateHover(controllers);
    for (const t of tabs) t.update();
    if (camera) for (const t of tabs) t.faceCamera(camera);
    // Canonical-forms heading lives on the tab row but isn't a section
    // tab — same per-frame ticks, separate dispatch.
    if (canonicalFormsHeading) {
      canonicalFormsHeading.updateHover(controllers);
      canonicalFormsHeading.update();
      if (camera) canonicalFormsHeading.faceCamera(camera);
    }

    // Per-frame slider ticks happen across all sections so press flashes
    // and similar transient state still expire cleanly when a section is
    // hidden mid-effect; hover dispatch and faceCamera fire only on the
    // active section so invisible controls don't chase the ray or thrash
    // their billboards.
    for (const section of sections) {
      for (const s of section.sliders) s.update();
    }
    // Presets are global (#93): always tick so any in-flight press flash
    // expires cleanly even after the row collapses. Hover / billboard
    // only when expanded — collapsed presets are hidden and shouldn't
    // chase the ray (the hit-test ignores .visible) or thrash their
    // troika sync.
    for (const p of presets) p.update();
    if (presetsExpanded) {
      for (const p of presets) p.updateHover(controllers);
      if (camera) for (const p of presets) p.faceCamera(camera);
    }
    const activeSection = sections[activeSectionIndex];
    for (const s of activeSection.sliders) s.updateHover(controllers);
    // Cross-section toggles tick / hover only while their section is
    // focused. Their groups inherit visibility from the slider groups
    // (Section.setActive flips slider.group.visible), so a hidden
    // toggle still reads as inactive — but skipping hover work here
    // saves the ray-sphere test on every controller every frame when
    // the user isn't in the slicing lens.
    const crossSectionsActive =
      sections[activeSectionIndex]?.name === CROSS_SECTION_SECTION_NAME;
    if (crossSectionsActive) {
      for (const t of crossSectionToggles) {
        t.updateHover(controllers);
        t.update();
      }
    }
    // Tween advances its bound section's sliders before the slider→uniform
    // read below, so this frame's render reflects the morph. The tween
    // owns its slider reference (set at construction); this loop just
    // advances time.
    if (presetTween) {
      const stillRunning = presetTween.tick(performance.now());
      if (!stillRunning) presetTween = undefined;
    }
    // Slider → uniform routing in the math-textbook frame paired with the
    // axis indicator (#43): X right, Y forward, Z up. The shader still
    // evaluates the implicit equation in the Three.js world frame, so:
    //   slider a → math-X² → world-X² → uA
    //   slider b → math-Y² → world-Z² → uC
    //   slider c → math-Z² → world-Y² → uB
    //   slider d → uD (constant term)
    // Linear-term routing (#88) follows the same math→world swap, but on
    // the first-degree variable rather than its square. The squared rows
    // above are sign-symmetric (b · y² = b · z² regardless of sign), so
    // they need no per-axis flip. The linear rows do — specifically on
    // math-Y, which maps to −world-Z (camera looks down −Z, so the
    // textbook "forward = away from user" direction is negative
    // world-Z, per WorldAxes.ts):
    //   slider u → math-X → +world-X    → uU = +u
    //   slider v → math-Y → −world-Z    → uW = −v   (sign-flipped)
    //   slider w → math-Z → +world-Y    → uV = +w
    // The flip on `v` keeps completing-the-square consistent across all
    // three linear sliders: positive coefficient ⇒ center at −coeff/2
    // along +math-axis. Without it, only slider `v` would translate
    // the surface in the +math-direction (away from user) instead of
    // −math-direction (toward user), inverting the pedagogy and
    // contradicting the math-frame axis indicator. classify() takes
    // the math-frame (a, b, c, u, v, w) directly — see classify.ts for
    // how completing-the-square folds linears into d_eff (rank 3 / 2 /
    // 1) and how zero-axis linears introduce paraboloid / parabolic-
    // cylinder / plane families (rank 2 / 1 / 0).
    const [a, b, c, d] = sliders.map((s) => s.value);
    const [u, v, w] = linearSliders.map((s) => s.value);
    const [x0, y0, z0] = crossSectionSliders.map((s) => s.value);
    if (material) {
      material.uniforms.uA.value = a;
      material.uniforms.uC.value = b;
      material.uniforms.uB.value = c;
      material.uniforms.uD.value = d;
      material.uniforms.uU.value = u;
      material.uniforms.uW.value = -v;
      material.uniforms.uV.value = w;
      // Cross-sections planes (#84, expanded #112). uPlane{X,Y,Z} carry
      // the math-frame plane offsets straight through — the math→world
      // swap (including the math-Y → −world-Z sign flip) lives in the
      // shader's glow-band block, so this routing stays a 1:1 read of
      // the sliders. uPlaneActive gates the bands so the rings only show
      // while the slicing lens is focused.
      material.uniforms.uPlaneX.value = x0 ?? 0;
      material.uniforms.uPlaneY.value = y0 ?? 0;
      material.uniforms.uPlaneZ.value = z0 ?? 0;
      material.uniforms.uPlaneActive.value = crossSectionsActive ? 1 : 0;
      // Per-axis toggle gates (#134). Drive these unconditionally — the
      // shader still skips the entire glow-band block when uPlaneActive
      // is 0, so writing enable values while another section is focused
      // is harmless and keeps the toggle state visible the moment the
      // user returns to Cross sections.
      material.uniforms.uPlaneEnableX.value =
        crossSectionToggles[0].isEnabled ? 1 : 0;
      material.uniforms.uPlaneEnableY.value =
        crossSectionToggles[1].isEnabled ? 1 : 0;
      material.uniforms.uPlaneEnableZ.value =
        crossSectionToggles[2].isEnabled ? 1 : 0;
    }
    // Translucent slicing-plane meshes (#113). Same gate as the on-
    // surface ring's uPlaneActive — both visualizations layer in the
    // Cross sections lens and disappear together on a tab switch. The
    // math→world-axis swap (incl. math-Y → −world-Z sign flip) lives
    // inside `setOffsets`, mirroring the shader's glow-band routing.
    // Per-axis toggles (#134) further hide individual plane meshes via
    // setVisibility — the parent group's `.visible` still gates the
    // whole rack on tab switch regardless.
    if (slicingPlanes) {
      slicingPlanes.group.visible = crossSectionsActive;
      if (crossSectionsActive) {
        slicingPlanes.setOffsets(x0 ?? 0, y0 ?? 0, z0 ?? 0);
        slicingPlanes.setVisibility(
          crossSectionToggles[0].isEnabled,
          crossSectionToggles[1].isEnabled,
          crossSectionToggles[2].isEnabled,
        );
      }
    }
    // Axis-aligned single-plane regime swap (#138). When getPlanePose
    // fires we hide the raymarched mesh and surface a literal
    // PlaneGeometry in its place. Two regimes qualify: rank-1 + d_eff =
    // 0 (tangent zero — marcher's sign-change hit test never fires) and
    // rank-0 + single linear nonzero (real sign change but edge-on
    // sampling aliases at near-tangent ray angles). Both produce the
    // same visible fuzzy artifact on math-Y at natural Quest viewing
    // pose; both share the same fix shape. See classify.getPlanePose
    // for the predicate's scope.
    const planePose = getPlanePose(a, b, c, d, u, v, w);
    if (doublePlane) doublePlane.setPose(planePose);
    if (surfaceMesh) surfaceMesh.visible = planePose === null;
    if (DEBUG_SWEEP && material) {
      elapsed += delta;
      const sweep = Math.cos((2 * Math.PI * elapsed) / SWEEP_PERIOD);
      material.uniforms.uA.value = sweep;
    }
    if (rackLabel) {
      const { family } = classify(a, b, c, d, u, v, w);
      rackLabel.setPrimary(family);
      if (camera) rackLabel.faceCamera(camera);
    }
    if (equationReadout) {
      equationReadout.setValues(a, b, c, d, u, v, w);
      if (camera) equationReadout.faceCamera(camera);
    }
    if (worldAxes && camera) worldAxes.faceCamera(camera);
    if (fpsOverlay) {
      fpsOverlay.update(delta, performance.now());
      if (camera) fpsOverlay.faceCamera(camera);
    }
    if (rendererInfoProbe) rendererInfoProbe.update(performance.now());
  },
};

function isFpsOverlayEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('fps') === '1';
}

function setupControllers(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): THREE.Object3D[] {
  // Visible 1 m laser line along controller −Z, so the user can see where
  // they're aiming before pressing the trigger.
  const rayGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const rayMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
  });

  const out: THREE.Object3D[] = [];
  for (const i of [0, 1] as const) {
    const controller = renderer.xr.getController(i);
    controller.add(new THREE.Line(rayGeom, rayMat));
    scene.add(controller);
    out.push(controller);

    controller.addEventListener('connected', (event: { data: XRInputSource }) => {
      const inputSource = event.data;
      if (inputSource.gamepad) {
        controller.userData.gamepad = inputSource.gamepad;
      }
    });
    controller.addEventListener('disconnected', () => {
      delete controller.userData.gamepad;
    });

    controller.addEventListener('selectstart', () => {
      // Dispatch in z-order from rack-local outward: active section's
      // sliders first (the warm drag affordance), then the global preset
      // row (only when expanded), then the section tabs and canonical-
      // forms heading. These regions are spatially disjoint but the
      // explicit ordering keeps the first-hit-wins contract well-defined
      // regardless of layout.
      const activeSection = sections[activeSectionIndex];
      // Per-axis toggles (#134) dispatch *before* the section's sliders
      // so the toggle stays reachable at thumb-extreme. At default and
      // near-default thumb values the toggle's grab sphere is disjoint
      // from the slider's, so order doesn't change behavior. At the
      // slider's leftmost extreme the two grab spheres overlap by 0.032 m
      // — a ray aimed at the visible thumb still hits only the slider
      // (the toggle's sphere doesn't extend that far), but a ray aimed
      // at the visible toggle hits both. Toggle-first dispatch picks
      // the toggle in that overlap, preserving both intents; slider-
      // first would silently steal toggle taps when the slider is
      // parked at its extreme. Only fires when Cross sections is
      // focused — toggles belong to that section.
      if (activeSection.name === CROSS_SECTION_SECTION_NAME) {
        for (const t of crossSectionToggles) {
          if (t.tryToggle(controller)) return;
        }
      }
      for (const s of activeSection.sliders) {
        if (s.tryGrab(controller)) {
          // Cancel any in-flight preset tween — the user is taking the
          // wheel, and a still-ticking tween would fight the drag (#56,
          // "interrupt" interaction policy).
          presetTween?.cancel();
          presetTween = undefined;
          return;
        }
      }
      if (presetsExpanded) for (const p of presets) {
        if (p.tryActivate(controller)) {
          // Preset values are coefficient-frame [a, b, c, d] regardless
          // of the active section (#93): the preset row is global, so
          // pressing a preset always drives the coefficient rack toward
          // the named canonical pose. Animate from the rack's current
          // values to the preset (#56) instead of snapping — makes the
          // family transition itself visible. The previous tween, if
          // any, is replaced; its ticked-state on the sliders is the
          // new tween's start.
          //
          // Presets also drive the linear-terms rack (#92): for centered
          // canonical poses (Sphere / Reset / Cone / cylinders / hyperb-
          // oloids …) the target is (0, 0, 0) because the surface is
          // only canonical if it's centered. Paraboloid / Saddle break
          // that pattern: their canonical form *requires* a linear
          // coefficient (z = x² + y² needs w = -1), so the preset
          // declares a non-zero linearValues target which the tween
          // honors verbatim. Either way, both racks tween together —
          // a single cancel() on mid-drag interrupt drops both at once.
          const currentValues: PresetValues = [
            sliders[0].value,
            sliders[1].value,
            sliders[2].value,
            sliders[3].value,
          ];
          const linearStart = linearSliders.map((s) => s.value);
          const linearTarget: readonly number[] = p.linearValues;
          presetTween?.cancel();
          presetTween = new PresetTween({
            start: currentValues,
            target: p.values,
            sliders,
            nowMs: performance.now(),
            durationMs: PRESET_TWEEN_DURATION_MS,
            easing: easeInOutCubic,
            secondary: {
              start: linearStart,
              target: linearTarget,
              sliders: linearSliders,
            },
          });
          return;
        }
      }
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].tryActivate(controller)) {
          switchToSection(i);
          return;
        }
      }
      if (canonicalFormsHeading?.tryActivate(controller)) {
        togglePresetsExpanded();
        return;
      }
    });
    controller.addEventListener('selectend', () => {
      // Release sliders across all sections — releasing a slider that
      // isn't grabbed is a no-op, and an active grab can only ever live
      // in the section that was active at grab time, so a switch
      // mid-drag (which the dispatch above prevents anyway) wouldn't
      // strand a held slider.
      for (const section of sections) {
        for (const s of section.sliders) s.releaseFromController(controller);
      }
    });
  }
  return out;
}

function switchToSection(index: number): void {
  if (index === activeSectionIndex) return;
  sections[activeSectionIndex].setActive(false);
  tabs[activeSectionIndex].setActive(false);
  activeSectionIndex = index;
  sections[activeSectionIndex].setActive(true);
  tabs[activeSectionIndex].setActive(true);
}

function togglePresetsExpanded(): void {
  presetsExpanded = !presetsExpanded;
  for (const p of presets) p.group.visible = presetsExpanded;
  canonicalFormsHeading?.setActive(presetsExpanded);
  canonicalFormsHeading?.setName(
    presetsExpanded
      ? CANONICAL_FORMS_LABEL_EXPANDED
      : CANONICAL_FORMS_LABEL_COLLAPSED,
  );
}

registerExhibit(quadricsExhibit);

export default quadricsExhibit;
