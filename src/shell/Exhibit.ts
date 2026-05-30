import * as THREE from 'three';
import type { ClusterId } from './clusters';
import type { Pointer } from './Pointer';

/**
 * Per-scene staging metadata for the shell-driven spawn pose (#263).
 *
 * Shell consumes only spawn poses; the scene composes them at module
 * load via `scaffold/staging/clusterStagePose.ts`. The plinth anchor
 * itself stays scene-local (consumed by the per-scene `createPlinth`
 * call) and intentionally is NOT exposed here — keeping the shell's
 * seam to spawn data only.
 */
export interface ExhibitStageMetadata {
  /**
   * Pancake camera initial position in world coords. Shell sets
   * `camera.position` to this on boot AND on every pancake mount
   * swap, then calls `controls.saveState()` to refresh the reset
   * baseline.
   */
  readonly pancakeSpawnWorldXYZ: readonly [number, number, number];
  /**
   * VR `local-floor` reference-space offset in world coords. Shell
   * applies as `XRRigidTransform({-x, -y, -z}, identity)` on
   * session start; the HMD then reports pose in the offset space.
   * PR1 (#263) applies on `sessionstart` only; in-session scene-rack
   * hops in VR keep the prior offset. Follow-up: §7 of the #263 plan.
   */
  readonly vrSpawnOffsetWorldXYZ: readonly [number, number, number];
}

export interface ExhibitContext {
  // Per-exhibit root group (#150). The shell creates this on mount and
  // removes it on unmount — exhibits add their content to `group`, not
  // directly to a scene. Step 5 will add an in-session swap path that
  // unmounts the prior exhibit's group before mounting the next one.
  group: THREE.Group;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  /**
   * Shell-owned `Pointer` instances (#190 + #191). Same reference per
   * frame; UI primitives compare by reference for grab / release
   * bookkeeping (pancake plan v3 §3.5 / S4).
   */
  pointers: readonly Pointer[];
}

export interface ExhibitFrame {
  delta: number;
}

export interface Exhibit {
  id: string;
  title: string;
  // Cluster membership for the SceneRack visibility filter (#150). Step 4
  // sets the field on `quadrics`; step 5 wires the rack to filter by it.
  // `hello` leaves it unset — it's a toolchain smoke test, not a cluster
  // member.
  cluster?: ClusterId;
  /**
   * Per-scene staging metadata for the shell's spawn pose (#263).
   * Absent → cluster-uniform fallback (`shell/stagePose.ts` constants:
   * pancake `(0, 1.6, 3.7)`, VR offset `(0, 0, 1.5)`). Non-cluster
   * exhibits (today: `hello`) leave this unset.
   */
  stage?: ExhibitStageMetadata;
  mount(ctx: ExhibitContext): void;
  update(frame: ExhibitFrame): void;
  // `unmount` is required as of #150 step 4: exhibits dispose owned GPU
  // resources and unregister side-effects. The shell removes the
  // per-exhibit `group` afterwards; exhibits don't need to clear the
  // group's children manually.
  unmount(ctx: ExhibitContext): void;
  // Pointer-event dispatch routes shell → exhibit (#150 + #191). The
  // shell resolves the originating XR controller (or desktop / mobile
  // pointer in pancake mode, #105) to a stable `Pointer` instance and
  // hands it to the current exhibit. Quadrics implements the full
  // grab-tab-toggle dispatch in `onSelectStart`; `hello` is a no-op.
  //
  // `onSelectStart` returns `true` when a UI primitive consumed the
  // event (slider grab, preset/section/canonical-forms tap, axis
  // toggle), `false` otherwise. Desktop mode (#193) reads this to
  // decide whether to suspend the orbit-camera controls for the
  // duration of the grab — without it, dragging a slider would also
  // rotate the camera. VR mode ignores the return value: there's no
  // shared input device contending for the same gesture.
  onSelectStart(pointer: Pointer): boolean;
  onSelectEnd(pointer: Pointer): void;
}
