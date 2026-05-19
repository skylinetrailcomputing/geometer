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
} from '../../../src/scaffold/staging/Environment.ts';

function collectMeshes(g: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

describe('createEnvironment (#224 / E1.3)', () => {
  describe("mode: 'dome' (default)", () => {
    it('produces a linear THREE.Fog, no solid background, a dome mesh', () => {
      const env = createEnvironment();
      expect(env.fog).toBeInstanceOf(THREE.Fog);
      expect(env.background).toBeNull();
      const meshes = collectMeshes(env.group);
      expect(meshes.length).toBe(1); // dome only, richness default false
      env.dispose();
    });

    it('dome material/render-state is the deterministic backdrop config', () => {
      const env = createEnvironment();
      const dome = collectMeshes(env.group)[0];
      const mat = dome.material as THREE.MeshBasicMaterial;
      expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(mat.side).toBe(THREE.BackSide);
      expect(mat.fog).toBe(false); // dome is the fog backdrop, not fogged
      expect(mat.depthWrite).toBe(false);
      expect(mat.depthTest).toBe(false);
      expect(dome.renderOrder).toBe(ENVIRONMENT_DOME_RENDER_ORDER);
      expect(dome.renderOrder).toBe(-1);
      env.dispose();
    });
  });

  describe("mode: 'flat' degrade tier", () => {
    it('has no dome mesh, no fog, and a tuned solid background', () => {
      const env = createEnvironment({ mode: 'flat' });
      expect(env.fog).toBeNull();
      expect(env.background).toBeInstanceOf(THREE.Color);
      expect(collectMeshes(env.group).length).toBe(0);
      env.dispose();
    });
  });

  describe('richness severance (default false)', () => {
    it('richness:true adds meshes; the dome is present in both', () => {
      const core = createEnvironment({ richness: false });
      const rich = createEnvironment({ richness: true });
      const coreMeshes = collectMeshes(core.group);
      const richMeshes = collectMeshes(rich.group);
      expect(coreMeshes.length).toBe(1); // dome only
      expect(richMeshes.length).toBeGreaterThan(coreMeshes.length);
      // Dome geometry identical (same radius) in both.
      const coreDome = coreMeshes[0].geometry as THREE.SphereGeometry;
      const richDome = richMeshes[0].geometry as THREE.SphereGeometry;
      expect(richDome.parameters.radius).toBe(coreDome.parameters.radius);
      core.dispose();
      rich.dispose();
    });
  });

  describe('linear-fog + dome geometric invariants', () => {
    it('default fog/radius satisfy the §2.2 invariant chain', () => {
      const env = createEnvironment();
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

  describe('construction-time invariant rejection', () => {
    it('rejects fogNear below the stage-reach minimum', () => {
      expect(() => createEnvironment({ fogNear: 5 })).toThrow(/invariant/);
    });
    it('rejects fogNear >= fogFar', () => {
      expect(() =>
        createEnvironment({ fogNear: 30, fogFar: 20 }),
      ).toThrow(/invariant/);
    });
    it('rejects fogFar exceeding radius', () => {
      expect(() =>
        createEnvironment({ radius: 40, fogFar: 50 }),
      ).toThrow(/invariant/);
    });
    it('rejects a radius the camera could exit (black-void guard)', () => {
      expect(() => createEnvironment({ radius: 15 })).toThrow(/invariant/);
    });
    it('rejects a radius that would clip the camera far plane', () => {
      expect(() => createEnvironment({ radius: 120 })).toThrow(/invariant/);
    });
    it("does NOT gate 'flat' mode on dome invariants", () => {
      // 'flat' has no dome/fog, so the dome invariants must not fire.
      expect(() =>
        createEnvironment({ mode: 'flat', radius: 1 }),
      ).not.toThrow();
    });
  });

  // v1.0-INTENTIONAL canary guarding the #215/#216 token calibration
  // (plan §2.3). NOT a forward-compatible invariant — if a later epic
  // deliberately brightens the environment, DELETE this test as part
  // of that epic's token re-tune; do NOT silently loosen it.
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
      const env = createEnvironment({ richness: true });
      const meshes = collectMeshes(env.group);
      const dome = meshes[0];
      expect((dome.material as THREE.MeshBasicMaterial).fog).toBe(false);
      for (let i = 1; i < meshes.length; i++) {
        expect((meshes[i].material as THREE.MeshBasicMaterial).fog).toBe(true);
      }
      env.dispose();
    });
  });

  describe('dispose() — idempotent + leak-free', () => {
    // Three.js dispatches a 'dispose' event on geometries, materials,
    // and textures; spying it verifies dispose ran without poking
    // internal state (same pattern as StageFloor.test.ts).
    it('disposes dome geometry, material, and gradient texture once', () => {
      const env = createEnvironment();
      const dome = collectMeshes(env.group)[0];
      const geomSpy = vi.fn();
      const matSpy = vi.fn();
      const texSpy = vi.fn();
      dome.geometry.addEventListener('dispose', geomSpy);
      (dome.material as THREE.Material).addEventListener('dispose', matSpy);
      const tex = (dome.material as THREE.MeshBasicMaterial).map!;
      tex.addEventListener('dispose', texSpy);

      env.dispose();
      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
      expect(texSpy).toHaveBeenCalledTimes(1);

      env.dispose(); // idempotent
      expect(geomSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
      expect(texSpy).toHaveBeenCalledTimes(1);
    });

    it('disposes richness geometries + materials too', () => {
      const env = createEnvironment({ richness: true });
      const meshes = collectMeshes(env.group);
      const spies = meshes.flatMap((m) => {
        const gs = vi.fn();
        const ms = vi.fn();
        m.geometry.addEventListener('dispose', gs);
        (m.material as THREE.Material).addEventListener('dispose', ms);
        return [gs, ms];
      });
      env.dispose();
      for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
      env.dispose();
      for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    });

    it("'flat' mode dispose is idempotent and safe", () => {
      const env = createEnvironment({ mode: 'flat' });
      expect(() => {
        env.dispose();
        env.dispose();
      }).not.toThrow();
    });
  });
});
