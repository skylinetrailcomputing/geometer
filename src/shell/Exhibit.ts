import * as THREE from 'three';
import type { ClusterId } from './clusters';

export interface ExhibitContext {
  // Per-exhibit root group (#150). The shell creates this on mount and
  // removes it on unmount — exhibits add their content to `group`, not
  // directly to a scene. Step 5 will add an in-session swap path that
  // unmounts the prior exhibit's group before mounting the next one.
  group: THREE.Group;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  // Shell-owned XR controllers (#150). Listeners are registered once in
  // `bootShell`; the shell dispatches `selectstart` / `selectend` to the
  // currently-mounted exhibit via `onSelectStart` / `onSelectEnd`.
  controllers: readonly THREE.Object3D[];
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
  // Controller-event dispatch routes shell → exhibit (#150). Quadrics
  // implements the full grab-tab-toggle dispatch in `onSelectStart`;
  // `hello` is a no-op.
  onSelectStart(controller: THREE.Object3D): void;
  onSelectEnd(controller: THREE.Object3D): void;
}
