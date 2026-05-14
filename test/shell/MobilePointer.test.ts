import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MobilePointer } from '@/shell/MobilePointer';
import { DesktopPointer } from '@/shell/DesktopPointer';

// `MobilePointer` is a thin subclass of `DesktopPointer` that just
// rebrands the `id` to 'mobile'. The shared ray math is already pinned
// by `DesktopPointer.test.ts`; here we only verify the subclass-level
// invariants — the id, the `instanceof` relationship, and a single
// behavior spot-check confirming inheritance wired up correctly.

const makeCamera = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld(true);
  return camera;
};

describe('MobilePointer', () => {
  it('uses id "mobile" by default', () => {
    const pointer = new MobilePointer(makeCamera());
    expect(pointer.id).toBe('mobile');
  });

  it('is a DesktopPointer at runtime (same ray adapter)', () => {
    // The shell relies on `MobilePointer instanceof DesktopPointer`
    // so the outer `pancakePointerRef: DesktopPointer | null` field
    // accepts either adapter without narrowing.
    const pointer = new MobilePointer(makeCamera());
    expect(pointer).toBeInstanceOf(DesktopPointer);
  });

  it('inherits NDC-driven ray direction from DesktopPointer', () => {
    // Spot-check inheritance: at NDC (0, 0) the unrotated camera's
    // forward ray is world (0, 0, -1). Full math coverage lives in
    // `DesktopPointer.test.ts`.
    const pointer = new MobilePointer(makeCamera());
    pointer.setNDC(0, 0);
    const target = new THREE.Vector3();
    pointer.getRayDirection(target);
    expect(target.x).toBeCloseTo(0);
    expect(target.y).toBeCloseTo(0);
    expect(target.z).toBeCloseTo(-1);
  });

  it('pulse is a no-op (no haptic surface wired up yet)', () => {
    // Per `MobilePointer`'s "deferred" note: `navigator.vibrate` is a
    // plausible future divergence, but v0.9 stretch ships the no-op
    // inherited from `DesktopPointer.pulse`.
    const pointer = new MobilePointer(makeCamera());
    expect(() => pointer.pulse(0.4, 25)).not.toThrow();
  });
});
