import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import type { ExhibitContext } from './Exhibit';
import { firstExhibit } from './registry';

export function bootShell(): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.6, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const exhibit = firstExhibit();
  if (!exhibit) {
    console.warn('geometer: no exhibits registered; nothing to mount.');
    return;
  }

  const ctx: ExhibitContext = { scene, renderer, camera };
  exhibit.mount(ctx);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    exhibit.update({ delta });
    renderer.render(scene, camera);
  });
}
