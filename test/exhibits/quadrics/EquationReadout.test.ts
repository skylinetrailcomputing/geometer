import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// `troika-three-text` reaches for `self` (browser global) in its UMD
// helper. Stub Text with a minimal Object3D surrogate that exposes the
// `text`/`sync` surface the readout uses. Matches the established
// pattern in test/scaffold/ui/PointerMigration.test.ts.
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

import { EquationReadout } from '@/exhibits/quadrics/EquationReadout';

// Vitest coverage for the visibility-bootstrap policy lock added in
// #201 PR 3. Pre-PR-3, EquationReadout booted `group.visible = true`
// with empty troika `Text` slots — the first frame between mount and
// the first update() tick painted an empty-content flash. PR 3 boots
// `group.visible = false` and flips to true at the end of the first
// `setValues` call. The throttle gate at the top of `setValues` is
// bypassed on the first call so frame 1 always paints real text.

describe('EquationReadout visibility-bootstrap', () => {
  it('boots hidden (group.visible = false until first setValues)', () => {
    const readout = new EquationReadout({
      coefficientColors: [
        0xd55e00, 0x009e73, 0x56b4e9, 0xd55e00, 0x009e73, 0x56b4e9,
        0xf0e442,
      ],
    });
    expect(readout.group.visible).toBe(false);
  });

  it('uncloaks after the first setValues call with real numeric text', () => {
    const readout = new EquationReadout({
      coefficientColors: [
        0xd55e00, 0x009e73, 0x56b4e9, 0xd55e00, 0x009e73, 0x56b4e9,
        0xf0e442,
      ],
    });
    expect(readout.group.visible).toBe(false);
    readout.setValues(1, 1, 1, -1, 0, 0, 0);
    expect(readout.group.visible).toBe(true);
  });

  it('first setValues bypasses the throttle gate even with lastSyncMs near now', () => {
    const readout = new EquationReadout({
      coefficientColors: [
        0xd55e00, 0x009e73, 0x56b4e9, 0xd55e00, 0x009e73, 0x56b4e9,
        0xf0e442,
      ],
    });
    // Defensive contract: the first call must always succeed regardless
    // of throttle state. Verified indirectly — group.visible flips even
    // when many setValues calls fire back-to-back inside the throttle
    // window.
    readout.setValues(1, 0, 0, 0, 0, 0, 0);
    readout.setValues(2, 0, 0, 0, 0, 0, 0);
    expect(readout.group.visible).toBe(true);
  });

  it('mounts the plinth back-plate as a child of group (#252)', () => {
    const readout = new EquationReadout({
      coefficientColors: [
        0xd55e00, 0x009e73, 0x56b4e9, 0xd55e00, 0x009e73, 0x56b4e9,
        0xf0e442,
      ],
    });
    // Per #252 plan §3.5 v3 (option-c), the back-plate is a direct
    // child of `group` so it inherits the per-frame yaw-billboard
    // transitively. Asserting via a single THREE.Mesh child is the
    // minimal observable surface (text Texts are stubbed to Object3D
    // by the test mock; the panel is the only real THREE.Mesh).
    const meshChildren = readout.group.children.filter(
      (c) => c.type === 'Mesh',
    );
    expect(meshChildren.length).toBe(1);
  });
});
