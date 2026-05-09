import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { registerExhibit } from '../../shell/registry';

let cube: THREE.Mesh | undefined;
let floor: THREE.Mesh | undefined;

const helloExhibit: Exhibit = {
  id: 'hello',
  title: 'Hello — toolchain smoke test',

  // Hello is intentionally cluster-less (#150): it's a toolchain smoke
  // test, not a cluster member. The SceneRack filters it out; it remains
  // reachable via direct `import` in dev branches.

  mount({ group }: ExhibitContext) {
    floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x222244 }),
    );
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x66ccff }),
    );
    cube.position.set(0, 1.6, -1);
    group.add(cube);

    group.add(new THREE.AmbientLight(0xffffff, 0.4));
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 5, 5);
    group.add(directional);
  },

  update() {
    if (cube) {
      cube.rotation.x += 0.005;
      cube.rotation.y += 0.005;
    }
  },

  unmount() {
    // Lights have no GPU resources to dispose; they're removed when the
    // shell drops the per-exhibit group. Cube + floor allocate geometry
    // and material that need explicit dispose() to free the GPU buffers.
    if (cube) {
      cube.geometry.dispose();
      (cube.material as THREE.Material).dispose();
      cube = undefined;
    }
    if (floor) {
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      floor = undefined;
    }
  },

  onSelectStart() {
    // Hello has no interactive controls.
  },

  onSelectEnd() {
    // Hello has no interactive controls.
  },
};

registerExhibit(helloExhibit);

export default helloExhibit;
