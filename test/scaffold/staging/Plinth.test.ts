import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createPlinth,
  computePlinthSlotTransform,
  PLINTH_WORKING_WIDTH_DEFAULT,
  PLINTH_WORKING_HEIGHT_DEFAULT,
  PLINTH_TILT_DEFAULT,
  PLINTH_WORKING_HEIGHT_FROM_FLOOR_DEFAULT,
} from '../../../src/scaffold/staging/Plinth.ts';

function makeTarget(): THREE.Group {
  return new THREE.Group();
}

describe('computePlinthSlotTransform (#225 / E1.4 — pure slot-frame math)', () => {
  it('identity inputs → worldPosition = origin', () => {
    const { worldPosition, worldRotation } = computePlinthSlotTransform(
      [0, 0, 0],
      0,
      0,
      [0, 0, 0],
    );
    expect(worldPosition.x).toBeCloseTo(0, 6);
    expect(worldPosition.y).toBeCloseTo(0, 6);
    expect(worldPosition.z).toBeCloseTo(0, 6);
    // Surface tilt = 0 → identity quaternion.
    expect(worldRotation.x).toBeCloseTo(0, 6);
    expect(worldRotation.y).toBeCloseTo(0, 6);
    expect(worldRotation.z).toBeCloseTo(0, 6);
    expect(worldRotation.w).toBeCloseTo(1, 6);
  });

  it('non-zero anchor + zero tilt → translates the slot to anchor + height', () => {
    const { worldPosition } = computePlinthSlotTransform(
      [1, 2, 3],
      0,
      0.5,
      [0, 0, 0],
    );
    expect(worldPosition.x).toBeCloseTo(1, 6);
    expect(worldPosition.y).toBeCloseTo(2.5, 6);
    expect(worldPosition.z).toBeCloseTo(3, 6);
  });

  it('non-zero tilt: slot-local +Y maps to (cos(tilt), -sin(tilt)) in plinth-local YZ', () => {
    // Slot-local +Y = up-the-tilted-face toward the back of the
    // working surface. Surface tilts back-edge up and away from
    // user, so slot +Y maps to (+Y cos(tilt), −Z sin(tilt)) in
    // plinth-local frame.
    const tilt = (20 * Math.PI) / 180;
    const { worldPosition } = computePlinthSlotTransform(
      [0, 0, 0],
      tilt,
      0,
      [0, 1, 0],
    );
    expect(worldPosition.x).toBeCloseTo(0, 6);
    expect(worldPosition.y).toBeCloseTo(Math.cos(tilt), 6);
    expect(worldPosition.z).toBeCloseTo(-Math.sin(tilt), 6);
  });

  it('non-zero tilt: slot-local +Z maps to (sin(tilt), cos(tilt)) in plinth-local YZ', () => {
    // Slot-local +Z = surface normal pointing toward the user side
    // — after tilt, up-and-toward-user.
    const tilt = (20 * Math.PI) / 180;
    const { worldPosition } = computePlinthSlotTransform(
      [0, 0, 0],
      tilt,
      0,
      [0, 0, 1],
    );
    expect(worldPosition.x).toBeCloseTo(0, 6);
    expect(worldPosition.y).toBeCloseTo(Math.sin(tilt), 6);
    expect(worldPosition.z).toBeCloseTo(Math.cos(tilt), 6);
  });

  it('non-zero anchor + non-zero tilt + non-zero height composes left → right', () => {
    const tilt = (20 * Math.PI) / 180;
    const { worldPosition } = computePlinthSlotTransform(
      [1, 0, -0.7],
      tilt,
      0.95,
      [0.1, 0.3, 0],
    );
    // Expected: anchor (1, 0, -0.7) + height-translation (0, 0.95, 0)
    // + rotated localXYZ where (0.1, 0.3, 0) → (0.1, 0.3 cos(tilt),
    // -0.3 sin(tilt)).
    expect(worldPosition.x).toBeCloseTo(1 + 0.1, 6);
    expect(worldPosition.y).toBeCloseTo(0 + 0.95 + 0.3 * Math.cos(tilt), 6);
    expect(worldPosition.z).toBeCloseTo(-0.7 + 0 - 0.3 * Math.sin(tilt), 6);
  });

  describe('orientation modes', () => {
    it("'surface' (default) returns the surface-tilt rotation", () => {
      const tilt = (20 * Math.PI) / 180;
      const { worldRotation } = computePlinthSlotTransform(
        [0, 0, 0],
        tilt,
        0,
        [0, 0, 0],
      );
      const expected = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -tilt,
      );
      // Quaternion comparison: equality up to sign.
      const dot =
        worldRotation.x * expected.x +
        worldRotation.y * expected.y +
        worldRotation.z * expected.z +
        worldRotation.w * expected.w;
      expect(Math.abs(dot)).toBeCloseTo(1, 6);
    });

    it("'world' returns the identity quaternion regardless of tilt", () => {
      const tilt = (20 * Math.PI) / 180;
      const { worldRotation } = computePlinthSlotTransform(
        [0, 0, 0],
        tilt,
        0,
        [0, 0, 0],
        'world',
      );
      expect(worldRotation.x).toBeCloseTo(0, 6);
      expect(worldRotation.y).toBeCloseTo(0, 6);
      expect(worldRotation.z).toBeCloseTo(0, 6);
      expect(worldRotation.w).toBeCloseTo(1, 6);
    });

    it("'custom' throws when localRotation is undefined", () => {
      expect(() =>
        computePlinthSlotTransform([0, 0, 0], 0, 0, [0, 0, 0], 'custom'),
      ).toThrow(/orientation 'custom' requires localRotation/);
    });

    it("'custom' composes localRotation onto the surface-tilt base", () => {
      const tilt = (20 * Math.PI) / 180;
      const localRoll = (10 * Math.PI) / 180;
      const localRotation = new THREE.Euler(0, 0, localRoll);
      const { worldRotation } = computePlinthSlotTransform(
        [0, 0, 0],
        tilt,
        0,
        [0, 0, 0],
        'custom',
        localRotation,
      );
      const base = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -tilt,
      );
      const local = new THREE.Quaternion().setFromEuler(localRotation);
      const expected = base.clone().multiply(local);
      const dot =
        worldRotation.x * expected.x +
        worldRotation.y * expected.y +
        worldRotation.z * expected.z +
        worldRotation.w * expected.w;
      expect(Math.abs(dot)).toBeCloseTo(1, 6);
    });
  });
});

describe('createPlinth (#225 / E1.4 — mesh + slot reparenting)', () => {
  it('plinth.group contains body + slot-frame (with slab) + each slot target', () => {
    const slotA = makeTarget();
    const slotB = makeTarget();
    const handles = createPlinth({
      anchorWorldXYZ: [0, 0, -0.7],
      slots: [
        { id: 'a', target: slotA, localXYZ: [0, 0.2, 0] },
        { id: 'b', target: slotB, localXYZ: [0, 0.3, 0] },
      ],
    });
    // 1 body + 1 slot-frame group (carries the slab) + N slot targets.
    expect(handles.group.children.length).toBe(2 + 2);
    expect(slotA.parent).toBe(handles.group);
    expect(slotB.parent).toBe(handles.group);
    handles.dispose();
  });

  it('writes plinth-local target.position so world position composes correctly', () => {
    const slot = makeTarget();
    const handles = createPlinth({
      anchorWorldXYZ: [0, 0, -0.7],
      tilt: 0,
      workingSurfaceHeightFromFloor: 0.95,
      slots: [{ id: 'a', target: slot, localXYZ: [0, 0, 0] }],
    });
    // Plinth.group itself is at (0, 0, -0.7) in its parent's frame.
    // Slot target at slot-local origin → plinth-local (0, 0.95, 0).
    expect(slot.position.x).toBeCloseTo(0, 6);
    expect(slot.position.y).toBeCloseTo(0.95, 6);
    expect(slot.position.z).toBeCloseTo(0, 6);
    handles.dispose();
  });

  it('throws on duplicate slot id', () => {
    const slotA = makeTarget();
    const slotB = makeTarget();
    expect(() =>
      createPlinth({
        anchorWorldXYZ: [0, 0, 0],
        slots: [
          { id: 'a', target: slotA, localXYZ: [0, 0, 0] },
          { id: 'a', target: slotB, localXYZ: [0, 0.1, 0] },
        ],
      }),
    ).toThrow(/duplicate slot id 'a'/);
  });

  it('throws on double-parenting (target already has a parent)', () => {
    const parent = new THREE.Group();
    const slot = makeTarget();
    parent.add(slot);
    expect(() =>
      createPlinth({
        anchorWorldXYZ: [0, 0, 0],
        slots: [{ id: 'a', target: slot, localXYZ: [0, 0, 0] }],
      }),
    ).toThrow(/already has a parent/);
  });

  it('reparented slot under non-identity ancestor composes correct world position', () => {
    // The "non-identity parent" test: createPlinth attached to a
    // parent whose world transform is non-trivial should still
    // produce a slot world position that picks up the parent's
    // transform via Three.js's matrix composition.
    const ctxGroup = new THREE.Group();
    ctxGroup.position.set(10, 20, 30);
    ctxGroup.updateMatrixWorld(true);
    const slot = makeTarget();
    const handles = createPlinth({
      anchorWorldXYZ: [0, 0, 0],
      tilt: 0,
      workingSurfaceHeightFromFloor: 1.0,
      slots: [{ id: 'a', target: slot, localXYZ: [0.5, 0.5, 0] }],
    });
    ctxGroup.add(handles.group);
    ctxGroup.updateMatrixWorld(true);

    const worldPos = new THREE.Vector3();
    slot.getWorldPosition(worldPos);
    // Expected: ctxGroup translation + plinth anchor (zero) + slot
    // height + localXYZ rotated by tilt=0 (identity).
    expect(worldPos.x).toBeCloseTo(10 + 0.5, 6);
    expect(worldPos.y).toBeCloseTo(20 + 1.0 + 0.5, 6);
    expect(worldPos.z).toBeCloseTo(30 + 0, 6);
    handles.dispose();
  });

  it('applies working-surface dimension defaults when omitted', () => {
    const handles = createPlinth({
      anchorWorldXYZ: [0, 0, 0],
      slots: [],
    });
    expect(handles.workingSurfaceWidth).toBeCloseTo(
      PLINTH_WORKING_WIDTH_DEFAULT,
      6,
    );
    expect(handles.workingSurfaceHeight).toBeCloseTo(
      PLINTH_WORKING_HEIGHT_DEFAULT,
      6,
    );
    handles.dispose();
  });

  it('honors explicit working-surface dimension overrides', () => {
    const handles = createPlinth({
      anchorWorldXYZ: [0, 0, 0],
      workingSurfaceWidth: 1.5,
      workingSurfaceHeight: 0.7,
      slots: [],
    });
    expect(handles.workingSurfaceWidth).toBeCloseTo(1.5, 6);
    expect(handles.workingSurfaceHeight).toBeCloseTo(0.7, 6);
    handles.dispose();
  });

  it('orientation: surface vs world produces visibly different target.quaternion', () => {
    const surfaceSlot = makeTarget();
    const worldSlot = makeTarget();
    const handles = createPlinth({
      anchorWorldXYZ: [0, 0, 0],
      tilt: PLINTH_TILT_DEFAULT,
      workingSurfaceHeightFromFloor: PLINTH_WORKING_HEIGHT_FROM_FLOOR_DEFAULT,
      slots: [
        { id: 'surface', target: surfaceSlot, localXYZ: [0, 0, 0] },
        {
          id: 'world',
          target: worldSlot,
          localXYZ: [0, 0, 0],
          orientation: 'world',
        },
      ],
    });
    // Surface target picks up the tilt rotation about world +X by
    // -tilt; world target is identity.
    expect(Math.abs(surfaceSlot.quaternion.x)).toBeGreaterThan(0);
    expect(worldSlot.quaternion.x).toBeCloseTo(0, 6);
    expect(worldSlot.quaternion.y).toBeCloseTo(0, 6);
    expect(worldSlot.quaternion.z).toBeCloseTo(0, 6);
    expect(worldSlot.quaternion.w).toBeCloseTo(1, 6);
    handles.dispose();
  });

  describe('dispose() — idempotent + leak-free', () => {
    it('disposes geometry + material exactly once across repeated calls', () => {
      const handles = createPlinth({
        anchorWorldXYZ: [0, 0, 0],
        slots: [],
      });
      // Capture the body's geometry and material before disposal.
      const meshes: THREE.Mesh[] = [];
      handles.group.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes.push(o);
      });
      expect(meshes.length).toBeGreaterThan(0);
      const geoSpies = meshes.map((m) => vi.spyOn(m.geometry, 'dispose'));
      // All mesh.material refs alias the single shared material; spy
      // on the first.
      const material = meshes[0].material as THREE.Material;
      const matSpy = vi.spyOn(material, 'dispose');

      handles.dispose();
      handles.dispose();
      handles.dispose();

      for (const s of geoSpies) {
        expect(s).toHaveBeenCalledTimes(1);
      }
      expect(matSpy).toHaveBeenCalledTimes(1);
    });
  });
});
