import * as THREE from 'three';
import { SceneTab } from '@/scaffold/ui/SceneTab';
import type { Exhibit } from './Exhibit';

// In-app navigation surface for moving between sibling exhibits in a
// cluster (#150). Owns the row of `SceneTab` instances + their
// active-state bookkeeping + the worldspace placement transform.
//
// Lives in `shell/` rather than `scaffold/ui/` because it's
// shell-specific machinery: there's exactly one rack instance per
// shell boot, the cluster filtering happens at the call site
// (`shell.ts` step 5 of #150), and the placement constants below are
// the cluster's worldspace anchor — not a per-exhibit design choice.
//
// Worldspace anchor (per the v3 plan §5):
//   * `SCENE_RACK_Y = 1.73` — one `SECTION_TAB_RACK_PITCH` (0.23)
//     above quadrics' canonical-forms heading at Y=1.50, leaving
//     17 cm of clearance above the SectionTab column.
//   * `SCENE_RACK_CENTER_X = -0.44` — matches `SECTION_TAB_RACK_X`
//     so the two racks stack as a single vertical column.
//   * `SCENE_RACK_Z = -0.7` — matches `SLIDER_RACK_CENTER.z` so
//     all three rack tiers sit at the same arm's-length depth.
//   * `SCENE_TAB_PITCH = 0.20` — horizontal spacing between tabs.
// These constants live here (rather than in SceneTab) because they
// are layout concerns for the rack as a whole; per-tab visuals
// (radius, label size, accent emissive) belong in `SceneTab.ts`.

const SCENE_RACK_Y = 1.73;
const SCENE_RACK_CENTER_X = -0.44;
const SCENE_RACK_Z = -0.7;
const SCENE_TAB_PITCH = 0.20;

export interface SceneRackOptions {
  // Cluster members in display order. The caller (shell.ts) is
  // responsible for filtering `listExhibits()` down to the active
  // cluster before passing it in — SceneRack treats this list as
  // authoritative and renders one tab per entry.
  exhibits: readonly Exhibit[];
  // Forwarded to each SceneTab's `grabRadiusMultiplier`. Required so
  // the cluster's call site declares the affordance scale; the
  // calculus3 cluster passes 2.75 to match the rest of its rack.
  grabRadiusMultiplier: number;
  // Fired when a tab is tapped. SceneRack does not switch the
  // exhibit itself — that's the shell's job (request-and-defer to
  // the next animation frame, per §4.2). The rack only owns its own
  // active-emissive bookkeeping; it leaves cross-rack coordination
  // (URL sync, history mode, `unmount()` of the previous exhibit)
  // to the shell.
  onSelect: (id: string) => void;
}

export class SceneRack {
  readonly group: THREE.Group;

  private readonly tabs: readonly SceneTab[];
  private readonly exhibitIds: readonly string[];
  private readonly onSelect: (id: string) => void;

  constructor(opts: SceneRackOptions) {
    this.onSelect = opts.onSelect;
    this.exhibitIds = opts.exhibits.map((e) => e.id);

    this.group = new THREE.Group();
    this.group.name = 'scene-rack';

    const tabs: SceneTab[] = [];
    const n = opts.exhibits.length;
    for (let i = 0; i < n; i++) {
      const tab = new SceneTab({
        name: opts.exhibits[i].title,
        grabRadiusMultiplier: opts.grabRadiusMultiplier,
      });
      // Centered horizontal layout: for N tabs, leftmost sits at
      // `centerX − ((N − 1) / 2) × pitch`. Even N reads as
      // straddling the column; odd N reads as one tab on-axis with
      // the SectionTab column beneath, which is the visual we want.
      const x = SCENE_RACK_CENTER_X + (i - (n - 1) / 2) * SCENE_TAB_PITCH;
      tab.group.position.set(x, SCENE_RACK_Y, SCENE_RACK_Z);
      this.group.add(tab.group);
      tabs.push(tab);
    }
    this.tabs = tabs;
  }

  /**
   * Drive the sticky-active emissive across the rack. Exclusive: the
   * tab whose owning exhibit matches `id` lights up, all others go
   * inactive. An unknown id leaves every tab inactive — the shell
   * validates ids before calling, so this state is reached only on a
   * mid-frame race the shell deliberately accepted.
   */
  setActiveExhibit(id: string): void {
    for (let i = 0; i < this.tabs.length; i++) {
      this.tabs[i].setActive(this.exhibitIds[i] === id);
    }
  }

  /**
   * Try to activate a tab on this controller's `selectstart`. Returns
   * true if a tab was hit (rack consumed the event); the shell uses
   * the return value as its rack-first-refusal signal — only routes
   * the event to the current exhibit's `onSelectStart` if the rack
   * passed. On hit, fires the matched tab's press flash + haptics
   * and invokes `onSelect(id)`.
   *
   * **Immediate active-state update (#150 plan v4 §3.2 / DeepSeek #4).**
   * The tapped tab's visual active state is promoted *before*
   * invoking `onSelect`, so the highlight switches in the same
   * render frame as the tap rather than waiting on the deferred
   * `switchExhibitNow` (one-frame defer + the unmount/mount cost).
   * The shell's later `setActiveExhibit(resolvedId)` is idempotent
   * if already active and re-syncs the rack if the deferred switch
   * resolved to a different id (e.g., bogus or non-cluster id that
   * fell back to the cluster default).
   */
  tryActivate(controller: THREE.Object3D): boolean {
    for (let i = 0; i < this.tabs.length; i++) {
      if (this.tabs[i].tryActivate(controller)) {
        this.setActiveExhibit(this.exhibitIds[i]);
        this.onSelect(this.exhibitIds[i]);
        return true;
      }
    }
    return false;
  }

  updateHover(controllers: readonly THREE.Object3D[]): void {
    for (const tab of this.tabs) tab.updateHover(controllers);
  }

  update(): void {
    for (const tab of this.tabs) tab.update();
  }

  faceCamera(camera: THREE.Camera): void {
    for (const tab of this.tabs) tab.faceCamera(camera);
  }

  dispose(): void {
    for (const tab of this.tabs) tab.dispose();
  }
}
