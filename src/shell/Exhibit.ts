import * as THREE from 'three';

export interface ExhibitContext {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
}

export interface ExhibitFrame {
  delta: number;
}

export interface Exhibit {
  id: string;
  title: string;
  mount(ctx: ExhibitContext): void;
  update(frame: ExhibitFrame): void;
  unmount?(ctx: ExhibitContext): void;
}
