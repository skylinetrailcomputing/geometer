import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createReadoutPost } from '../../../src/scaffold/ui/ReadoutPost.ts';
import {
  READOUT_POST_LENGTH,
  READOUT_POST_RADIUS,
} from '../../../src/scaffold/ui/readoutTokens.ts';
import {
  createPlinth,
  PLINTH_TILT_DEFAULT,
} from '../../../src/scaffold/staging/Plinth.ts';

describe('createReadoutPost (#286 / two-slot post-mount primitive)', () => {
  it('returns a group with one cylinder mesh', () => {
    const post = createReadoutPost();
    expect(post.group).toBeInstanceOf(THREE.Group);
    expect(post.group.children).toHaveLength(1);
    const child = post.group.children[0];
    expect(child).toBeInstanceOf(THREE.Mesh);
    const mesh = child as THREE.Mesh;
    expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);
  });

  it('cylinder geometry has the expected radii + height matching tokens', () => {
    const post = createReadoutPost();
    const mesh = post.group.children[0] as THREE.Mesh<THREE.CylinderGeometry>;
    const params = mesh.geometry.parameters;
    expect(params.radiusTop).toBeCloseTo(READOUT_POST_RADIUS, 6);
    expect(params.radiusBottom).toBeCloseTo(READOUT_POST_RADIUS, 6);
    expect(params.height).toBeCloseTo(READOUT_POST_LENGTH, 6);
  });

  it("mesh rotation aligns cylinder height axis with local +Z (rotation.x = π/2)", () => {
    const post = createReadoutPost();
    const mesh = post.group.children[0] as THREE.Mesh;
    expect(mesh.rotation.x).toBeCloseTo(Math.PI / 2, 6);
    expect(mesh.rotation.y).toBeCloseTo(0, 6);
    expect(mesh.rotation.z).toBeCloseTo(0, 6);
  });

  it('mesh position centers cylinder from local (0,0,0) to (0,0,READOUT_POST_LENGTH)', () => {
    const post = createReadoutPost();
    const mesh = post.group.children[0] as THREE.Mesh;
    expect(mesh.position.x).toBeCloseTo(0, 6);
    expect(mesh.position.y).toBeCloseTo(0, 6);
    expect(mesh.position.z).toBeCloseTo(READOUT_POST_LENGTH / 2, 6);
  });

  it('dispose() is idempotent and releases GPU resources exactly once', () => {
    const post = createReadoutPost();
    const mesh = post.group.children[0] as THREE.Mesh;
    const geometry = mesh.geometry;
    const material = mesh.material as THREE.Material;
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    post.dispose();
    post.dispose(); // second call — no throw, no double-dispose

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("wiring: placed in a 'surface'-oriented plinth slot, post.group.quaternion equals R_x(-PLINTH_TILT_DEFAULT)", () => {
    // Second-Sonnet #2: make the "trivially correct by construction"
    // claim falsifiable here, rather than only via the existing
    // Plinth.test.ts 'surface'-orientation tests.
    const post = createReadoutPost();
    createPlinth({
      anchorWorldXYZ: [0, 0, 0],
      slots: [
        {
          id: 'p',
          target: post.group,
          localXYZ: [0, 0.5, 0],
          orientation: 'surface',
        },
      ],
    });
    const expected = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -PLINTH_TILT_DEFAULT,
    );
    // Quaternion.equals uses exact equality; compare component-wise
    // with tolerance for floating-point noise from the slot transform
    // composition.
    expect(post.group.quaternion.x).toBeCloseTo(expected.x, 6);
    expect(post.group.quaternion.y).toBeCloseTo(expected.y, 6);
    expect(post.group.quaternion.z).toBeCloseTo(expected.z, 6);
    expect(post.group.quaternion.w).toBeCloseTo(expected.w, 6);
  });
});
