import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// `troika-three-text` reaches for `self`, a browser-only global, in its
// UMD `now$1` helper. The default vitest environment is Node, so any
// `new Text()` blows up at construction time. TapButton creates a
// `Text` for its label; this test mocks the dep with a minimal mesh-
// like surrogate matching PointerMigration.test.ts. None of the
// assertions below touch text rendering, so the stub is faithful enough.
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

import { Preset } from '@/scaffold/ui/Preset';

// Vitest coverage for the `Preset.activeEmissive` option added in #201
// PR 6. The pre-PR-6 Preset class hardcoded `activeEmissive: undefined`
// in its module-level VISUALS constant, so saddle-extrema bypassed
// Preset and constructed TapButton directly to supply its sticky-active
// emissive. PR 6 makes `activeEmissive` an optional PresetOptions field
// forwarded into a per-instance visuals spread; saddle-extrema migrates
// to Preset. Tests cover:
//
//   - One-shot Preset (no activeEmissive): setActive(true) flips the
//     internal flag but `isActive` stays false because there's no active
//     emissive to display. Matches TapButton's "if you can't show active,
//     you can't *be* active" contract at TapButton.ts:131-133.
//   - Sticky Preset (activeEmissive supplied): setActive(true) lights
//     up isActive; setActive(false) clears it.
//   - Sibling deactivation pattern (used by saddle-extrema at
//     index.ts: presetButtons[i].setActive(true) +
//     setActive(false) on the previous active sibling).
//   - `values` and `linearValues` default to zero-tuples when omitted —
//     saddle-extrema doesn't supply them; quadrics still passes its
//     coefficient values explicitly.

function makeOneShotPreset() {
  return new Preset({ name: 'one-shot', grabRadiusMultiplier: 2.75 });
}

function makeStickyPreset() {
  return new Preset({
    name: 'sticky',
    grabRadiusMultiplier: 2.75,
    activeEmissive: 0x66ccdd,
  });
}

describe('Preset.activeEmissive', () => {
  it('a one-shot Preset (no activeEmissive) never reports isActive even after setActive(true)', () => {
    const preset = makeOneShotPreset();
    expect(preset.isActive).toBe(false);
    preset.setActive(true);
    expect(preset.isActive).toBe(false);
  });

  it('a sticky Preset (activeEmissive supplied) toggles isActive via setActive', () => {
    const preset = makeStickyPreset();
    expect(preset.isActive).toBe(false);
    preset.setActive(true);
    expect(preset.isActive).toBe(true);
    preset.setActive(false);
    expect(preset.isActive).toBe(false);
  });

  it('sibling deactivation: setActive(true) on one + setActive(false) on the other leaves only the first lit', () => {
    const a = makeStickyPreset();
    const b = makeStickyPreset();
    a.setActive(true);
    b.setActive(true);
    expect(a.isActive).toBe(true);
    expect(b.isActive).toBe(true);
    // Sibling-deactivation pattern: the scene drives state, not Preset.
    a.setActive(false);
    expect(a.isActive).toBe(false);
    expect(b.isActive).toBe(true);
  });

  it('setActive(true) is idempotent on a sticky Preset already active', () => {
    const preset = makeStickyPreset();
    preset.setActive(true);
    expect(preset.isActive).toBe(true);
    preset.setActive(true);
    expect(preset.isActive).toBe(true);
  });

  it('values defaults to [0,0,0,0] when not supplied (saddle-extrema-style construction)', () => {
    const preset = makeStickyPreset();
    expect(preset.values).toEqual([0, 0, 0, 0]);
    expect(preset.linearValues).toEqual([0, 0, 0]);
  });

  it('values + linearValues are preserved when supplied (quadrics-style construction)', () => {
    const preset = new Preset({
      name: 'quadrics-style',
      grabRadiusMultiplier: 2.75,
      values: [1, 1, 1, -1],
      linearValues: [0, 0, -1],
    });
    expect(preset.values).toEqual([1, 1, 1, -1]);
    expect(preset.linearValues).toEqual([0, 0, -1]);
  });
});
