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
import { applyPancakeSpawnForExhibit, createCameraControls } from './cameraControls';
import { resolveStagePose } from './stagePose';
import { createEnvironment } from '@/scaffold/staging/Environment';
import { FpsOverlay } from '@/scaffold/perf/FpsOverlay';

// Vite HMR can re-execute module-level code in dev. `bootShell` is
// idempotent against double-invocation: subsequent calls early-return
// rather than registering a second set of controllers / listeners /
// exhibit groups, which would leak GPU resources and double-fire events.
//
// **`booted = true` is set synchronously, before the async mode probe
// awaits.** A second `bootShell()` call during the probe window (e.g.,
// Vite HMR re-execute against the same module instance) sees
// `booted = true` and bails immediately, preventing a second renderer /
// VRButton / event-listener stack from being constructed concurrently
// with the first (#193, pancake plan v3 §3.2 / N3).
//
// **Full module-replacement HMR (#207)** — when Vite replaces this
// module wholesale (the typical edit-save case), the new module
// instance starts with `booted = false` and would otherwise launch a
// second `bootShellAsync()` while the prior instance's renderer, DOM
// canvas, OrbitControls, and pending probe are still alive. The
// `import.meta.hot.dispose` hook below tears those down before the
// replacement runs. `disposers` accumulates per-resource teardown
// closures as `bootShellAsync` allocates them, so a mid-probe dispose
// still cleans up the pre-await state (renderer + canvas + resize
// listener). `bootGeneration` is bumped on dispose; the in-flight
// async continuation reads it post-await and bails if its generation
// is no longer current — preventing the disposed module's continuation
// from pushing more disposers / mounting an exhibit after the new
// module has taken over.
let booted = false;
let bootGeneration = 0;
const disposers: Array<() => void> = [];

/**
 * World-frame anchor for the `?fps=1`-gated dev FPS overlay (#261).
 *
 * Cluster-uniform: sits above the plinth front face, X-centered on
 * the plinth midline. Z = 0.05 tracks `PLINTH_ANCHOR_WORLD_XYZ.z`
 * so the overlay continues to sit above the slider rack rather than
 * getting stranded in world-Z if the plinth anchor shifts. Y = 1.85
 * keeps it ~25 cm above eye level for a 1.6 m spawn — high enough
 * to not occlude the math object, low enough to read at a glance
 * without breaking the user's neck.
 *
 * Per-scene-adaptive overlay anchor (#263 territory) is explicitly
 * out of scope per the #261 issue body — debug-only readout is
 * lower priority than user-facing UI.
 */
const FPS_OVERLAY_POSITION = new THREE.Vector3(0, 1.85, 0.05);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    bootGeneration++;
    // LIFO: dispose dependents (animation loop, current exhibit, mode-
    // specific listeners) before what they depend on (renderer + canvas
    // + window listeners). Wrap each call so a thrown disposer doesn't
    // skip the rest of the chain.
    while (disposers.length > 0) {
      const dispose = disposers.pop()!;
      try {
        dispose();
      } catch (err) {
        console.error('[geometer] HMR dispose error:', err);
      }
    }
    booted = false;
  });
}

export function bootShell(): void {
  if (booted) return;
  booted = true;
  void bootShellAsync();
}

async function bootShellAsync(): Promise<void> {
  // Snapshot the generation we booted on. Bumped by the HMR dispose
  // hook above; the post-await check at the end of mode resolution
  // bails if a dispose fired during the probe window (#207).
  const myGeneration = bootGeneration;

  const scene = new THREE.Scene();
  // Shell-owned environment surround (#224 / E1.3). Constructed at
  // the scene seam: mode-independent (pre-mode-probe; the :142 HMR
  // generation bail only gates *post*-await allocation, and a
  // mid-probe HMR drains `disposers[]` which already holds this
  // env's disposer). The disposer itself is pushed AFTER the
  // renderer disposer below so LIFO runs environment.dispose()
  // BEFORE renderer.dispose() frees the GL context (#224 plan §3.4).
  const environment = createEnvironment();
  scene.add(environment.group);
  scene.fog = environment.fog;
  scene.background = environment.background;

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  // Pre-mode camera position is left at the `PerspectiveCamera`
  // constructor default `(0, 0, 0)`. Pancake mode overwrites via
  // `createCameraControls(..., spawnWorldXYZ)` below; VR mode renders
  // through an `ArrayCamera` driven by HMD pose, so the
  // `PerspectiveCamera`'s pre-mode position never matters there.
  // Pre-#263 this line was `camera.position.set(0, 1.6, 3.7)` — the
  // cluster-uniform spawn — but per-scene spawn lives in the boot
  // exhibit's stage metadata now.

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);
  disposers.push(() => {
    renderer.dispose();
    renderer.domElement.remove();
  });
  // Pushed AFTER the renderer disposer so the LIFO drain runs
  // environment.dispose() (dome geo/mat + gradient DataTexture)
  // BEFORE renderer.dispose() frees the GL context (#224 plan §3.4
  // — two-way roundtable convergent HIGH).
  disposers.push(() => {
    scene.remove(environment.group);
    scene.fog = null;
    scene.background = null;
    environment.dispose();
  });

  // Shell-owned `?fps=1`-gated dev FPS overlay (#261). Lifted from
  // four near-identical per-scene `mount()` blocks (the #264
  // stopgap) so future scenes get the readout for free without
  // copy-paste. World-anchored at `FPS_OVERLAY_POSITION`; the
  // shell drives `update()` + `faceCamera()` per render frame.
  //
  // Pre-mode-probe alloc on purpose: position is mode-independent,
  // and the disposer (pushed AFTER the renderer disposer below to
  // preserve LIFO ordering — releases troika Text GL resources
  // BEFORE renderer.dispose() frees the GL context, mirroring the
  // environment-disposer pattern above) drains cleanly on
  // mid-probe HMR too.
  const fpsOverlay = isFpsOverlayEnabled() ? new FpsOverlay() : null;
  if (fpsOverlay) {
    fpsOverlay.group.position.copy(FPS_OVERLAY_POSITION);
    scene.add(fpsOverlay.group);
    disposers.push(() => {
      scene.remove(fpsOverlay.group);
      fpsOverlay.dispose();
    });
  }

  const resizeHandler = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resizeHandler);
  disposers.push(() => window.removeEventListener('resize', resizeHandler));

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

  // Boot-exhibit resolution hoisted before mode branch (#263). The
  // pancake `createCameraControls` call needs the boot exhibit's
  // `pancakeSpawnWorldXYZ` for its initial pose, and the VR
  // `applyVRSpawnOffsetForExhibit` closure needs an initial fallback
  // for sessionstart before `currentExhibit` is assigned. The same
  // `bootRequestedParam` rides through to `scheduler.requestSwitch` below
  // so the initial mount path stays unchanged.
  const bootRequestedParam = new URLSearchParams(window.location.search).get(
    'exhibit',
  );
  const { id: bootInitialId } = resolveExhibitId(
    bootRequestedParam,
    clusterExhibits,
  );
  const initialBootExhibit = clusterExhibits.find((e) => e.id === bootInitialId)!;

  // VR base reference-space snapshot (#263 §3.3). Stored on
  // `sessionstart`, cleared on `sessionend`. The base is the
  // UNOFFSET `local-floor` space; offsets ALWAYS derive from this
  // snapshot rather than from `renderer.xr.getReferenceSpace()`,
  // which returns the currently-offset space after the first call
  // and would stack on re-application. VR branch only writes; VR
  // closures + (deferred) follow-up reads.
  let baseXRReferenceSpace: XRReferenceSpace | null = null;

  // Mode resolution (#189 + #193, pancake plan v3 §3.2). Explicit
  // `?mode=` always wins; otherwise the async `isSessionSupported`
  // probe distinguishes a real headset from a desktop browser that
  // happens to expose `navigator.xr`. Default to `desktop` on
  // anything unexpected — that's the conservative fallback (G5):
  // worst case the audience sees a non-VR experience on a
  // VR-capable browser; the alternative (showing `VRButton` on a
  // browser without a headset) is a dead end.
  const mode = await resolveBootMode();
  // HMR fired during the probe (#207). Pre-await allocations
  // (renderer, canvas, resize listener) were already cleaned up by
  // the dispose hook via `disposers`; bail before allocating any
  // post-await resources that would race the new module instance.
  if (myGeneration !== bootGeneration) return;

  let pointers: readonly Pointer[];
  // Pancake (desktop / mobile) modes populate these; VR mode leaves
  // them null. The animation loop checks for them to drive damping +
  // matrix update before the hover dispatch reads pointer rays (per
  // plan v3 §3.6 frame order), and to invalidate the pancake pointer's
  // per-frame ray cache after the camera moves. One `DesktopPointer`
  // (with `id` `'desktop'` or `'mobile'`) covers both pancake modes.
  let cameraControls: OrbitControls | null = null;
  let pancakePointerRef: DesktopPointer | null = null;

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
    // VR spawn offset (#262 → #263). The default `local-floor`
    // reference space origin sits at world (0, 0, 0), which is
    // *inside* every cluster scene's plinth body (anchor at
    // floor-footprint center, body Z range
    // `[anchor.z - PLINTH_BODY_DEPTH, anchor.z]`). On session start,
    // snapshot the unoffset reference space and translate by the
    // currently-mounted exhibit's per-scene `vrSpawnOffsetWorldXYZ`
    // so the user spawns ~1.45 m forward of that scene's plinth
    // front face.
    //
    // Sign convention: `XRReferenceSpace.getOffsetReferenceSpace(origin)`
    // returns a new space whose origin, *expressed in the base space*,
    // sits at `origin.position`. HMD pose is then reported in the new
    // space's coordinates — to make the HMD report `+offsetZ`, place
    // the new space's origin at `-offsetZ` in the base. The HMD's y
    // component stays floor-relative (head height) regardless.
    //
    // PR1 applies the offset on `sessionstart` only; in-session
    // scene-rack hops in VR keep the prior offset. The receding-
    // plinth UX on cross-envelope hops is the accepted PR1 trade-off
    // (#263 §3.4 + §7 follow-up: the helper is wire-up-ready, the
    // §6 smoke verdict on quadrics→tangent-planes hops decides
    // priority).
    const applyVRSpawnOffsetForExhibit = (exhibit: Exhibit | null): void => {
      if (!renderer.xr.isPresenting) return;
      if (!baseXRReferenceSpace) return;
      const { vrSpawnOffsetWorldXYZ } = resolveStagePose(
        exhibit ?? initialBootExhibit,
      );
      const originOffset = new XRRigidTransform(
        {
          x: -vrSpawnOffsetWorldXYZ[0],
          y: -vrSpawnOffsetWorldXYZ[1],
          z: -vrSpawnOffsetWorldXYZ[2],
        },
        { x: 0, y: 0, z: 0, w: 1 },
      );
      // ALWAYS derive from the stored base, never from
      // `renderer.xr.getReferenceSpace()` (which returns the
      // currently-offset space after the first call → stacking).
      const offsetSpace =
        baseXRReferenceSpace.getOffsetReferenceSpace(originOffset);
      renderer.xr.setReferenceSpace(offsetSpace);
    };
    const onXrSessionStart = (): void => {
      baseXRReferenceSpace = renderer.xr.getReferenceSpace();
      if (!baseXRReferenceSpace) return;
      applyVRSpawnOffsetForExhibit(currentExhibit);
    };
    const onXrSessionEnd = (): void => {
      baseXRReferenceSpace = null;
    };
    renderer.xr.addEventListener('sessionstart', onXrSessionStart);
    renderer.xr.addEventListener('sessionend', onXrSessionEnd);
    disposers.push(() => {
      renderer.xr.removeEventListener('sessionstart', onXrSessionStart);
      renderer.xr.removeEventListener('sessionend', onXrSessionEnd);
    });
    const vrButton = VRButton.createButton(renderer);
    document.body.appendChild(vrButton);
    disposers.push(() => vrButton.remove());

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
    // ── Pancake mode (desktop / mobile) ─────────────────────────
    // No `VRButton`. `OrbitControls` orbits around the cluster
    // anchor (#192) and handles touch (single-touch rotate +
    // two-touch pinch-zoom) natively against the same `domElement`.
    // One `DesktopPointer` driven by pointer events — which fire
    // for both mouse and touch input — handles UI hit-tests + drag
    // per plan v3 §3.6. `mode === 'mobile'` only changes the
    // pointer's diagnostic `id`; plan v3 §3.4's "Pointer abstraction
    // tolerates the divergence" cashes out as a single shell branch
    // here.
    cameraControls = createCameraControls(
      camera,
      renderer.domElement,
      resolveStagePose(initialBootExhibit).pancakeSpawnWorldXYZ,
    );
    const cameraControlsRef = cameraControls;
    disposers.push(() => cameraControlsRef.dispose());
    // `DesktopPointer` is the camera-NDC `Pointer` adapter; the `id`
    // string is the only mobile-vs-desktop divergence today. If a
    // future feature ever earns a real subclass — `navigator.vibrate`
    // on `pulse` is the obvious candidate — it grows here, not in a
    // separate vestigial file. Plan v3 §3.4 originally specced a
    // `MobilePointer` class; spar feedback on #196 collapsed it
    // because there was no behavioral delta to test against.
    const pancakePointer = new DesktopPointer(
      camera,
      mode === 'mobile' ? 'mobile' : 'desktop',
    );
    pancakePointerRef = pancakePointer;
    pointers = [pancakePointer];

    // Convert a `MouseEvent`'s clientX/clientY (top-left origin,
    // y-down pixels) into the canvas-local NDC `Raycaster.setFromCamera`
    // expects (center origin, y-up, [−1, 1] range).
    const updateNdcFromEvent = (e: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pancakePointer.setNDC(x, y);
    };

    // OrbitControls gesture state machine (plan v3 §3.5 / G3 / D1).
    //
    // `OrbitControls.connect()` registers its own `pointerdown` on
    // `domElement` in bubble phase from inside its constructor —
    // which runs *before* this listener is added. The shell therefore
    // registers in **capture phase** so it fires first, and calls
    // `e.stopImmediatePropagation()` whenever it consumes the down.
    // Without this, OrbitControls' down handler would still claim
    // pointer-capture and register a `document.pointermove`, leaving
    // the camera-rotation state machine partially primed even with
    // `cameraControls.enabled = false` (per the spar review of #193).
    //
    // `activeGrabbed` is the primary idempotence guard. The
    // `pointerId` mismatch guard on `releaseFromPointerEvent`
    // prevents an unrelated pointer's event (e.g., a second mouse on
    // a multi-pointer setup) from releasing the active grab. Belt-
    // plus-suspenders: UI primitives' `releaseFromPointer` is
    // reference-equality-guarded already (plan v3 S4).
    let activePointerId: number | null = null;
    let activeGrabbed = false;
    // `Exhibit` instance that received the grab's `onSelectStart`.
    // Captured at grab time so an in-flight gesture's release routes
    // to the same exhibit even if a mount swap intervened (e.g.,
    // `window.blur` fires outside the animation loop where the
    // scheduler's drain happens, so a SceneRack-driven swap could
    // change `currentExhibit` between grab and release).
    let exhibitAtGrab: Exhibit | null = null;

    const releasePancakePointer = (): void => {
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
      exhibitAtGrab?.onSelectEnd(pancakePointer);
      exhibitAtGrab = null;
      if (cameraControls) cameraControls.enabled = true;
    };

    const releaseFromPointerEvent = (e: PointerEvent): void => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      releasePancakePointer();
    };

    renderer.domElement.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        // Primary button only. Right-click / middle-click belong to
        // OrbitControls (pan / zoom alternates) — we don't want to
        // hit-test UI on those.
        if (e.button !== 0) return;
        // Update NDC before dispatching select; the down-event may be
        // the very first pointer event the page has seen, in which case
        // there's no prior `pointermove` to have set NDC.
        updateNdcFromEvent(e);
        if (rack.tryActivate(pancakePointer)) {
          // SceneTab taps are activate-and-immediately-release; the
          // rack runs its own press flash. Stop propagation so
          // OrbitControls' bubble-phase pointerdown doesn't start a
          // spurious orbit gesture for a tap on a tab.
          e.stopImmediatePropagation();
          return;
        }
        const grabbed =
          currentExhibit?.onSelectStart(pancakePointer) ?? false;
        if (!grabbed) return; // empty click — let OrbitControls orbit
        // UI captured the gesture: take ownership at the shell + browser
        // layer so the rest of the gesture (drag → release) is ours,
        // and stop propagation so OrbitControls' down handler never
        // primes its rotation state.
        e.stopImmediatePropagation();
        try {
          renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
          // Some browsers throw if the pointer id is no longer active
          // (e.g., synthesized event during teardown). Treat as best-
          // effort; the activeGrabbed flag still gates release correctly.
        }
        activePointerId = e.pointerId;
        activeGrabbed = true;
        exhibitAtGrab = currentExhibit;
        if (cameraControls) cameraControls.enabled = false;
      },
      { capture: true },
    );

    renderer.domElement.addEventListener('pointermove', (e: PointerEvent) => {
      // Mid-grab, ignore moves from any pointer other than the one
      // that initiated the grab. Mostly defensive against a second
      // finger on mobile (single-pointer per plan v3 §3.4) — without
      // the guard, finger-2's coords would overwrite NDC and the
      // grabbed slider would jump to finger-2's position next frame.
      // Idle (`activePointerId === null`) is the hover dispatch path
      // and tracks whichever pointer is moving.
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
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
    window.addEventListener('blur', releasePancakePointer);
    disposers.push(() =>
      window.removeEventListener('blur', releasePancakePointer),
    );
  }

  // ── Mode-independent post-mode wiring ─────────────────────────
  let currentExhibit: Exhibit | null = null;
  let currentCtx: ExhibitContext | null = null;
  // Unmount the live exhibit on HMR dispose so its scene-graph
  // resources (geometries, materials, shader programs) release
  // before `renderer.dispose()` runs. Closure reads `currentExhibit`
  // lazily so it sees whatever's mounted at dispose time.
  disposers.push(() => {
    if (currentExhibit && currentCtx) {
      try {
        currentExhibit.unmount(currentCtx);
      } catch (err) {
        console.error('[geometer] HMR exhibit unmount error:', err);
      }
    }
  });

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
  // Position the rack at the boot exhibit's per-scene anchor (#263
  // follow-up). Refreshed in `switchExhibitNow` on every mount swap
  // so the rack tracks the per-scene plinth across SceneRack hops.
  // SceneRack's tab-local Z is 0 (zeroed-out in `SceneRack.ts` as
  // part of the same follow-up), so writing `rack.group.position`
  // here drives the tabs' world Z directly.
  {
    const rackAnchor =
      resolveStagePose(initialBootExhibit).rackAnchorWorldXYZ;
    rack.group.position.set(rackAnchor[0], rackAnchor[1], rackAnchor[2]);
  }
  scene.add(rack.group);
  // scene.fog material audit (#224 plan §3.5, amended at impl). The
  // fogNear≥14 linear-fog invariant provably un-fogs all near-field
  // cluster UI (see Environment.ts header). SceneRack is the lone
  // exception worth an explicit opt-out: in an extreme orbit pose it
  // can marginally exceed fogNear (~15 m, ~4% fade) AND it's the
  // persistent shell-owned nav surface, so token-stability wants it
  // fog-immune unconditionally. Troika-derived label materials are
  // lazy (may not exist yet) but are tiny near-field text the
  // invariant already covers; the tab disc/background meshes — the
  // visually significant mass — are standard materials present now.
  // `fog` lives on concrete materials, not the base `THREE.Material`
  // type — augment the cast rather than narrow per material class.
  type Foggable = THREE.Material & { fog: boolean };
  rack.group.traverse((obj) => {
    const mat = (obj as THREE.Mesh).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (!mat) return;
    if (Array.isArray(mat)) for (const m of mat) (m as Foggable).fog = false;
    else (mat as Foggable).fog = false;
  });

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

    // Per-scene pancake spawn (#263 §3.3 + §4.1 step 5). Reposition
    // the camera + refresh OrbitControls reset baseline for the
    // newly-mounted exhibit. Pancake-mode guard via `cameraControls !==
    // null` (VR mode leaves `cameraControls` null). For VR mode this
    // mount may have hopped between scenes, but the VR offset stays
    // at the prior `sessionstart` value per the #263 §3.4 PR1
    // decision; in-session re-offset is the §7 follow-up.
    const targetStage = resolveStagePose(target);
    if (cameraControls !== null) {
      applyPancakeSpawnForExhibit(
        camera,
        cameraControls,
        targetStage.pancakeSpawnWorldXYZ,
      );
    }
    // Per-scene rack position (#263 follow-up — fixes the plan §1
    // gap that the v3 sanity check missed). The rack follows the
    // per-scene plinth anchor so the bulbs sit above the plinth
    // front face in every cluster scene, not floating ahead of it
    // in the smaller-envelope scenes. Mode-agnostic — VR also needs
    // the rack at the new scene's anchor since the rack is shell-
    // owned, not plinth-owned.
    rack.group.position.set(
      targetStage.rackAnchorWorldXYZ[0],
      targetStage.rackAnchorWorldXYZ[1],
      targetStage.rackAnchorWorldXYZ[2],
    );
  }

  const scheduler = createSwitchScheduler({ commit: switchExhibitNow });

  // `popstate` fires when the user uses the browser back/forward
  // button. Read the param off the URL the browser has already
  // committed to; pass `'none'` so we don't push another entry
  // (which would loop). The raw value (which may be null for a
  // bare URL or '' for `?exhibit=` with no value) rides through
  // to the resolver, which distinguishes the two: bare URL is
  // silent, empty value warns.
  const popstateHandler = (): void => {
    const id = new URLSearchParams(window.location.search).get('exhibit');
    scheduler.requestSwitch(id, 'none');
  };
  window.addEventListener('popstate', popstateHandler);
  disposers.push(() => window.removeEventListener('popstate', popstateHandler));

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
  // `bootRequestedParam` + `bootInitialId` were resolved up-front
  // (above the mode branch) for the per-scene boot spawn; reuse them
  // here for the warm-up filter.
  for (const e of clusterExhibits) {
    if (e.id === bootInitialId) continue;
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
  // user has to back through. The raw `bootRequestedParam` (which may
  // be null for a bare URL) rides through unchanged so the
  // resolver can keep the bare-URL boot silent.
  scheduler.requestSwitch(bootRequestedParam, 'replace');

  const timer = new THREE.Timer();
  // Page Visibility integration: prevents huge delta spikes after the tab
  // (or Quest headset) is backgrounded and re-focused mid-session.
  timer.connect(document);
  disposers.push(() => timer.disconnect());
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
    //
    // `pancakePointerRef.invalidate()` clears the per-frame ray cache
    // — the cache is keyed on NDC alone, but the camera moved this
    // tick (damping), so reads in the rest of this frame must
    // recompute against the new matrices.
    if (cameraControls) {
      cameraControls.update();
      camera.updateMatrixWorld();
      pancakePointerRef?.invalidate();
    }
    currentExhibit?.update({ delta });
    rack.faceCamera(camera);
    rack.updateHover(pointers);
    rack.update();
    // `?fps=1` dev overlay tick (#261). Reads this-frame `delta`
    // and the post-exhibit-update camera matrices (faceCamera
    // billboard); placed before `renderer.render` so the synced
    // text reflects the frame about to be drawn.
    if (fpsOverlay) {
      fpsOverlay.update(delta, performance.now());
      fpsOverlay.faceCamera(camera);
    }
    renderer.render(scene, camera);
  });
  // Stop the loop FIRST on HMR dispose — pushed last so it pops first
  // (LIFO). Without this, the loop would render against half-disposed
  // state during the rest of the teardown chain.
  disposers.push(() => renderer.setAnimationLoop(null));
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
 *
 * **Mobile auto-detect is deliberately not wired** (plan v3 §6.6,
 * #196): `'mobile'` only returns from the explicit-`?mode=mobile`
 * branch. A phone hitting the bare URL gets `'desktop'` mode,
 * which is interactable (pointer events synthesize from touch and
 * `OrbitControls` handles touch natively against `domElement`).
 * Touch-capability auto-detect is the v1.x follow-up.
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

/**
 * `?fps=1`-gated dev overlay opt-in (#261). Lifted to shell scope
 * from four near-identical per-scene copies (#264 stopgap). The
 * `typeof window` guard makes the helper safe in environments
 * without a DOM (e.g., a future SSR shell-test harness); for the
 * browser path it's a one-line URL-param read.
 *
 * Quadrics still has its own copy of this helper for the
 * `RendererInfoProbe` console probe (#102) which shares the same
 * gate but isn't lifted — see issue #261 body for the
 * "don't break the pairing" carve-out.
 */
function isFpsOverlayEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('fps') === '1';
}
