import * as THREE from 'three';
import type { Exhibit, ExhibitContext } from '../../shell/Exhibit';
import { registerExhibit } from '../../shell/registry';

let cube: THREE.Mesh | undefined;

const helloExhibit: Exhibit = {
  id: 'hello',
  title: 'Hello — toolchain smoke test',

  mount({ scene }: ExhibitContext) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x222244 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x66ccff }),
    );
    cube.position.set(0, 1.6, -1);
    scene.add(cube);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 5, 5);
    scene.add(directional);
  },

  update() {
    if (cube) {
      cube.rotation.x += 0.005;
      cube.rotation.y += 0.005;
    }
  },
};

registerExhibit(helloExhibit);

export default helloExhibit;
