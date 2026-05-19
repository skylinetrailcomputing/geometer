import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createEnvironment,
  buildGradientStops,
  ENVIRONMENT_RADIUS_DEFAULT,
  ENVIRONMENT_FOG_NEAR_MIN,
  ENVIRONMENT_MAX_CAMERA_REACH,
  ENVIRONMENT_RADIUS_MARGIN,
  ENVIRONMENT_CAMERA_FAR,
  ENVIRONMENT_DOME_RENDER_ORDER,
  ENVIRONMENT_FLAT_BG_RGB,
  ENVIRONMENT_CONTRAST_BOX_HALF_EXTENT,
} from '../../../src/scaffold/staging/Environment.ts';

function collectMeshes(g: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}
const boxFaces = (m: THREE.Mesh[]): THREE.Mesh[] =>
  m.filter((x) => x.name === 'contrast-box-face');
const nonBox = (m: THREE.Mesh[]): THREE.Mesh[] =>
  m.filter((x) => x.name !== 'contrast-box-face');

describe('createEnvironment (#224 / E1.3)', () => {
  describe("mode: 'flat' (DEFAULT, post-#245 smoke)", () => {
    it('default is flat: no fog, solid bg, only the contrast box', () => {
      const env = createEnvironment();
      expect(env.fog).toBeNull();
      expect(env.background).toBeInstanceOf(THREE.Color);
      const meshes = collectMeshes(env.group);
      expect(nonBox(meshes).length).toBe(0); // no dome in flat
      expect(boxFaces(meshes).length).toBe(5); // box default ON
      env.dispose();
    });

    it('flat bg is the tuned tone within the darkness binary-search bounds', () => {
      const env = createEnvironment();
      const bg = env.background as THREE.Color;
      expect(bg.getHex()).toBe(
        new THREE.Color(...ENVIRONMENT_FLAT_BG_RGB).getHex(),
      );
      // Search converges between black and the round-1 upper bound
      // (0x1a1a2e, judged too light). Stay inside [black, upper],
      // off-black (not pure black), cool (B ≥ R).
      const UPPER = [0x1a / 255, 0x1a / 255, 0x2e / 255];
      const sum = (c: readonly number[]): number => c[0] + c[1] + c[2];
      for (let c = 0; c < 3; c++) {
        expect(ENVIRONMENT_FLAT_BG_RGB[c]).toBeGreaterThanOrEqual(0);
        expect(ENVIRONMENT_FLAT_BG_RGB[c]).toBeLessThanOrEqual(UPPER[c]);
      }
      expect(sum(ENVIRONMENT_FLAT_BG_RGB)).toBeGreaterThan(0);
      expect(sum(ENVIRONMENT_FLAT_BG_RGB)).toBeLessThan(sum(UPPER));
      expect(ENVIRONMENT_FLAT_BG_RGB[2]).toBeGreaterThanOrEqual(
        ENVIRONMENT_FLAT_BG_RGB[0],
      );
      env.dispose();
    });

    it('does NOT gate flat mode on the dome invariants', () => {
      expect(() =>
        createEnvironment({ mode: 'flat', radius: 1, fogNear: 1 }),
      ).not.toThrow();
    });
  });

  describe('vantablack contrast box (#245 smoke; default ON)', () => {
    it('is present in BOTH flat and dome modes', () => {
      const flat = createEnvironment();
      const dome = createEnvironment({ mode: 'dome' });
      expect(boxFaces(collectMeshes(flat.group)).length).toBe(5);
      expect(boxFaces(collectMeshes(dome.group)).length).toBe(5);
      flat.dispose();
      dome.dispose();
    });

    it('contrastBox:false removes it', () => {
      const env = createEnvironment({ contrastBox: false });
      expect(boxFaces(collectMeshes(env.group)).length).toBe(0);
      env.dispose();
    });

    it('all 5 faces share ONE geometry + ONE material; pure-black, fog:false, DoubleSide', () => {
      const env = createEnvironment();
      const faces = boxFaces(collectMeshes(env.group));
      expect(faces.length).toBe(5);
      const g0 = faces[0].geometry;
      const m0 = faces[0].material as THREE.MeshBasicMaterial;
      for (const f of faces) {
        expect(f.geometry).toBe(g0); // shared geometry instance
        expect(f.material).toBe(m0); // shared material instance
      }
      expect(m0).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(m0.color.getHex()).toBe(0x000000);
      expect(m0.fog).toBe(false);
      expect(m0.side).toBe(THREE.DoubleSide);
      env.dispose();
    });

    it('omits the +Z (viewer) face and seats the others at ±half-extent', () => {
      const env = createEnvironment();
      const faces = boxFaces(collectMeshes(env.group));
      const c = new THREE.Vector3(0, 1.5, -4); // CONTRAST_BOX_CENTER
      const h = ENVIRONMENT_CONTRAST_BOX_HALF_EXTENT;
      // No face sits on the +Z (open / viewer) side.
      for (const f of faces) {
        expect(f.position.z).toBeLessThanOrEqual(c.z + 1e-6);
      }
      // The back wall is exactly one half-extent behind centre.
      expect(faces.some((f) => Math.abs(f.position.z - (c.z - h)) < 1e-6)).toBe(
        true,
      );
      // Top + bottom one half-extent above/below centre.
      expect(faces.some((f) => Math.abs(f.position.y - (c.y + h)) < 1e-6)).toBe(
        true,
      );
      expect(faces.some((f) => Math.abs(f.position.y - (c.y - h)) < 1e-6)).toBe(
        true,
      );
      env.dispose();
    });
  });

  describe("mode: 'dome' (opt-in; future richer pass)", () => {
    it('produces a linear THREE.Fog, no solid background, a dome mesh', () => {
      const env = createEnvironment({ mode: 'dome', contrastBox: false });
      expect(env.fog).toBeInstanceOf(THREE.Fog);
      expect(env.background).toBeNull();
      expect(collectMeshes(env.group).length).toBe(1); // dome only
      env.dispose();
    });

    it('dome material/render-state is the deterministic backdrop config', () => {
      const env = createEnvironment({ mode: 'dome', contrastBox: false });
      const dome = collectMeshes(env.group)[0];
      const mat = dome.material as THREE.MeshBasicMaterial;
      expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(mat.side).toBe(THREE.BackSide);
      expect(mat.fog).toBe(false);
      expect(mat.depthWrite).toBe(false);
      expect(mat.depthTest).toBe(false);
      expect(dome.renderOrder).toBe(ENVIRONMENT_DOME_RENDER_ORDER);
      expect(dome.renderOrder).toBe(-1);
      env.dispose();
    });
  });

  describe('richness severance (dome path; default false)', () => {
    it('richness:true adds meshes; the dome is present in both', () => {
      const core = createEnvironment({
        mode: 'dome',
        richness: false,
        contrastBox: false,
      });
      const rich = createEnvironment({
        mode: 'dome',
        richness: true,
        contrastBox: false,
      });
      const coreMeshes = collectMeshes(core.group);
      const richMeshes = collectMeshes(rich.group);
      expect(coreMeshes.length).toBe(1);
      expect(richMeshes.length).toBeGreaterThan(coreMeshes.length);
      const coreDome = coreMeshes[0].geometry as THREE.SphereGeometry;
      const richDome = richMeshes[0].geometry as THREE.SphereGeometry;
      expect(richDome.parameters.radius).toBe(coreDome.parameters.radius);
      core.dispose();
      rich.dispose();
    });
  });

  describe('linear-fog + dome geometric invariants', () => {
    it('default fog/radius satisfy the §2.2 invariant chain', () => {
      const env = createEnvironment({ mode: 'dome', contrastBox: false });
      const fog = env.fog as THREE.Fog;
      expect(fog).toBeInstanceOf(THREE.Fog);
      expect(fog.near).toBeGreaterThanOrEqual(ENVIRONMENT_FOG_NEAR_MIN);
      expect(fog.near).toBeLessThan(fog.far);
      expect(fog.far).toBeLessThanOrEqual(ENVIRONMENT_RADIUS_DEFAULT);
      expect(ENVIRONMENT_RADIUS_DEFAULT).toBeLessThan(ENVIRONMENT_CAMERA_FAR);
      expect(ENVIRONMENT_RADIUS_DEFAULT).toBeGreaterThanOrEqual(
        ENVIRONMENT_MAX_CAMERA_REACH + ENVIRONMENT_RADIUS_MARGIN,
      );
      env.dispose();
    });
  });

  describe('construction-time invariant rejection (dome path)', () => {
    it('rejects fogNear below the stage-reach minimum', () => {
      expect(() =>
        createEnvironment({ mode: 'dome', fogNear: 5, contrastBox: false }),
      ).toThrow(/invariant/);
    });
    it('rejects fogNear >= fogFar', () => {
      expect(() =>
        createEnvironment({
          mode: 'dome',
          fogNear: 30,
          fogFar: 20,
          contrastBox: false,
        }),
      ).toThrow(/invariant/);
    });
    it('rejects fogFar exceeding radius', () => {
      expect(() =>
        createEnvironment({
          mode: 'dome',
          radius: 40,
          fogFar: 50,
          contrastBox: false,
        }),
      ).toThrow(/invariant/);
    });
    it('rejects a radius the camera could exit (black-void guard)', () => {
      expect(() =>
        createEnvironment({ mode: 'dome', radius: 15, contrastBox: false }),
      ).toThrow(/invariant/);
    });
    it('rejects a radius that would clip the camera far plane', () => {
      expect(() =>
        createEnvironment({ mode: 'dome', radius: 120, contrastBox: false }),
      ).toThrow(/invariant/);
    });
  });

  // v1.0-INTENTIONAL canary guarding the #215/#216 token calibration
  // (plan §2.3). NOT a forward-compatible invariant — if a later
  // epic deliberately brightens the gradient, DELETE this test as
  // part of that re-tune; do NOT silently loosen it.
  describe('gradient horizon-stop canary (v1.0-intentional)', () => {
    it('keeps the horizon stop within ±0x10/channel of 0x111122', () => {
      const { horizon } = buildGradientStops();
      const target = [0x11 / 255, 0x11 / 255, 0x22 / 255];
      const tol = 0x10 / 255;
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(horizon[c] - target[c])).toBeLessThanOrEqual(tol);
      }
    });
  });

  describe('env-owned material fog flags (§3.5 audit, env half)', () => {
    it('dome fog:false; richness detail meshes fog:true', () => {
      const env = createEnvironment({
        mode: 'dome',
        richness: true,
        contrastBox: false,
      });
      const meshes = collectMeshes(env.group);
      expect((meshes[0].material as THREE.MeshBasicMaterial).fog).toBe(false);
      for (let i = 1; i < meshes.length; i++) {
        expect((meshes[i].material as THREE.MeshBasicMaterial).fog).toBe(true);
      }
      env.dispose();
    });
  });

  describe('dispose() — idempotent + leak-free', () => {
    it('flat mode disposes the contrast box geo + mat exactly once', () => {
      const env = createEnvironment(); // flat, box on
      const faces = boxFaces(collectMeshes(env.group));
      const gSpy = vi.fn();
      const mSpy = vi.fn();
      faces[0].geometry.addEventListener('dispose', gSpy);
      (faces[0].material as THREE.Material).addEventListener('dispose', mSpy);
      env.dispose();
      expect(gSpy).toHaveBeenCalledTimes(1);
      expect(mSpy).toHaveBeenCalledTimes(1);
      env.dispose(); // idempotent
      expect(gSpy).toHaveBeenCalledTimes(1);
      expect(mSpy).toHaveBeenCalledTimes(1);
    });

    it('dome mode disposes dome geo, material, gradient texture once', () => {
      const env = createEnvironment({ mode: 'dome', contrastBox: false });
      const dome = collectMeshes(env.group)[0];
      const geomSpy = vi.fn();
      const matSpy = vi.fn();
      const texSpy = vi.fn();
      dome.geometry.addEventListener('dispose', geomSpy);
      (dome.material as THREE.Material).addEventListener('dispose', matSpy);
      (dome.material as THREE.MeshBasicMaterial).map!.addEventListener(
        'dispose',
        texSpy,
      );
      env.dispose();
      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
      expect(texSpy).toHaveBeenCalledTimes(1);
      env.dispose();
      expect(geomSpy).toHaveBeenCalledTimes(1);
    });

    it('dome+richness+box disposes everything once', () => {
      const env = createEnvironment({ mode: 'dome', richness: true });
      const meshes = collectMeshes(env.group);
      // Unique geometries/materials (box shares one of each).
      const geos = new Set(meshes.map((m) => m.geometry));
      const mats = new Set(meshes.map((m) => m.material as THREE.Material));
      const spies = [
        ...[...geos].map((g) => {
          const s = vi.fn();
          g.addEventListener('dispose', s);
          return s;
        }),
        ...[...mats].map((m) => {
          const s = vi.fn();
          m.addEventListener('dispose', s);
          return s;
        }),
      ];
      env.dispose();
      for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
      env.dispose();
      for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    });
  });
});
