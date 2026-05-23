import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// `troika-three-text` reaches for `self`, a browser-only global, in its
// UMD `now$1` helper. The default vitest environment is Node, so any
// `new Text()` blows up at construction time. Reuses the surrogate
// pattern from `Preset.test.ts` (and `PointerMigration.test.ts`). None
// of the assertions below touch text rendering, so the stub is faithful
// enough — `Object3D` gives us the `rotation` Euler that the tests
// inspect.
//
// One deliberate divergence from the prior stubs: the ctor sets
// `rotation` to a non-identity sentinel `(0.5, 0.5, 0.5)`. The default
// would be `(0, 0, 0)` from `Object3D`, which is what `TapButton`'s
// surface-branch ctor identity-set ALSO writes — making the
// "ctor identity-set" test a tautology against the Object3D default
// (it would pass even if the identity-set line were deleted). The
// non-identity default makes the explicit identity-set observable:
// the test asserts `(0, 0, 0)` post-ctor, which is reached IF AND ONLY
// IF the `if (this.labelOrientation === 'surface')` branch fired and
// wrote identity. Removing that branch from `TapButton` would leave
// `rotation` at the stub default and fail the test — closing the gap
// /spar (oppositional-reviewer, finding #1) flagged.
vi.mock('troika-three-text', () => {
  class StubText extends THREE.Object3D {
    text = '';
    fontSize = 0;
    color = 0xffffff;
    anchorX: string | undefined;
    anchorY: string | undefined;
    outlineWidth: string | undefined;
    outlineColor: number | undefined;
    constructor() {
      super();
      this.rotation.set(0.5, 0.5, 0.5);
    }
    sync() {}
    dispose() {}
  }
  return { Text: StubText };
});

import {
  TapButton,
  type TapButtonOptions,
  type TapButtonVisuals,
} from '@/scaffold/ui/TapButton';
import { SectionTab } from '@/scaffold/ui/SectionTab';
import { SceneTab } from '@/scaffold/ui/SceneTab';
import { Preset } from '@/scaffold/ui/Preset';

// Vitest coverage for `TapButtonVisuals.labelOrientation` added in
// #255 PR2. Three branches per the v3-plan §4.2 + the convergent C1
// / C2 roundtable findings:
//
//   - 'surface': ctor identity-sets `label.rotation`, and `faceCamera`
//     early-returns so the label stays at whatever the caller / ctor
//     left it. The convergent test sets a non-identity sentinel
//     Euler BEFORE calling `faceCamera`, then asserts all three
//     components are unchanged. Catches "ctor failed to identity-set"
//     AND "faceCamera mutated rotation despite the early-return."
//   - 'face-camera' (default): `faceCamera` writes the expected
//     yaw-billboard. Asserts rotation.y matches `atan2(dx, dz)` and
//     rotation.x / rotation.z are zero.
//   - Option threading: each TapButton subclass's module-level
//     VISUALS const threads the labelOrientation choice through to
//     the base TapButton. `SectionTab` opts in to 'surface'; `Preset`
//     + `SceneTab` default to 'face-camera'. Verifies via the SAME
//     behavioral check (sentinel preserved vs mutated) since
//     `labelOrientation` is private on TapButton — no silent drops
//     by a wrapper (GPT #4 roundtable finding).

const BASE_VISUALS: TapButtonVisuals = {
  groupNamePrefix: 'test',
  buttonRadius: 0.025,
  baseColor: 0x44aabb,
  hoverEmissive: 0x224455,
  pressEmissive: 0x88ddff,
  labelFontSize: 0.022,
  labelOffsetY: 0,
  labelAnchorY: 'top',
};

function makeTapButton(opts: Partial<TapButtonOptions> = {}): TapButton {
  return new TapButton({
    name: 'test',
    grabRadiusMultiplier: 1.5,
    visuals: BASE_VISUALS,
    ...opts,
  });
}

// Yaw-billboard camera at (+x, 0, +z) — `faceCamera` should write
// `rotation.y = atan2(dx, dz)`. Choose values where atan2 is non-zero
// so the test would fail if `faceCamera` were stubbed out.
function makeCamera(): THREE.Camera {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(1, 0, 1);
  cam.updateMatrixWorld();
  return cam;
}

describe('TapButton labelOrientation', () => {
  describe("'surface' branch", () => {
    it("ctor identity-sets label.rotation when labelOrientation is 'surface'", () => {
      // The StubText ctor at the top of this file sets rotation to a
      // non-identity sentinel (0.5, 0.5, 0.5). TapButton's surface-
      // branch ctor identity-set is the ONLY thing that returns the
      // label to (0, 0, 0) post-construction — if that line is removed,
      // this test fails. (Pre-spar this test was a tautology against
      // Object3D's (0, 0, 0) default; the StubText non-identity default
      // makes the explicit identity-set observable.)
      const button = makeTapButton({
        visuals: { ...BASE_VISUALS, labelOrientation: 'surface' },
      });
      // Access the label via the group (TapButton adds it to the group
      // at ctor). The second child is the troika label (first is the
      // sphere mesh; see TapButton.ts ctor order).
      const label = button.group.children[1]!;
      expect(label.rotation.x).toBe(0);
      expect(label.rotation.y).toBe(0);
      expect(label.rotation.z).toBe(0);
    });

    it("lifts label.position.z by the surface standoff when 'surface' (avoids slab z-fight)", () => {
      const button = makeTapButton({
        visuals: { ...BASE_VISUALS, labelOrientation: 'surface' },
      });
      const label = button.group.children[1]!;
      // The label sits coplanar with the slab top face without the
      // standoff (#255 PR2 smoke surfaced z-fight under camera rotation).
      // Standoff is ~1 mm in label-local +Z; magnitude check (not
      // exact-equality) keeps the test resilient to future bracket
      // retunes — the contract is "non-zero and small," not the exact
      // numeric.
      expect(label.position.z).toBeGreaterThan(0);
      expect(label.position.z).toBeLessThan(0.005);
    });

    it("does NOT lift label.position.z when 'face-camera' (no z-fight to avoid)", () => {
      const button = makeTapButton({
        visuals: { ...BASE_VISUALS, labelOrientation: 'face-camera' },
      });
      const label = button.group.children[1]!;
      expect(label.position.z).toBe(0);
    });

    it("preserves a non-identity rotation across faceCamera() when 'surface'", () => {
      const button = makeTapButton({
        visuals: { ...BASE_VISUALS, labelOrientation: 'surface' },
      });
      const label = button.group.children[1]!;
      // Sentinel Euler: distinct on all three axes so a partial
      // mutation by a buggy `faceCamera` would surface.
      label.rotation.set(0.1, 0.2, 0.3);
      button.faceCamera(makeCamera());
      expect(label.rotation.x).toBe(0.1);
      expect(label.rotation.y).toBe(0.2);
      expect(label.rotation.z).toBe(0.3);
    });
  });

  describe("default 'face-camera' branch", () => {
    it('writes the expected yaw-billboard when labelOrientation is omitted', () => {
      const button = makeTapButton();
      const label = button.group.children[1]!;
      // Camera at (1, 0, 1), label (and button) at world origin.
      // dx = 1, dz = 1 ⇒ atan2(1, 1) = π/4.
      button.faceCamera(makeCamera());
      expect(label.rotation.x).toBe(0);
      expect(label.rotation.y).toBeCloseTo(Math.PI / 4, 6);
      expect(label.rotation.z).toBe(0);
    });

    it("writes yaw-billboard when labelOrientation is explicitly 'face-camera'", () => {
      const button = makeTapButton({
        visuals: { ...BASE_VISUALS, labelOrientation: 'face-camera' },
      });
      const label = button.group.children[1]!;
      button.faceCamera(makeCamera());
      expect(label.rotation.y).toBeCloseTo(Math.PI / 4, 6);
    });
  });

  describe('subclass option-forwarding audit', () => {
    // SectionTab's VISUALS const sets labelOrientation: 'surface'
    // (#255 PR2). Confirm the choice threads through the ctor chain
    // to the base TapButton — sentinel rotation is preserved after
    // faceCamera, just like the direct-TapButton 'surface' test.
    it("SectionTab inherits 'surface' from its VISUALS const", () => {
      const tab = new SectionTab({ name: 'Squared terms', grabRadiusMultiplier: 1.5 });
      const label = tab.group.children[1]!;
      label.rotation.set(0.1, 0.2, 0.3);
      tab.faceCamera(makeCamera());
      expect(label.rotation.x).toBe(0.1);
      expect(label.rotation.y).toBe(0.2);
      expect(label.rotation.z).toBe(0.3);
    });

    // Preset's VISUALS const does NOT set labelOrientation, so it
    // defaults to 'face-camera' — yaw-billboard mutates the label
    // rotation. Confirms the option isn't silently set somewhere in
    // Preset's ctor chain.
    it("Preset defaults to 'face-camera' (yaw-billboard mutates rotation)", () => {
      const preset = new Preset({ name: 'Sphere', grabRadiusMultiplier: 1.5 });
      const label = preset.group.children[1]!;
      label.rotation.set(0.1, 0.2, 0.3);
      preset.faceCamera(makeCamera());
      // y was overwritten by atan2; x and z were zeroed by the
      // rotation.set(0, ..., 0) call in faceCamera.
      expect(label.rotation.x).toBe(0);
      expect(label.rotation.y).toBeCloseTo(Math.PI / 4, 6);
      expect(label.rotation.z).toBe(0);
    });

    // SceneTab's VISUALS const does NOT set labelOrientation, so it
    // defaults to 'face-camera'. SceneRack is mid-air; yaw-billboard
    // is the desired behavior.
    it("SceneTab defaults to 'face-camera' (yaw-billboard mutates rotation)", () => {
      const scene = new SceneTab({ name: 'quadrics', grabRadiusMultiplier: 1.5 });
      const label = scene.group.children[1]!;
      label.rotation.set(0.1, 0.2, 0.3);
      scene.faceCamera(makeCamera());
      expect(label.rotation.x).toBe(0);
      expect(label.rotation.y).toBeCloseTo(Math.PI / 4, 6);
      expect(label.rotation.z).toBe(0);
    });
  });
});
