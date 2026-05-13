import * as THREE from 'three';
import type { ClusterId } from './clusters';
import type { Pointer } from './Pointer';

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
  onSelectStart(pointer: Pointer): void;
  onSelectEnd(pointer: Pointer): void;
}
