// Minimal ambient types for troika-three-text. The package ships no .d.ts;
// only the surface this codebase touches is declared here. Extend as needed.

declare module 'troika-three-text' {
  import { Mesh } from 'three';

  export class Text extends Mesh {
    text: string;
    fontSize: number;
    color: number | string | null;
    anchorX: number | string;
    anchorY: number | string;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    maxWidth: number;
    outlineWidth: number | string;
    outlineColor: number | string | null;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
