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
import { classify } from './classify';
import { EquationReadout } from './EquationReadout';
import { FpsOverlay } from '@/scaffold/perf/FpsOverlay';
import { Label } from '@/scaffold/ui/Label';
import { Preset, type LinearPresetValues, type PresetValues } from './Preset';
import { PresetTween } from './PresetTween';
import { RendererInfoProbe } from '@/scaffold/perf/RendererInfoProbe';
import { Section } from './Section';
import { SectionTab } from './SectionTab';
import { Slider, type ThumbShape } from './Slider';
import { WorldAxes, type AxisName } from './WorldAxes';

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

// Cross-sections section (#84). One slider `z₀` driving a math-Z slicing
// plane through the implicit surface. The shader brightens a glow band
// where the surface meets the plane, so dragging the slider sweeps a
// glowing intersection curve up/down the surface — the conic-sections-from
// -a-cone story made manipulable. Axis-aligned (math-Z only) for v1; x/y
// planes can follow as more sliders if the lens reads as useful in headset.
//
// Range ±2.5 keeps the plane within the surface envelope: the raymarcher
// AABB half-extent is BOUND = 3.5 in surface-local coords, but the visible
// surface is concentrated in the inner ~±2 region for non-degenerate
// poses, so ±2.5 covers "sweep all the way through and a bit past" without
// wasting slider travel on regions where the curve doesn't show.
const CROSS_SECTION_SLIDER_RANGE = 2.5;
const CROSS_SECTION_SLIDER_LABEL = 'z₀';
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

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  // Three.js auto-populates projectionMatrix on every program, but only
  // declares it in vertex-shader prefixes — fragment shaders have to
  // declare it explicitly to use it. (viewMatrix and cameraPosition are
  // declared automatically.)
  uniform mat4 projectionMatrix;

  uniform vec3  uSurfaceCenter;
  uniform float uA;
  uniform float uB;
  uniform float uC;
  uniform float uD;
  uniform float uU;
  uniform float uV;
  uniform float uW;
  uniform float uBound;
  // Cross-sections section (#84): math-Z slicing plane in surface-local
  // coords. uPlaneActive is 0 when any other section is focused — the
  // glow band only renders when the user is actively viewing the slicing
  // lens. The slider→uniform routing in update() pre-converts the math-Z
  // value to its world-axis equivalent (world-Y in the surface-local
  // frame, per the math/world swap documented at the slider→uniform
  // block), so this uniform is compared directly against pHit.y in the
  // fragment shader.
  uniform float uPlaneY;
  uniform float uPlaneActive;
  uniform vec3  uLightDir;
  uniform vec3  uBaseColor;

  // Sky-blue glow color for the slicing-plane intersection ring, matching
  // the slider 'c' / math-Z palette (the slicing axis). Reads as
  // continuous with the existing axis-color story.
  const vec3  PLANE_GLOW_COLOR = vec3(0.34, 0.71, 0.91);
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

  varying vec3 vWorldPos;

  float fImplicit(vec3 p) {
    return uA * p.x * p.x + uB * p.y * p.y + uC * p.z * p.z
         + uU * p.x + uV * p.y + uW * p.z
         - uD;
  }

  vec3 gradF(vec3 p) {
    float h = 0.001;
    vec3 dx = vec3(h, 0.0, 0.0);
    vec3 dy = vec3(0.0, h, 0.0);
    vec3 dz = vec3(0.0, 0.0, h);
    return vec3(
      fImplicit(p + dx) - fImplicit(p - dx),
      fImplicit(p + dy) - fImplicit(p - dy),
      fImplicit(p + dz) - fImplicit(p - dz)
    ) / (2.0 * h);
  }

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

  bool rayAABB(vec3 ro, vec3 rd, float r, out float tNear, out float tFar) {
    vec3 invD = 1.0 / rd;
    vec3 t0 = (vec3(-r) - ro) * invD;
    vec3 t1 = (vec3( r) - ro) * invD;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);
    tNear = max(max(tMin.x, tMin.y), tMin.z);
    tFar  = min(min(tMax.x, tMax.y), tMax.z);
    return tFar >= max(tNear, 0.0);
  }

  void main() {
    vec3 ro = cameraPosition - uSurfaceCenter;
    vec3 rd = normalize(vWorldPos - cameraPosition);

    float tNear, tFar;
    if (!rayAABB(ro, rd, uBound, tNear, tFar)) {
      discard;
    }
    float tStart = max(tNear, 0.0);

    // STEPS = the per-fragment uniform-march sample count across the AABB
    // span, before the 8-iter bisection refines a sign change to a hit.
    // Was 96 originally; lowered to 64 in #102 (knob B) — the per-fragment
    // STEPS loop runs for every rasterized fragment in the bounding cube
    // even when no surface is hit, so STEPS is a near-linear knob on
    // steady-state fragment cost. Tradeoff: the AABB span at BOUND = 3.5
    // is up to ~12 m diagonal; at 64 steps that's ~19 cm of march
    // per-step worst case, which the bisection follow-up still resolves
    // to sub-mm precision once a sign change is detected. Visible cost is
    // missed-feature aliasing on geometry thinner than dt — relevant only
    // at extreme (u, v, w) poses where the surface degenerates to a
    // narrow sliver crossing the AABB; non-degenerate quadrics are
    // contiguous and easily caught by 64 samples. If 48 is needed (knob B
    // step 2), revisit.
    const int STEPS = 64;
    float dt = (tFar - tStart) / float(STEPS);
    float t = tStart;
    float fPrev = fImplicit(ro + rd * t);
    bool hit = false;
    float tHit = 0.0;

    for (int i = 1; i <= STEPS; i++) {
      float tNext = tStart + float(i) * dt;
      float fNext = fImplicit(ro + rd * tNext);
      if (fPrev * fNext < 0.0) {
        float lo = t;
        float hi = tNext;
        float fLo = fPrev;
        for (int b = 0; b < 8; b++) {
          float mid = 0.5 * (lo + hi);
          float fMid = fImplicit(ro + rd * mid);
          if (fLo * fMid < 0.0) {
            hi = mid;
          } else {
            lo = mid;
            fLo = fMid;
          }
        }
        tHit = 0.5 * (lo + hi);
        hit = true;
        break;
      }
      t = tNext;
      fPrev = fNext;
    }

    if (!hit) {
      discard;
    }

    vec3 pHit = ro + rd * tHit;
    vec3 n = normalize(gradF(pHit));
    if (dot(n, rd) > 0.0) {
      n = -n;
    }

    float lambert = max(dot(n, normalize(uLightDir)), 0.0);
    vec3 baseColor = uBaseColor * (0.2 + 0.8 * lambert);

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
    vec3 hitWorld = pHit + uSurfaceCenter;
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

    // Cross-sections glow band (#84). Brighten pixels on the surface
    // whose math-Z (= surface-local world-Y) is close to the slicing
    // plane, so the intersection curve reads as a glowing ring as the
    // user sweeps the plane. Smooth falloff over the band width keeps
    // anti-aliasing free and avoids a hard ring edge that would alias
    // worse than the underlying surface. Additive (over the grid mix)
    // so the glow stays legible against either base color or grid line.
    if (uPlaneActive > 0.5) {
      float planeDist = abs(pHit.y - uPlaneY);
      float planeMask =
        1.0 - smoothstep(0.0, PLANE_GLOW_HALF_WIDTH, planeDist);
      color += PLANE_GLOW_COLOR * (PLANE_GLOW_INTENSITY * planeMask);
    }

    gl_FragColor = vec4(color, 1.0);

    // Write the implicit-surface depth, not the bounding cube's. Quest's
    // asynchronous spacewarp reprojects per-pixel from the depth buffer; with
    // the cube's depth (meters off from the visible surface), reprojection
    // smears the surface into a translucent / negative-space ghost.
    vec4 clip = projectionMatrix * viewMatrix * vec4(hitWorld, 1.0);
    gl_FragDepth = (clip.z / clip.w) * 0.5 + 0.5;
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

    material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.DoubleSide,
      uniforms: {
        uSurfaceCenter: { value: SURFACE_CENTER.clone() },
        uA: { value: 1.0 },
        uB: { value: 1.0 },
        uC: { value: 1.0 },
        uD: { value: 1.0 },
        uU: { value: 0.0 },
        uV: { value: 0.0 },
        uW: { value: 0.0 },
        uPlaneY: { value: 0.0 },
        uPlaneActive: { value: 0.0 },
        uBound: { value: BOUND },
        uLightDir: { value: LIGHT_DIR.clone() },
        uBaseColor: { value: new THREE.Color(0.4, 0.7, 0.95) },
      },
    });

    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(BOUND * 2, BOUND * 2, BOUND * 2),
      material,
    );
    surface.position.copy(SURFACE_CENTER);
    scene.add(surface);

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
      const preset = new Preset(p);
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

    // Cross-sections section (#84). One slider `z₀` driving the math-Z
    // slicing plane. Sky-blue + arrow-z to keep the math-Z color/shape
    // story consistent with slider 'c' (squared) and slider 'w' (linear)
    // — same axis, different math role per section. Mounted at the top
    // row of the rack (same y as 'a' and 'u') so the rack's top slot
    // always holds the section's primary control regardless of lens.
    const crossSectionTermSliders = [
      new Slider({
        label: CROSS_SECTION_SLIDER_LABEL,
        min: -CROSS_SECTION_SLIDER_RANGE,
        max: CROSS_SECTION_SLIDER_RANGE,
        initial: 0,
        baseColor: SKY_BLUE,
        thumbShape: 'arrow-z',
      }),
    ];
    crossSectionTermSliders[0].group.position.set(
      SLIDER_RACK_CENTER.x,
      topY,
      SLIDER_RACK_CENTER.z,
    );
    scene.add(crossSectionTermSliders[0].group);
    crossSectionSliders = crossSectionTermSliders;

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
      const tab = new SectionTab({ name: section.name });
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
    const z0 = crossSectionSliders[0]?.value ?? 0;
    if (material) {
      material.uniforms.uA.value = a;
      material.uniforms.uC.value = b;
      material.uniforms.uB.value = c;
      material.uniforms.uD.value = d;
      material.uniforms.uU.value = u;
      material.uniforms.uW.value = -v;
      material.uniforms.uV.value = w;
      // Cross-sections plane (#84). math-Z plane offset → world-Y in the
      // surface-local frame (same swap as squared/linear math-Z routing
      // above: slider 'c' → uB, slider 'w' → uV). Glow band gates on the
      // section being active so the ring stays a slicing-lens-only effect.
      material.uniforms.uPlaneY.value = z0;
      material.uniforms.uPlaneActive.value =
        sections[activeSectionIndex]?.name === CROSS_SECTION_SECTION_NAME
          ? 1
          : 0;
    }
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
          presetTween = new PresetTween(
            currentValues,
            p.values,
            sliders,
            performance.now(),
            {
              start: linearStart,
              target: linearTarget,
              sliders: linearSliders,
            },
          );
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
