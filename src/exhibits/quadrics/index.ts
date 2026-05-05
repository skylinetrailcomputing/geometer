import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { registerExhibit } from '../../shell/registry';
import { classify } from './classify';
import { Label } from './Label';
import { Preset, type PresetValues } from './Preset';
import { Slider } from './Slider';
import { WorldAxes } from './WorldAxes';

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

// Single classification readout, anchored above the rack so the family
// name sits in the user's gaze area while interacting (#33). A second
// surface-anchored "hero" label was tried alongside this one and removed
// post-headset feedback as redundant — once the rack readout is present,
// the user's attention stays at the rack during drags. y = 1.4 is ~0.175 m
// above the top slider 'a' (at SLIDER_RACK_CENTER.y + 1.5 * SLIDER_ROW_PITCH
// = 1.225); enough clearance for the per-slider label glyphs below.
const RACK_LABEL_POSITION = new THREE.Vector3(0, 1.4, -0.7);

// Smaller than Label's 0.16 default; matches the closer ~0.7 m viewing
// distance from the user's spawn point.
const RACK_LABEL_PRIMARY_FONT_SIZE = 0.06;

// Math-frame axis indicator (#43): pinned next to the slider rack so it
// stays visible regardless of the surface's current parameters. x = 0.3
// clears the right end of the 0.3 m slider track (which spans ±0.15 from
// rack center). y = 0.925 puts the indicator's vertical span (Z extends
// up by AXIS_LENGTH = 0.15) symmetric around the rack's vertical center
// at y = 1.0. z matches the slider plane.
const AXIS_INDICATOR_POSITION = new THREE.Vector3(0.3, 0.925, -0.7);

// Canonical-pose preset rack (#46): vertical column of buttons to the LEFT
// of the slider rack. x = -0.45 clears the per-slider name labels, which
// sit at x = -0.2 with their text extending leftward. Vertical span is
// centered on SLIDER_RACK_CENTER.y so the rack reads as a single unit.
// Order matches the issue body: Sphere, Eccentric ellipsoid, Cone, H 1-sheet,
// H 2-sheets, Cylinder, Reset (back to startup pose).
//
// The values are slider-frame (a, b, c, d) per the math convention from #43:
// X right, Y forward, Z up. So Cylinder (1, 1, 0, 1) is `X² + Y² = 1`, which
// reads as a vertical (math-Z-aligned) cylinder; Cone (1, 1, -1, 0) opens
// along math-Z (vertical). Surfaces of revolution are upright by default.
const PRESETS: readonly { readonly name: string; readonly values: PresetValues }[] = [
  { name: 'Sphere', values: [1, 1, 1, 1] },
  { name: 'Ellipsoid', values: [2, 0.5, 1, 1] },
  { name: 'Cone', values: [1, 1, -1, 0] },
  { name: 'H 1-sheet', values: [1, 1, -1, 1] },
  { name: 'H 2-sheets', values: [1, 1, -1, -1] },
  { name: 'Cylinder', values: [1, 1, 0, 1] },
  { name: 'Reset', values: [1, 1, 1, 1] },
];

const PRESET_RACK_X = -0.45;
const PRESET_BUTTON_PITCH = 0.1;

const BOUND = 2.5;
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();

// Vertical stacking pitch for the rack. SPEC pins the rack center but
// not per-slider positions. Lower bound is set by the slider's grab
// region: at thumbRadius (0.025) × GRAB_RADIUS_MULTIPLIER (2.75), each
// thumb's hit sphere is ~0.069 m, so adjacent thumbs need ≥ 0.138 m of
// pitch to keep their grab regions disjoint (otherwise a ray near the
// midpoint could resolve to either slider). 0.15 leaves ~1 cm of
// clearance between hit spheres and reads as comfortably spaced in
// headset.
const SLIDER_ROW_PITCH = 0.15;
type CoeffName = 'a' | 'b' | 'c' | 'd';
const COEFF_NAMES: readonly CoeffName[] = ['a', 'b', 'c', 'd'] as const;

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
  uniform float uBound;
  uniform vec3  uLightDir;
  uniform vec3  uBaseColor;

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
    return uA * p.x * p.x + uB * p.y * p.y + uC * p.z * p.z - uD;
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

    const int STEPS = 96;
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
let sliders: Slider[] = [];
let presets: Preset[] = [];
let controllers: THREE.Object3D[] = [];
let rackLabel: Label | undefined;
let worldAxes: WorldAxes | undefined;
let camera: THREE.Camera | undefined;
let elapsed = 0;

const quadricsExhibit: Exhibit = {
  id: 'quadrics',
  title: 'Quadric surfaces',

  mount({ scene, renderer, camera: cam }: ExhibitContext) {
    camera = cam;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x222244 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

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
    const topY = SLIDER_RACK_CENTER.y + ((COEFF_NAMES.length - 1) / 2) * SLIDER_ROW_PITCH;
    sliders = COEFF_NAMES.map((label, i) => {
      const slider = new Slider({ label, min: -2, max: 2, initial: 1 });
      slider.group.position.set(
        SLIDER_RACK_CENTER.x,
        topY - i * SLIDER_ROW_PITCH,
        SLIDER_RACK_CENTER.z,
      );
      slider.mountLabel();
      scene.add(slider.group);
      return slider;
    });

    // Centered on SLIDER_RACK_CENTER.y so the rack reads as one unit.
    const presetTopY =
      SLIDER_RACK_CENTER.y + ((PRESETS.length - 1) / 2) * PRESET_BUTTON_PITCH;
    presets = PRESETS.map((p, i) => {
      const preset = new Preset(p);
      preset.group.position.set(
        PRESET_RACK_X,
        presetTopY - i * PRESET_BUTTON_PITCH,
        SLIDER_RACK_CENTER.z,
      );
      scene.add(preset.group);
      return preset;
    });

    controllers = setupControllers(scene, renderer, sliders, presets);

    // Rack readout — family name only. Per-slider labels already render
    // coefficient values inline, so duplicating them here would be noise.
    rackLabel = new Label({ primaryFontSize: RACK_LABEL_PRIMARY_FONT_SIZE });
    rackLabel.group.position.copy(RACK_LABEL_POSITION);
    scene.add(rackLabel.group);

    worldAxes = new WorldAxes();
    worldAxes.group.position.copy(AXIS_INDICATOR_POSITION);
    scene.add(worldAxes.group);
  },

  update({ delta }) {
    for (const s of sliders) s.updateHover(controllers);
    for (const s of sliders) s.update();
    if (camera) for (const s of sliders) s.tickLabel(camera);
    for (const p of presets) p.updateHover(controllers);
    for (const p of presets) p.update();
    if (camera) for (const p of presets) p.faceCamera(camera);
    // Slider → uniform routing in the math-textbook frame paired with the
    // axis indicator (#43): X right, Y forward, Z up. The shader still
    // evaluates the implicit equation in the Three.js world frame, so:
    //   slider a → math-X² → world-X² → uA
    //   slider b → math-Y² → world-Z² → uC
    //   slider c → math-Z² → world-Y² → uB
    //   slider d → uD (constant term)
    if (material) {
      const [a, b, c, d] = sliders.map((s) => s.value);
      material.uniforms.uA.value = a;
      material.uniforms.uC.value = b;
      material.uniforms.uB.value = c;
      material.uniforms.uD.value = d;
    }
    if (DEBUG_SWEEP && material) {
      elapsed += delta;
      const a = Math.cos((2 * Math.PI * elapsed) / SWEEP_PERIOD);
      material.uniforms.uA.value = a;
    }
    if (rackLabel) {
      const [a, b, c, d] = sliders.map((s) => s.value);
      const { family } = classify(a, b, c, d);
      rackLabel.setPrimary(family);
      if (camera) rackLabel.faceCamera(camera);
    }
    if (worldAxes && camera) worldAxes.faceCamera(camera);
  },
};

function setupControllers(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  sliders: readonly Slider[],
  presets: readonly Preset[],
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
      for (const s of sliders) {
        if (s.tryGrab(controller)) return;
      }
      for (const p of presets) {
        if (p.tryActivate(controller)) {
          // Snap the rack to the preset. Ordering matches COEFF_NAMES
          // ('a','b','c','d') so values[i] lands on sliders[i] cleanly.
          for (let i = 0; i < sliders.length; i++) {
            sliders[i].setValue(p.values[i]);
          }
          return;
        }
      }
    });
    controller.addEventListener('selectend', () => {
      for (const s of sliders) s.releaseFromController(controller);
    });
  }
  return out;
}

registerExhibit(quadricsExhibit);

export default quadricsExhibit;
