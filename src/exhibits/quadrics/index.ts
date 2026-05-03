import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { registerExhibit } from '../../shell/registry';
import { classify } from './classify';
import { Label } from './Label';
import { Slider } from './Slider';

const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -3);
// Above-and-forward of the surface. The surface render volume reaches
// y = SURFACE_CENTER.y + BOUND = 4.0 at small-coefficient states, so a
// label at z = SURFACE_CENTER.z would be buried for any large-surface
// state. Forward placement (z = -2.0) gives 1.0 m of depth separation
// from the surface center, so when their screen-space rectangles
// overlap stereo parallax + the depth buffer keep the label clearly in
// front. y = 3.5 is 1.0 m above the default ellipsoid's top (y = 2.5).
const FAMILY_LABEL_POSITION = new THREE.Vector3(0, 3.5, -2.0);
const SLIDER_RACK_CENTER = new THREE.Vector3(0, 1.0, -0.7);

// Compact second classification readout, anchored above the rack so the
// family name sits in the user's gaze area while interacting (#33). The
// surface-anchored family label is for stepping back and reading the result
// on the surface; this rack readout is for in-flight feedback during a drag.
// y = 1.4 is ~0.175 m above the top slider 'a' (which lives at
// SLIDER_RACK_CENTER.y + 1.5 * SLIDER_ROW_PITCH = 1.225) — clearance for
// the per-slider label glyphs below and the rack-readout glyphs above.
const RACK_LABEL_POSITION = new THREE.Vector3(0, 1.4, -0.7);

// Roughly half the family-label default (0.16), matching the closer
// viewing distance (~0.7 m vs. ~3 m for the surface label).
const RACK_LABEL_PRIMARY_FONT_SIZE = 0.06;

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
    vec3 color = uBaseColor * (0.2 + 0.8 * lambert);
    gl_FragColor = vec4(color, 1.0);

    // Write the implicit-surface depth, not the bounding cube's. Quest's
    // asynchronous spacewarp reprojects per-pixel from the depth buffer; with
    // the cube's depth (meters off from the visible surface), reprojection
    // smears the surface into a translucent / negative-space ghost.
    vec3 hitWorld = pHit + uSurfaceCenter;
    vec4 clip = projectionMatrix * viewMatrix * vec4(hitWorld, 1.0);
    gl_FragDepth = (clip.z / clip.w) * 0.5 + 0.5;
  }
`;

let material: THREE.ShaderMaterial | undefined;
let sliders: Slider[] = [];
let controllers: THREE.Object3D[] = [];
let familyLabel: Label | undefined;
let rackLabel: Label | undefined;
let camera: THREE.Camera | undefined;
let elapsed = 0;

// Format a coefficient value for the secondary label line: explicit sign,
// two decimal places. Per SPEC.md "Label content" — the explicit sign keeps
// the visual jump from +0.05 to −0.05 unambiguous through the zero detent.
function formatCoeff(name: string, v: number): string {
  const sign = v < 0 ? '−' : '+';
  return `${name} = ${sign}${Math.abs(v).toFixed(2)}`;
}

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

    controllers = setupControllers(scene, renderer, sliders);

    familyLabel = new Label();
    familyLabel.group.position.copy(FAMILY_LABEL_POSITION);
    scene.add(familyLabel.group);

    // Rack readout — family name only. Per-slider labels already render
    // coefficient values inline, so duplicating them here would be noise.
    rackLabel = new Label({ primaryFontSize: RACK_LABEL_PRIMARY_FONT_SIZE });
    rackLabel.group.position.copy(RACK_LABEL_POSITION);
    scene.add(rackLabel.group);
  },

  update({ delta }) {
    for (const s of sliders) s.updateHover(controllers);
    for (const s of sliders) s.update();
    if (camera) for (const s of sliders) s.tickLabel(camera);
    if (material) {
      for (const s of sliders) {
        material.uniforms[`u${s.label.toUpperCase()}`].value = s.value;
      }
    }
    if (DEBUG_SWEEP && material) {
      elapsed += delta;
      const a = Math.cos((2 * Math.PI * elapsed) / SWEEP_PERIOD);
      material.uniforms.uA.value = a;
    }
    const [a, b, c, d] = sliders.map((s) => s.value);
    const { family } = classify(a, b, c, d);
    if (familyLabel) {
      familyLabel.setPrimary(family);
      familyLabel.setSecondary(
        sliders.map((s) => formatCoeff(s.label, s.value)).join(', '),
      );
      if (camera) familyLabel.faceCamera(camera);
    }
    if (rackLabel) {
      rackLabel.setPrimary(family);
      if (camera) rackLabel.faceCamera(camera);
    }
  },
};

function setupControllers(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  sliders: readonly Slider[],
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
        if (s.tryGrab(controller)) break;
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
