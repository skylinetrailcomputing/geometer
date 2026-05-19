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
} from '../../../src/scaffold/staging/Environment.ts';

function collectMeshes(g: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

describe('createEnvironment (#224 / E1.3) — backdrop only', () => {
  describe("mode: 'flat' (DEFAULT)", () => {
    it('default is flat: no fog, no meshes, a solid bg', () => {
      const env = createEnvironment();
      expect(env.fog).toBeNull();
      expect(env.background).toBeInstanceOf(THREE.Color);
      expect(collectMeshes(env.group).length).toBe(0);
      env.dispose();
    });

    it('flat bg is the tuned tone within the darkness binary-search bounds', () => {
      const env = createEnvironment();
      const bg = env.background as THREE.Color;
      expect(bg.getHex()).toBe(
        new THREE.Color(...ENVIRONMENT_FLAT_BG_RGB).getHex(),
      );
      // Converges between black and the round-1 upper bound
      // (0x1a1a2e, judged too light). Inside [black, upper],
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

  describe("mode: 'dome' (opt-in; future richer pass)", () => {
    it('produces a linear THREE.Fog, no solid background, a dome mesh', () => {
      const env = createEnvironment({ mode: 'dome' });
      expect(env.fog).toBeInstanceOf(THREE.Fog);
      expect(env.background).toBeNull();
      expect(collectMeshes(env.group).length).toBe(1); // dome only
      env.dispose();
    });

    it('dome material/render-state is the deterministic backdrop config', () => {
      const env = createEnvironment({ mode: 'dome' });
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
      const core = createEnvironment({ mode: 'dome', richness: false });
      const rich = createEnvironment({ mode: 'dome', richness: true });
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
      const env = createEnvironment({ mode: 'dome' });
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
      expect(() => createEnvironment({ mode: 'dome', fogNear: 5 })).toThrow(
        /invariant/,
      );
    });
    it('rejects fogNear >= fogFar', () => {
      expect(() =>
        createEnvironment({ mode: 'dome', fogNear: 30, fogFar: 20 }),
      ).toThrow(/invariant/);
    });
    it('rejects fogFar exceeding radius', () => {
      expect(() =>
        createEnvironment({ mode: 'dome', radius: 40, fogFar: 50 }),
      ).toThrow(/invariant/);
    });
    it('rejects a radius the camera could exit (black-void guard)', () => {
      expect(() => createEnvironment({ mode: 'dome', radius: 15 })).toThrow(
        /invariant/,
      );
    });
    it('rejects a radius that would clip the camera far plane', () => {
      expect(() => createEnvironment({ mode: 'dome', radius: 120 })).toThrow(
        /invariant/,
      );
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
      const env = createEnvironment({ mode: 'dome', richness: true });
      const meshes = collectMeshes(env.group);
      expect((meshes[0].material as THREE.MeshBasicMaterial).fog).toBe(false);
      for (let i = 1; i < meshes.length; i++) {
        expect((meshes[i].material as THREE.MeshBasicMaterial).fog).toBe(true);
      }
      env.dispose();
    });
  });

  describe('dispose() — idempotent + leak-free', () => {
    it('flat mode owns nothing GPU-side; dispose is a safe no-op', () => {
      const env = createEnvironment();
      expect(() => {
        env.dispose();
        env.dispose();
      }).not.toThrow();
    });

    it('dome mode disposes dome geo, material, gradient texture once', () => {
      const env = createEnvironment({ mode: 'dome' });
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

    it('dome+richness disposes every unique geo + mat once', () => {
      const env = createEnvironment({ mode: 'dome', richness: true });
      const meshes = collectMeshes(env.group);
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
