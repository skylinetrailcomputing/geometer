import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { MathVec3 } from '@/scaffold/math/frames';

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

import { TangentPlaneReadout } from '@/exhibits/tangent-planes/TangentPlaneReadout';

// Vitest coverage for the visibility-bootstrap policy lock added in
// #201 PR 3. Same shape as the EquationReadout assertion: boot hidden,
// uncloak after the first setValues, throttle bypassed on first call.

describe('TangentPlaneReadout visibility-bootstrap', () => {
  function makeReadout(): TangentPlaneReadout {
    return new TangentPlaneReadout({
      axisColors: [0xd55e00, 0x009e73, 0x56b4e9],
    });
  }

  const point: MathVec3 = [0.5, 0.5, 0.707];
  const normal: MathVec3 = [0.5, 0.5, 0.707];

  it('boots hidden (group.visible = false until first setValues)', () => {
    const readout = makeReadout();
    expect(readout.group.visible).toBe(false);
  });

  it('uncloaks after the first setValues call', () => {
    const readout = makeReadout();
    expect(readout.group.visible).toBe(false);
    readout.setValues(point, normal);
    expect(readout.group.visible).toBe(true);
  });

  it('first setValues bypasses the throttle gate', () => {
    const readout = makeReadout();
    readout.setValues(point, normal);
    readout.setValues(point, normal);
    expect(readout.group.visible).toBe(true);
  });
});
