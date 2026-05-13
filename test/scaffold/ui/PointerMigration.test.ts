import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// `troika-three-text` reaches for `self`, a browser-only global, in its
// UMD `now$1` helper. The default vitest environment is Node, so any
// `new Text()` blows up at construction time. TapButton creates a
// `Text` for its label; we stub the dep with a minimal mesh-like
// surrogate that exposes the same surface (`text`, `fontSize`, …,
// `sync`, `dispose`, `position`, `rotation`, `getWorldPosition`). The
// ray-hit math we're validating doesn't touch text rendering, so the
// stub is faithful enough for this test file.
vi.mock('troika-three-text', () => {
  class StubText extends THREE.Object3D {
    text = '';
    fontSize = 0;
    color = 0xffffff;
    anchorX: string | undefined;
    anchorY: string | undefined;
    outlineWidth: string | undefined;
    outlineColor: number | undefined;
    sync() {}
    dispose() {}
  }
  return { Text: StubText };
});

import { Slider } from '@/scaffold/ui/Slider';
import { TapButton } from '@/scaffold/ui/TapButton';
import { Preset } from '@/scaffold/ui/Preset';
import { SectionTab } from '@/scaffold/ui/SectionTab';
import { SceneTab } from '@/scaffold/ui/SceneTab';
import { AxisToggle } from '@/exhibits/quadrics/AxisToggle';
import type { Pointer } from '@/shell/Pointer';

// Vitest coverage for the #191 bundled migration: every UI primitive that
// moved from `controller: THREE.Object3D` → `pointer: Pointer` exercises
// `tryGrab` / `tryActivate` / `tryToggle` / `releaseFromPointer` /
// `updateHover` / `pulse` against a mock `Pointer`. Pancake plan v3 §5
// step 4 / D5: targeted verification of the irreversible bundled step.
//
// Each primitive is tested for the four behaviors that matter at the
// migration boundary: (1) hit → state transition + haptic pulse, (2) miss
// → no transition / no pulse, (3) hover toggles emissive on hit, (4)
// reference-equality release contract (S4) — only the grabbing pointer
// can release the grab.

interface MockPointer extends Pointer {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}

function mockPointer(
  origin: [number, number, number],
  direction: [number, number, number],
  id = 'test',
): MockPointer {
  return {
    id,
    origin: new THREE.Vector3(...origin),
    direction: new THREE.Vector3(...direction).normalize(),
    pulse: vi.fn(),
    getRayOrigin(target) {
      return target.copy(this.origin);
    },
    getRayDirection(target) {
      return target.copy(this.direction);
    },
  };
}

// A pointer aimed at the world origin (where each primitive's geometry
// sits when the group has identity transform) along world −Z. With the
// slider thumb / button / toggle mesh at world origin and the ray going
// (0,0,1) → (0,0,0), the ray-sphere hit test fires.
const HITTING_RAY = (): MockPointer => mockPointer([0, 0, 1], [0, 0, -1]);
// Same ray direction, offset well past every primitive's grab radius.
const MISSING_RAY = (): MockPointer => mockPointer([10, 0, 1], [0, 0, -1]);

describe('Slider — Pointer contract', () => {
  function makeSlider() {
    return new Slider({
      label: 'test',
      min: -1.5,
      max: 1.5,
      initial: 0,
      snapDetent: 0,
      snapPoints: [],
      grabRadiusMultiplier: 2.75,
    });
  }

  it('tryGrab returns true on hit, false on miss', () => {
    const slider = makeSlider();
    expect(slider.tryGrab(MISSING_RAY())).toBe(false);
    expect(slider.isGrabbed).toBe(false);
    expect(slider.tryGrab(HITTING_RAY())).toBe(true);
    expect(slider.isGrabbed).toBe(true);
  });

  it('tryGrab pulses haptics on hit, not on miss', () => {
    const slider = makeSlider();
    const miss = MISSING_RAY();
    slider.tryGrab(miss);
    expect(miss.pulse).not.toHaveBeenCalled();

    const hit = HITTING_RAY();
    slider.tryGrab(hit);
    expect(hit.pulse).toHaveBeenCalledTimes(1);
  });

  it('releaseFromPointer is reference-equality guarded (S4)', () => {
    const slider = makeSlider();
    const grabber = HITTING_RAY();
    expect(slider.tryGrab(grabber)).toBe(true);

    // A different pointer instance (same ray) must not release the grab.
    const imposter = HITTING_RAY();
    slider.releaseFromPointer(imposter);
    expect(slider.isGrabbed).toBe(true);
    expect(imposter.pulse).not.toHaveBeenCalled();

    // The original grabber releases cleanly + pulses.
    slider.releaseFromPointer(grabber);
    expect(slider.isGrabbed).toBe(false);
    // One pulse on grab, one on release.
    expect(grabber.pulse).toHaveBeenCalledTimes(2);
  });

  it('updateHover flips isHovered on hit and back off on miss', () => {
    const slider = makeSlider();
    expect(slider.isHovered).toBe(false);
    slider.updateHover([HITTING_RAY()]);
    expect(slider.isHovered).toBe(true);
    slider.updateHover([MISSING_RAY()]);
    expect(slider.isHovered).toBe(false);
  });

  it('updateHover short-circuits while grabbed (hover bit stays cleared)', () => {
    // While a grab is active, the hover affordance is subordinate to the
    // grab visual — updateHover must not toggle `hovered` to true even if
    // the same ray is hitting.
    const slider = makeSlider();
    expect(slider.tryGrab(HITTING_RAY())).toBe(true);
    slider.updateHover([HITTING_RAY()]);
    expect(slider.isHovered).toBe(false);
  });

  it('drag updates value across frames (delta accumulation contract preserved)', () => {
    // pointerAxisProjection for ray origin (0,0,1), direction (0,0,-1)
    // projects to slider-local X = 0 (perpendicular ray hits the axis at
    // the origin). Then shift origin → +X and the projection follows.
    const slider = makeSlider();
    const pointer = mockPointer([0, 0, 1], [0, 0, -1]);
    expect(slider.tryGrab(pointer)).toBe(true);
    expect(slider.value).toBe(0);

    // Move pointer +0.05 m along world X (perpendicular to ray) → slider
    // sees a +0.05 m delta in its local X axis. With dragGain 1.75,
    // trackLength 0.3, range 3.0: valueDelta = 0.05 * 1.75 * (3 / 0.3)
    // = 0.875.
    pointer.origin.x = 0.05;
    slider.update();
    expect(slider.value).toBeCloseTo(0.875, 4);
  });
});

describe('TapButton — Pointer contract', () => {
  function makeButton() {
    return new TapButton({
      name: 'test',
      grabRadiusMultiplier: 2.75,
      visuals: {
        groupNamePrefix: 'test',
        buttonRadius: 0.022,
        baseColor: 0x556677,
        hoverEmissive: 0x223344,
        pressEmissive: 0xddeeff,
        labelFontSize: 0.035,
        labelOffsetY: 0.04,
        labelAnchorY: 'bottom',
      },
    });
  }

  it('tryActivate returns true on hit, pulses haptics', () => {
    const button = makeButton();
    const hit = HITTING_RAY();
    expect(button.tryActivate(hit)).toBe(true);
    expect(hit.pulse).toHaveBeenCalledTimes(1);
  });

  it('tryActivate returns false on miss, no haptic pulse', () => {
    const button = makeButton();
    const miss = MISSING_RAY();
    expect(button.tryActivate(miss)).toBe(false);
    expect(miss.pulse).not.toHaveBeenCalled();
  });

  it('updateHover flips isHovered when ANY pointer in the array hits', () => {
    // Two-pointer (VR) and one-pointer (desktop / mobile) array shapes
    // both flip on hit. Multi-pointer array with one hitting member
    // exercises the `.some(...)` semantics.
    const button = makeButton();
    expect(button.isHovered).toBe(false);
    button.updateHover([MISSING_RAY(), HITTING_RAY()]);
    expect(button.isHovered).toBe(true);
    button.updateHover([MISSING_RAY()]);
    expect(button.isHovered).toBe(false);
    button.updateHover([HITTING_RAY()]);
    expect(button.isHovered).toBe(true);
  });
});

describe('Preset / SectionTab / SceneTab — inherit TapButton Pointer contract', () => {
  // Subclasses are thin shells over TapButton; one fan-out test asserts
  // the inherited contract reaches them.
  const subclassFactories: Array<[string, () => TapButton]> = [
    [
      'Preset',
      () =>
        new Preset({
          name: 'p',
          values: [1, 1, 1, -1],
          grabRadiusMultiplier: 2.75,
        }),
    ],
    [
      'SectionTab',
      () => new SectionTab({ name: 's', grabRadiusMultiplier: 2.75 }),
    ],
    ['SceneTab', () => new SceneTab({ name: 's', grabRadiusMultiplier: 2.75 })],
  ];

  for (const [name, factory] of subclassFactories) {
    it(`${name} activates + pulses on hit, misses cleanly`, () => {
      const btn = factory();
      const hit = HITTING_RAY();
      expect(btn.tryActivate(hit)).toBe(true);
      expect(hit.pulse).toHaveBeenCalledTimes(1);

      const miss = MISSING_RAY();
      expect(btn.tryActivate(miss)).toBe(false);
      expect(miss.pulse).not.toHaveBeenCalled();
    });
  }
});

describe('AxisToggle — Pointer contract', () => {
  function makeToggle() {
    return new AxisToggle({
      baseColor: 0xff0000,
      grabRadiusMultiplier: 2.75,
      initialEnabled: true,
    });
  }

  it('tryToggle flips enabled on hit and pulses haptics', () => {
    const toggle = makeToggle();
    expect(toggle.isEnabled).toBe(true);
    const hit = HITTING_RAY();
    expect(toggle.tryToggle(hit)).toBe(true);
    expect(toggle.isEnabled).toBe(false);
    expect(hit.pulse).toHaveBeenCalledTimes(1);

    expect(toggle.tryToggle(HITTING_RAY())).toBe(true);
    expect(toggle.isEnabled).toBe(true);
  });

  it('tryToggle returns false on miss without flipping or pulsing', () => {
    const toggle = makeToggle();
    const miss = MISSING_RAY();
    expect(toggle.tryToggle(miss)).toBe(false);
    expect(toggle.isEnabled).toBe(true);
    expect(miss.pulse).not.toHaveBeenCalled();
  });
});
