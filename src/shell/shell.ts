import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import type { Exhibit, ExhibitContext } from './Exhibit';
import { listExhibits } from './registry';

// Vite HMR can re-execute module-level code in dev. `bootShell` is
// idempotent against double-invocation: subsequent calls early-return
// rather than registering a second set of controllers / listeners /
// exhibit groups, which would leak GPU resources and double-fire events.
let booted = false;

export function bootShell(): void {
  if (booted) return;
  booted = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.6, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  // Quest fixed foveated rendering: lowers peripheral pixel rate to free GPU
  // budget for the center of view. Stored now and applied by Three.js when
  // the XR projection layer is created at session start. Range 0..1; higher
  // = more aggressive periphery downsampling. Starting mild — wide detailed
  // fraction, gentle falloff — so the periphery doesn't read as visibly
  // blurry; ramp up if profiling says we still need more headroom (#38).
  renderer.xr.setFoveation(0.3);
  // Quest framebuffer scale: cuts per-eye render target resolution to free
  // fragment-shader budget — the dominant cost in this exhibit, where the
  // raymarcher runs a STEPS-loop over the bounding cube for every fragment
  // (#102). 0.85 saves ~28 % of fragment work and is perceptually invisible
  // in motion at the Quest 3S panel's pixel density. SPEC.md `## Frame-pacing
  // knobs` named this as the next deferred knob; this is its first land.
  renderer.xr.setFramebufferScaleFactor(0.85);
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Shell-owned XR controllers (#150 step 4). Listeners are registered
  // once at boot; controller events dispatch to the currently-mounted
  // exhibit via `currentExhibit.onSelectStart` / `onSelectEnd`. Step 5
  // will add rack-first-refusal arbitration before the dispatch line —
  // the SceneRack instance is constructed in step 5, so step 4's
  // selectstart body is a direct dispatch with no rack reference.
  let currentExhibit: Exhibit | null = null;
  // Iterate over the literal tuple so each `c` keeps its
  // `renderer.xr.getController` return type — the XR event overload
  // (`'connected'` / `'disconnected'` / `'selectstart'` / `'selectend'`)
  // lives on that type, not on the wider `Object3D`. The widening to
  // `readonly Object3D[]` for the ctx happens after listeners are set up.
  const controller0 = renderer.xr.getController(0);
  const controller1 = renderer.xr.getController(1);
  scene.add(controller0);
  scene.add(controller1);
  // Visible 1 m laser line along controller −Z. One geometry + material
  // shared across both controllers (matches the pre-#150 quadrics setup,
  // which also shared the rayGeom + rayMat instances rather than
  // allocating per controller).
  const aimRayGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const aimRayMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
  });
  for (const c of [controller0, controller1] as const) {
    c.add(new THREE.Line(aimRayGeom, aimRayMat));
    c.addEventListener('connected', (event: { data: XRInputSource }) => {
      const inputSource = event.data;
      if (inputSource.gamepad) c.userData.gamepad = inputSource.gamepad;
    });
    c.addEventListener('disconnected', () => {
      delete c.userData.gamepad;
    });
    c.addEventListener('selectstart', () => {
      currentExhibit?.onSelectStart(c);
    });
    c.addEventListener('selectend', () => {
      currentExhibit?.onSelectEnd(c);
    });
  }
  const controllers: readonly THREE.Object3D[] = [controller0, controller1];

  // URL-param exhibit selector (#120). Default = first registered.
  // Unknown id → console-warn and fall back so the page still renders
  // something rather than failing silently. Selection happens at boot
  // only; there's no in-session swap path today — step 5 (#150) adds the
  // SceneRack-driven swap and a cluster-only URL resolver. For step 4 the
  // existing single-exhibit boot routing is retained verbatim, so
  // `?exhibit=hello` still mounts hello (cluster filter lands in step 5).
  const all = listExhibits();
  if (all.length === 0) {
    console.warn('geometer: no exhibits registered; nothing to mount.');
    return;
  }
  const requestedId = new URLSearchParams(window.location.search).get('exhibit');
  let exhibit = all[0];
  if (requestedId !== null) {
    const match = all.find((e) => e.id === requestedId);
    if (match) {
      exhibit = match;
    } else {
      console.warn(
        `geometer: unknown exhibit id "${requestedId}"; ` +
          `falling back to "${exhibit.id}". ` +
          `Registered ids: ${all.map((e) => e.id).join(', ')}.`,
      );
    }
  }

  // Per-exhibit root group (#150). The shell owns scene-graph parenting;
  // exhibits add their content to `ctx.group`, not to the scene root.
  // Step 5 will replace this with an in-session swap path that drops the
  // current exhibit's group + mounts the next one.
  const group = new THREE.Group();
  group.name = `exhibit:${exhibit.id}`;
  scene.add(group);

  const ctx: ExhibitContext = { group, renderer, camera, controllers };
  exhibit.mount(ctx);
  currentExhibit = exhibit;

  const timer = new THREE.Timer();
  // Page Visibility integration: prevents huge delta spikes after the tab
  // (or Quest headset) is backgrounded and re-focused mid-session.
  timer.connect(document);
  renderer.setAnimationLoop(() => {
    timer.update();
    const delta = timer.getDelta();
    // Dispatch through `currentExhibit` (matching `selectstart` / `selectend`
    // dispatch above) so step 5's swap path only needs to reassign
    // `currentExhibit` — the animation loop picks up the new exhibit
    // automatically. Equivalent to `exhibit.update` in step 4 (single
    // exhibit, no swap), but stays correct when step 5 lands.
    currentExhibit?.update({ delta });
    renderer.render(scene, camera);
  });
}
