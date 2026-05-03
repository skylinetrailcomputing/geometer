import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { registerExhibit } from '../../shell/registry';

const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -3);
const BOUND = 2.5;
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();

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

const quadricsExhibit: Exhibit = {
  id: 'quadrics',
  title: 'Quadric surfaces',

  mount({ scene }: ExhibitContext) {
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

    const material = new THREE.ShaderMaterial({
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
  },

  update() {
    // Static surface in v0.1; #4 introduces uniform animation.
  },
};

registerExhibit(quadricsExhibit);

export default quadricsExhibit;
