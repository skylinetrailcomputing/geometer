import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// `troika-three-text` reaches for `self`, a browser-only global, in its
// UMD `now$1` helper. The default vitest environment is Node, so any
// `new Text()` blows up at module load. The four readout subclasses
// instantiate Text in their ctors (and at module-level field
// initializers), so importing them — even just to inspect their
// `.prototype` — triggers the stub. Pattern reused from TapButton.test.ts.
vi.mock('troika-three-text', () => {
  class StubText extends THREE.Object3D {
    text = '';
    fontSize = 0;
    color = 0xffffff;
    anchorX: string | undefined;
    anchorY: string | undefined;
    outlineWidth: string | undefined;
    outlineColor: number | undefined;
    sync(): void {}
    dispose(): void {}
  }
  return { Text: StubText };
});

import {
  PanelReadout,
  type PanelReadoutPanelDimensions,
} from '@/scaffold/ui/PanelReadout';
import {
  READOUT_FONT_SIZE,
  READOUT_PANEL_COLOR_RGB,
  READOUT_PANEL_DEPTH,
} from '@/scaffold/ui/readoutTokens';
import { EquationReadout } from '@/exhibits/quadrics/EquationReadout';
import { TangentPlaneReadout } from '@/exhibits/tangent-planes/TangentPlaneReadout';
import { GradientLevelsReadout } from '@/exhibits/gradient-levels/GradientLevelsReadout';
import { SaddleExtremaReadout } from '@/exhibits/saddle-extrema/SaddleExtremaReadout';
import {
  READOUT_PANEL_HALF_WIDTH_EQUATION,
  READOUT_PANEL_HALF_HEIGHT_EQUATION,
} from '@/exhibits/quadrics/EquationReadout';
import {
  READOUT_PANEL_HALF_WIDTH_TANGENT_PLANE,
  READOUT_PANEL_HALF_HEIGHT_TANGENT_PLANE,
} from '@/exhibits/tangent-planes/TangentPlaneReadout';
import {
  READOUT_PANEL_HALF_WIDTH_GRADIENT_LEVELS,
  READOUT_PANEL_HALF_HEIGHT_GRADIENT_LEVELS,
} from '@/exhibits/gradient-levels/GradientLevelsReadout';
import {
  READOUT_PANEL_HALF_WIDTH_SADDLE_EXTREMA,
  READOUT_PANEL_HALF_HEIGHT_SADDLE_EXTREMA,
} from '@/exhibits/saddle-extrema/SaddleExtremaReadout';

// Test harness: PanelReadout's createPanel + disposePanel are protected;
// expose them via public wrappers so the test file can drive them. The
// wrapper-class pattern keeps the production base's invariant (only
// subclasses see the protected surface) while making the tests
// type-check (per roundtable GPT #5).
class TestReadout extends PanelReadout {
  constructor() {
    super('test-readout');
  }
  public makePanel(dims: PanelReadoutPanelDimensions): void {
    this.createPanel(dims);
  }
  public dropPanel(): void {
    this.disposePanel();
  }
  dispose(): void {
    this.disposePanel();
  }
}

describe('PanelReadout', () => {
  describe('createPanel', () => {
    it('adds a back-plate mesh with the documented defaults', () => {
      const r = new TestReadout();
      r.makePanel({ halfWidth: 0.1, halfHeight: 0.05 });
      expect(r.group.children.length).toBe(1);
      const child = r.group.children[0];
      expect(child).toBeInstanceOf(THREE.Mesh);
      const mesh = child as THREE.Mesh<
        THREE.BoxGeometry,
        THREE.MeshBasicMaterial
      >;
      expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
      expect(mesh.geometry.parameters.width).toBeCloseTo(0.2, 6);
      expect(mesh.geometry.parameters.height).toBeCloseTo(0.1, 6);
      expect(mesh.geometry.parameters.depth).toBeCloseTo(
        READOUT_PANEL_DEPTH,
        6,
      );
      expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      const expectedColor = new THREE.Color(...READOUT_PANEL_COLOR_RGB);
      expect(mesh.material.color.equals(expectedColor)).toBe(true);
      expect(mesh.renderOrder).toBe(-1);
      expect(mesh.position.x).toBeCloseTo(0, 6);
      expect(mesh.position.y).toBeCloseTo(0, 6);
      // Box center sits half-a-depth behind the requested front-face z
      // (default -0.001) so the screen surface stays where the old
      // PlaneGeometry quad lived; the depth extends away from the viewer.
      expect(mesh.position.z).toBeCloseTo(-0.001 - READOUT_PANEL_DEPTH / 2, 6);
    });

    it('honors center and localZ overrides', () => {
      const r = new TestReadout();
      r.makePanel({
        halfWidth: 0.1,
        halfHeight: 0.05,
        center: [0.03, -0.02],
        localZ: -0.005,
      });
      const mesh = r.group.children[0] as THREE.Mesh;
      expect(mesh.position.x).toBeCloseTo(0.03, 6);
      expect(mesh.position.y).toBeCloseTo(-0.02, 6);
      // localZ is the front-face z; box center sits depth/2 behind it.
      expect(mesh.position.z).toBeCloseTo(-0.005 - READOUT_PANEL_DEPTH / 2, 6);
    });

    it('throws on a second call (single-shot guard)', () => {
      const r = new TestReadout();
      r.makePanel({ halfWidth: 0.1, halfHeight: 0.05 });
      expect(() => r.makePanel({ halfWidth: 0.2, halfHeight: 0.1 })).toThrow(
        /already created/,
      );
    });
  });

  describe('faceCamera', () => {
    it('writes yaw-only rotation derived from camera world position', () => {
      const r = new TestReadout();
      r.group.position.set(0, 1, 0);
      r.group.updateMatrixWorld(true);
      const camera = new THREE.PerspectiveCamera();
      // dx = 1, dz = 1 → atan2 = π/4.
      camera.position.set(1, 1, 1);
      r.faceCamera(camera);
      expect(r.group.rotation.x).toBe(0);
      expect(r.group.rotation.z).toBe(0);
      expect(r.group.rotation.y).toBeCloseTo(Math.PI / 4, 6);

      // dx = -1, dz = 1 → atan2 = -π/4.
      camera.position.set(-1, 1, 1);
      r.faceCamera(camera);
      expect(r.group.rotation.y).toBeCloseTo(-Math.PI / 4, 6);
    });

    it('does not throw after disposePanel (defends a future null-check mistake)', () => {
      const r = new TestReadout();
      r.makePanel({ halfWidth: 0.1, halfHeight: 0.05 });
      r.dropPanel();
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(1, 1, 1);
      expect(() => r.faceCamera(camera)).not.toThrow();
    });
  });

  describe('disposePanel', () => {
    it('removes the mesh from the group and disposes GPU resources', () => {
      const r = new TestReadout();
      r.makePanel({ halfWidth: 0.1, halfHeight: 0.05 });
      const mesh = r.group.children[0] as THREE.Mesh<
        THREE.BoxGeometry,
        THREE.MeshBasicMaterial
      >;
      const geomSpy = vi.spyOn(mesh.geometry, 'dispose');
      const matSpy = vi.spyOn(mesh.material, 'dispose');
      r.dropPanel();
      expect(r.group.children.length).toBe(0);
      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);

      // Idempotent: second call is a no-op, no re-fire.
      expect(() => r.dropPanel()).not.toThrow();
      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
    });

    it('is a safe no-op when createPanel was never called', () => {
      const r = new TestReadout();
      // panel === null from construction; should not throw on either call.
      expect(() => r.dropPanel()).not.toThrow();
      expect(() => r.dropPanel()).not.toThrow();
      expect(r.group.children.length).toBe(0);
    });
  });

  describe('subclass faceCamera deletion (mixin lift enforcement)', () => {
    // Locks the four readout subclasses to inherit faceCamera from the
    // base; a future maintainer reintroducing a per-class faceCamera
    // override would silently defeat the lift. Tested via prototype
    // ownership rather than behavior so instance construction isn't
    // required (the readout ctors run troika Text init code; the stub
    // mock above keeps that safe but the prototype check is independent).
    it('EquationReadout does not own faceCamera', () => {
      expect(
        Object.prototype.hasOwnProperty.call(
          EquationReadout.prototype,
          'faceCamera',
        ),
      ).toBe(false);
    });
    it('TangentPlaneReadout does not own faceCamera', () => {
      expect(
        Object.prototype.hasOwnProperty.call(
          TangentPlaneReadout.prototype,
          'faceCamera',
        ),
      ).toBe(false);
    });
    it('GradientLevelsReadout does not own faceCamera', () => {
      expect(
        Object.prototype.hasOwnProperty.call(
          GradientLevelsReadout.prototype,
          'faceCamera',
        ),
      ).toBe(false);
    });
    it('SaddleExtremaReadout does not own faceCamera', () => {
      expect(
        Object.prototype.hasOwnProperty.call(
          SaddleExtremaReadout.prototype,
          'faceCamera',
        ),
      ).toBe(false);
    });
  });

  describe('worst-case-string envelope assertions', () => {
    // Static safety net per plan §3.3: each readout's hard-coded panel
    // half-width must be ≥ the worst-case em-derived width of its own
    // widest line. If a formatter or layout changes, this fires and
    // someone recomputes the constant.

    it('EquationReadout panel half-width covers worst bottom-line content', () => {
      // Bottom line all-non-d-visible: 4 numerics + 3 separators.
      // NUMERIC_SLOT_EM = 2.6, SEPARATOR_SLOT_EM = 2.4.
      const worstEm = 4 * 2.6 + 3 * 2.4; // = 17.6
      const worstMeters = worstEm * READOUT_FONT_SIZE;
      expect(READOUT_PANEL_HALF_WIDTH_EQUATION * 2).toBeGreaterThanOrEqual(
        worstMeters,
      );
      // Sanity: half-height covers the 2-line vertical extent.
      expect(READOUT_PANEL_HALF_HEIGHT_EQUATION).toBeGreaterThan(0);
    });

    it('TangentPlaneReadout panel half-width covers worst top-line content', () => {
      // Top line: [n_x] " (x " [x₀] ") + " [n_y] " (y " [y₀] ") + " [n_z] " (z " [z₀] ") = 0"
      // NUMERIC_SLOT_EM=2.6, OPEN_PAREN_EM=1.8, CLOSE_PAREN_OP_EM=1.6,
      // CLOSE_PAREN_EQ_EM=1.9.
      const worstEm = 6 * 2.6 + 3 * 1.8 + 2 * 1.6 + 1.9; // = 26.1
      const worstMeters = worstEm * READOUT_FONT_SIZE;
      expect(
        READOUT_PANEL_HALF_WIDTH_TANGENT_PLANE * 2,
      ).toBeGreaterThanOrEqual(worstMeters);
      expect(READOUT_PANEL_HALF_HEIGHT_TANGENT_PLANE).toBeGreaterThan(0);
    });

    it('GradientLevelsReadout panel half-width covers worst top-line content', () => {
      // Top: `∇f = ( ±n.nn , ±n.nn , ±n.nn )`
      // PREFIX_GRAD_EM=2.8, NUMERIC_SIGNED_EM=2.6, COMMA_EM=1.0,
      // CLOSE_PAREN_EM=1.0.
      const worstEm = 2.8 + 3 * 2.6 + 2 * 1.0 + 1.0; // = 13.6
      const worstMeters = worstEm * READOUT_FONT_SIZE;
      expect(
        READOUT_PANEL_HALF_WIDTH_GRADIENT_LEVELS * 2,
      ).toBeGreaterThanOrEqual(worstMeters);
      expect(READOUT_PANEL_HALF_HEIGHT_GRADIENT_LEVELS).toBeGreaterThan(0);
    });

    it('SaddleExtremaReadout panel half-width covers worst top-line content', () => {
      // Top: `f_xx = [n_xx]   f_xy = [n_xy]   f_yy = [n_yy]`
      // PREFIX_ENTRY_EM=3.5, NUMERIC_ENTRY_EM=3.2, TOP_ENTRY_GAP_EM=1.2.
      const worstEm = 3 * 3.5 + 3 * 3.2 + 2 * 1.2; // = 22.5
      const worstMeters = worstEm * READOUT_FONT_SIZE;
      expect(
        READOUT_PANEL_HALF_WIDTH_SADDLE_EXTREMA * 2,
      ).toBeGreaterThanOrEqual(worstMeters);
      expect(READOUT_PANEL_HALF_HEIGHT_SADDLE_EXTREMA).toBeGreaterThan(0);
    });
  });
});
