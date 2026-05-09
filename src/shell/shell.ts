import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CLUSTER_CALCULUS3 } from './clusters';
import type { Exhibit, ExhibitContext } from './Exhibit';
import { listExhibits } from './registry';
import { SceneRack } from './SceneRack';
import { createSwitchScheduler } from './switch-scheduler';
import {
  planUrlSync,
  resolveExhibitId,
  type HistoryMode,
} from './url-routing';

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

  // Cluster filter (#150 step 5). The SceneRack and the URL-param
  // resolver both operate over cluster members only; non-cluster
  // exhibits (today: `hello`) stay registered so they're reachable
  // via direct dev import, but are excluded from the rack and from
  // `?exhibit=` resolution. An unknown / non-cluster / empty id at
  // boot console-warns and falls back to `clusterExhibits[0]` — see
  // `resolveExhibitId` semantics in `url-routing.ts`.
  const clusterExhibits = listExhibits().filter(
    (e) => e.cluster === CLUSTER_CALCULUS3,
  );
  if (clusterExhibits.length === 0) {
    console.warn('geometer: no cluster exhibits registered; nothing to mount.');
    return;
  }
  const defaultId = clusterExhibits[0].id;

  // Shell-owned XR controllers (#150 step 4). Listeners are
  // registered once at boot; controller events route through
  // rack-first-refusal (step 5) and then dispatch to the
  // currently-mounted exhibit. The `selectstart` listener checks
  // `rack.tryActivate(c)` first — if the rack consumed the event
  // (a tab was tapped), the exhibit's `onSelectStart` is skipped
  // for that frame, preventing a slider grab from also firing the
  // navigation switch.
  let currentExhibit: Exhibit | null = null;
  let currentCtx: ExhibitContext | null = null;
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
      // Rack first refusal (#150 step 5): the rack consumes a tap
      // when it lands on a SceneTab; otherwise the event flows to
      // the current exhibit. SceneRack.tryActivate fires the
      // tapped tab's immediate active-state update before
      // returning, so the highlight switches in the same render
      // frame even though the actual mount swap is deferred to
      // the next animation frame by the scheduler.
      if (rack.tryActivate(c)) return;
      currentExhibit?.onSelectStart(c);
    });
    c.addEventListener('selectend', () => {
      currentExhibit?.onSelectEnd(c);
    });
  }
  const controllers: readonly THREE.Object3D[] = [controller0, controller1];

  // SceneRack (#150 step 5): one tab per cluster member, tap →
  // `requestSwitch(id, 'push')` so a SceneTab tap pushes a new
  // history entry the user can back-button out of. The rack's
  // `onSelect` runs at tap time; the actual mount swap happens
  // on the next animation-loop tick via the scheduler.
  const rack = new SceneRack({
    exhibits: clusterExhibits,
    grabRadiusMultiplier: 2.75,
    onSelect: (id) => scheduler.requestSwitch(id, 'push'),
  });
  scene.add(rack.group);

  function applyUrlSync(id: string, mode: HistoryMode): void {
    const plan = planUrlSync(id, mode, defaultId, window.location.href);
    if (plan.write === 'push') history.pushState(null, '', plan.href);
    else if (plan.write === 'replace') history.replaceState(null, '', plan.href);
  }

  function switchExhibitNow(
    requestedId: string | null,
    mode: HistoryMode,
  ): void {
    // 1. Resolve to a definite cluster-member id. `requestedId`
    //    rides through as `null` for the bare-URL boot path
    //    (silent fallback) and as `''` for an empty `?exhibit=`
    //    (warn + fall back) — see `resolveExhibitId` semantics.
    const { id: targetId, fellBack } = resolveExhibitId(
      requestedId,
      clusterExhibits,
    );
    if (fellBack) {
      console.warn(
        `geometer: unknown exhibit id "${requestedId}"; ` +
          `falling back to "${targetId}". ` +
          `Cluster ids: ${clusterExhibits.map((e) => e.id).join(', ')}.`,
      );
    }

    // 2. Sync rack + URL on the resolved target id, UNCONDITIONALLY.
    //    Even when the mount swap is skipped (already on this
    //    exhibit), this normalizes a stale `?exhibit=bogus` URL or
    //    out-of-date rack highlight (Sonnet #2 + GPT #6).
    rack.setActiveExhibit(targetId);
    applyUrlSync(targetId, mode);

    // 3. Skip the mount swap if already there.
    if (currentExhibit?.id === targetId) return;

    const target = clusterExhibits.find((e) => e.id === targetId)!;
    if (currentExhibit && currentCtx) {
      currentExhibit.unmount(currentCtx);
      scene.remove(currentCtx.group);
    }
    const group = new THREE.Group();
    group.name = `exhibit:${targetId}`;
    scene.add(group);
    const ctx: ExhibitContext = { group, renderer, camera, controllers };
    target.mount(ctx);
    currentExhibit = target;
    currentCtx = ctx;
  }

  const scheduler = createSwitchScheduler({ commit: switchExhibitNow });

  // `popstate` fires when the user uses the browser back/forward
  // button. Read the param off the URL the browser has already
  // committed to; pass `'none'` so we don't push another entry
  // (which would loop). The raw value (which may be null for a
  // bare URL or '' for `?exhibit=` with no value) rides through
  // to the resolver, which distinguishes the two: bare URL is
  // silent, empty value warns.
  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(window.location.search).get('exhibit');
    scheduler.requestSwitch(id, 'none');
  });

  // Best-effort shader pre-warm (#150 plan §4.4). Walks the
  // non-default cluster exhibits at boot and runs a mount → compile
  // → unmount cycle so the first in-session switch into a
  // not-yet-mounted exhibit has a chance of skipping the cold
  // ShaderMaterial compile. **Two known limitations make this an
  // experiment, not a guarantee:** (1) `unmount` disposes owned
  // materials, which may release the renderer-side compiled
  // program; (2) `renderer.compile(scene, camera)` runs against
  // the desktop `PerspectiveCamera`, but in-XR rendering uses an
  // `ArrayCamera` whose program-cache key may differ. The cost is
  // small (handful of allocations at boot); efficacy is measured
  // in headset smoke (§7) and we file a follow-up if first-switch
  // visibly stalls.
  const requestedParam = new URLSearchParams(window.location.search).get(
    'exhibit',
  );
  const { id: initialId } = resolveExhibitId(requestedParam, clusterExhibits);
  for (const e of clusterExhibits) {
    if (e.id === initialId) continue;
    const warmGroup = new THREE.Group();
    warmGroup.name = `warm:${e.id}`;
    scene.add(warmGroup);
    const warmCtx: ExhibitContext = {
      group: warmGroup,
      renderer,
      camera,
      controllers,
    };
    e.mount(warmCtx);
    renderer.compile(scene, camera);
    e.unmount(warmCtx);
    scene.remove(warmGroup);
  }

  // Initial-boot mount: route through the same scheduler so the
  // `'replace'` history mode normalizes a bogus / non-cluster /
  // empty `?exhibit=` without leaving a forward history entry the
  // user has to back through. The raw `requestedParam` (which may
  // be null for a bare URL) rides through unchanged so the
  // resolver can keep the bare-URL boot silent.
  scheduler.requestSwitch(requestedParam, 'replace');

  const timer = new THREE.Timer();
  // Page Visibility integration: prevents huge delta spikes after the tab
  // (or Quest headset) is backgrounded and re-focused mid-session.
  timer.connect(document);
  renderer.setAnimationLoop(() => {
    // Drain a pending switch at frame start, before update / render,
    // so a controller event never unmounts the exhibit currently
    // dispatching. Coalescing means two `requestSwitch` calls in
    // the same tick mount only the latest target.
    scheduler.drain();
    timer.update();
    const delta = timer.getDelta();
    currentExhibit?.update({ delta });
    rack.faceCamera(camera);
    rack.updateHover(controllers);
    rack.update();
    renderer.render(scene, camera);
  });
}
