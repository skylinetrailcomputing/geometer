import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CLUSTER_CALCULUS3 } from './clusters';
import type { Exhibit, ExhibitContext } from './Exhibit';
import { listExhibits } from './registry';
import { SceneRack } from './SceneRack';
import { createSwitchScheduler } from './switch-scheduler';
import {
  planUrlSync,
  resolveExhibitId,
  resolveMode,
  type HistoryMode,
  type Mode,
} from './url-routing';
import type { Pointer } from './Pointer';
import { VRPointer } from './VRPointer';
import { DesktopPointer } from './DesktopPointer';
import { createCameraControls } from './cameraControls';

// Vite HMR can re-execute module-level code in dev. `bootShell` is
// idempotent against double-invocation: subsequent calls early-return
// rather than registering a second set of controllers / listeners /
// exhibit groups, which would leak GPU resources and double-fire events.
//
// **`booted = true` is set synchronously, before the async mode probe
// awaits.** A second `bootShell()` call during the probe window (e.g.,
// Vite HMR re-execute mid-probe) sees `booted = true` and bails
// immediately, preventing a second renderer / VRButton / event-listener
// stack from being constructed concurrently with the first (#193,
// pancake plan v3 §3.2 / N3).
let booted = false;

export function bootShell(): void {
  if (booted) return;
  booted = true;
  void bootShellAsync();
}

async function bootShellAsync(): Promise<void> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  // Pre-mode camera position; overwritten by `createCameraControls` in
  // desktop mode and unused-in-XR (HMD pose drives an `ArrayCamera`)
  // in VR mode.
  camera.position.set(0, 1.6, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

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

  // Mode resolution (#189 + #193, pancake plan v3 §3.2). Explicit
  // `?mode=` always wins; otherwise the async `isSessionSupported`
  // probe distinguishes a real headset from a desktop browser that
  // happens to expose `navigator.xr`. Default to `desktop` on
  // anything unexpected — that's the conservative fallback (G5):
  // worst case the audience sees a non-VR experience on a
  // VR-capable browser; the alternative (showing `VRButton` on a
  // browser without a headset) is a dead end.
  const mode = await resolveBootMode();

  let pointers: readonly Pointer[];
  // Desktop mode populates this; VR mode leaves it null. The animation
  // loop checks for it to drive damping + matrix update before the
  // hover dispatch reads pointer rays (per plan v3 §3.6 frame order).
  let cameraControls: OrbitControls | null = null;

  if (mode === 'vr') {
    // ── VR mode ─────────────────────────────────────────────────
    // Today's path. Bit-for-bit unchanged: `VRButton` + two XR
    // controllers wrapped in `VRPointer`s, `xr.enabled = true`, no
    // OrbitControls.
    renderer.xr.enabled = true;
    // Quest fixed foveated rendering: lowers peripheral pixel rate to free
    // GPU budget for the center of view. Stored now and applied by Three.js
    // when the XR projection layer is created at session start. Range 0..1;
    // higher = more aggressive periphery downsampling. Starting mild — wide
    // detailed fraction, gentle falloff — so the periphery doesn't read as
    // visibly blurry; ramp up if profiling says we still need more headroom
    // (#38).
    renderer.xr.setFoveation(0.3);
    // Quest framebuffer scale: cuts per-eye render target resolution to free
    // fragment-shader budget — the dominant cost in this exhibit, where the
    // raymarcher runs a STEPS-loop over the bounding cube for every fragment
    // (#102). 0.85 saves ~28 % of fragment work and is perceptually invisible
    // in motion at the Quest 3S panel's pixel density. SPEC.md `## Frame-pacing
    // knobs` named this as the next deferred knob; this is its first land.
    renderer.xr.setFramebufferScaleFactor(0.85);
    document.body.appendChild(VRButton.createButton(renderer));

    // Iterate over the literal tuple so each `c` keeps its
    // `renderer.xr.getController` return type — the XR event overload
    // (`'connected'` / `'disconnected'` / `'selectstart'` / `'selectend'`)
    // lives on that type, not on the wider `Object3D`.
    const controller0 = renderer.xr.getController(0);
    const controller1 = renderer.xr.getController(1);
    scene.add(controller0);
    scene.add(controller1);
    // `VRPointer`s wrapping the two XR controllers (#190 + #191 bundled
    // migration, pancake plan v3 §3.1 / §3.5 / S4). Constructed exactly
    // once at boot so the reference-equality grab/release contract on UI
    // primitives holds across frames; the shell hands the same two
    // instances to every `ExhibitContext` it builds. The selectstart /
    // selectend listeners on each controller group dispatch the matching
    // `VRPointer` via the controller→pointer map below (plan v3 §3.5,
    // D4).
    const vrPointer0 = new VRPointer(controller0, 'vr-0');
    const vrPointer1 = new VRPointer(controller1, 'vr-1');
    pointers = [vrPointer0, vrPointer1];
    const controllerToPointer = new Map<THREE.Group, Pointer>([
      [controller0, vrPointer0],
      [controller1, vrPointer1],
    ]);
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
        const pointer = controllerToPointer.get(c)!;
        if (rack.tryActivate(pointer)) return;
        currentExhibit?.onSelectStart(pointer);
      });
      c.addEventListener('selectend', () => {
        const pointer = controllerToPointer.get(c)!;
        currentExhibit?.onSelectEnd(pointer);
      });
    }
  } else {
    // ── Desktop mode ────────────────────────────────────────────
    // No `VRButton`. `OrbitControls` orbits around the cluster
    // anchor (#192). One `DesktopPointer` driven by the mouse; full
    // pointer-event lifecycle handled at the shell layer per plan
    // v3 §3.6.
    cameraControls = createCameraControls(camera, renderer.domElement);
    const desktopPointer = new DesktopPointer(camera, 'desktop');
    pointers = [desktopPointer];

    // Convert a `MouseEvent`'s clientX/clientY (top-left origin,
    // y-down pixels) into the canvas-local NDC `Raycaster.setFromCamera`
    // expects (center origin, y-up, [−1, 1] range).
    const updateNdcFromEvent = (e: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      desktopPointer.setNDC(x, y);
    };

    // OrbitControls gesture state machine (plan v3 §3.5 / G3 / D1):
    // hit-test SceneRack/exhibit UI first on `pointerdown`. If a UI
    // primitive grabbed the pointer, capture the pointer to the
    // canvas (so off-canvas release still releases the grab), record
    // the pointer id (so we only release on its events), and disable
    // OrbitControls until the grab releases. Without this, dragging
    // a slider would simultaneously rotate the camera.
    //
    // `activeGrabbed` is the primary idempotence guard. The
    // `pointerId` mismatch guard on `releaseFromPointerEvent`
    // prevents an unrelated pointer's event (e.g., a second mouse on
    // a multi-pointer setup) from releasing the active grab. Belt-
    // plus-suspenders: UI primitives' `releaseFromPointer` is
    // reference-equality-guarded already (plan v3 S4).
    let activePointerId: number | null = null;
    let activeGrabbed = false;

    const releaseDesktopPointer = (): void => {
      if (!activeGrabbed) return; // idempotent guard
      activeGrabbed = false;
      if (
        activePointerId !== null &&
        renderer.domElement.hasPointerCapture?.(activePointerId)
      ) {
        // `hasPointerCapture` guard avoids the double-release-throws-in-
        // some-browsers hazard when `pointerup` releases capture and
        // `lostpointercapture` fires immediately after.
        renderer.domElement.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      currentExhibit?.onSelectEnd(desktopPointer);
      if (cameraControls) cameraControls.enabled = true;
    };

    const releaseFromPointerEvent = (e: PointerEvent): void => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      releaseDesktopPointer();
    };

    renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
      // Primary button only. Right-click / middle-click belong to
      // OrbitControls (pan / zoom alternates) — we don't want to
      // hit-test UI on those.
      if (e.button !== 0) return;
      // Update NDC before dispatching select; the down-event may be
      // the very first pointer event the page has seen, in which case
      // there's no prior `pointermove` to have set NDC.
      updateNdcFromEvent(e);
      if (rack.tryActivate(desktopPointer)) {
        // SceneTab taps fire activate-and-immediately-release: there's
        // no drag affordance on a tab. The rack's own update runs the
        // press flash; we don't need to disable OrbitControls.
        return;
      }
      const grabbed = currentExhibit?.onSelectStart(desktopPointer) ?? false;
      if (!grabbed) return;
      // UI captured the gesture: take ownership at the shell + browser
      // layer so the rest of the gesture (drag → release) is ours.
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Some browsers throw if the pointer id is no longer active
        // (e.g., synthesized event during teardown). Treat as best-
        // effort; the activeGrabbed flag still gates release correctly.
      }
      activePointerId = e.pointerId;
      activeGrabbed = true;
      if (cameraControls) cameraControls.enabled = false;
    });

    renderer.domElement.addEventListener('pointermove', (e: PointerEvent) => {
      updateNdcFromEvent(e);
      // Hover dispatch happens in the main loop, post `controls.update()`,
      // so it reads the post-update camera matrices (per plan v3 §3.6 G9).
    });

    renderer.domElement.addEventListener('pointerup', releaseFromPointerEvent);
    renderer.domElement.addEventListener(
      'pointercancel',
      releaseFromPointerEvent,
    );
    renderer.domElement.addEventListener(
      'lostpointercapture',
      releaseFromPointerEvent,
    );
    // `FocusEvent` carries no `pointerId`. Releases whatever is active —
    // alt-tab during a drag should drop the grab cleanly so the slider
    // doesn't stay welded to the cursor when the tab regains focus.
    window.addEventListener('blur', releaseDesktopPointer);
  }

  // ── Mode-independent post-mode wiring ─────────────────────────
  let currentExhibit: Exhibit | null = null;
  let currentCtx: ExhibitContext | null = null;

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

  function applyUrlSync(id: string, historyMode: HistoryMode): void {
    const plan = planUrlSync(id, historyMode, defaultId, window.location.href);
    if (plan.write === 'push') history.pushState(null, '', plan.href);
    else if (plan.write === 'replace') history.replaceState(null, '', plan.href);
  }

  function switchExhibitNow(
    requestedId: string | null,
    historyMode: HistoryMode,
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
    applyUrlSync(targetId, historyMode);

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
    const ctx: ExhibitContext = {
      group,
      renderer,
      camera,
      pointers,
    };
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
      pointers,
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
    // Desktop frame order (plan v3 §3.6 G9): apply orbit damping +
    // refresh `camera.matrixWorld` BEFORE any pointer-ray reads
    // (exhibit.update + rack.updateHover). Skipped in VR — the
    // ArrayCamera's matrices are driven by the XR session's HMD
    // pose update, not this `PerspectiveCamera`.
    if (cameraControls) {
      cameraControls.update();
      camera.updateMatrixWorld();
    }
    currentExhibit?.update({ delta });
    rack.faceCamera(camera);
    rack.updateHover(pointers);
    rack.update();
    renderer.render(scene, camera);
  });
}

/**
 * Resolve the boot mode (#193, pancake plan v3 §3.2). Explicit
 * `?mode=` always wins; otherwise the async `isSessionSupported`
 * probe distinguishes a real headset from a desktop browser that
 * happens to expose `navigator.xr`.
 *
 * Defaults to `desktop` on probe failure / non-support / browsers
 * without `'xr' in navigator`. Per G5 the alternative — showing
 * `VRButton` on a desktop browser without a headset — is the worse
 * failure mode: it's a dead end the audience can't recover from.
 */
async function resolveBootMode(): Promise<Mode> {
  const requested = new URLSearchParams(window.location.search).get('mode');
  const { mode: explicit } = resolveMode(requested);
  if (explicit !== null) return explicit;
  // No `xr` namespace: every browser without WebXR support (Safari
  // today, older Chromium, etc.) short-circuits here with no probe
  // latency.
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) return 'desktop';
  try {
    const supported = await xr.isSessionSupported('immersive-vr');
    return supported ? 'vr' : 'desktop';
  } catch {
    // Some browsers throw on the probe (security context, missing
    // permissions, etc.). Treat any throw as "no immersive support."
    return 'desktop';
  }
}
