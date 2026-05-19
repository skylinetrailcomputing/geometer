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

describe('createEnvironment (#224 / E1.3)', () => {
  describe("mode: 'flat' (DEFAULT, post-#245 smoke)", () => {
    it('default (no args) is flat: no fog, no meshes, a solid bg', () => {
      const env = createEnvironment();
      expect(env.fog).toBeNull();
      expect(env.background).toBeInstanceOf(THREE.Color);
      expect(collectMeshes(env.group).length).toBe(0);
      env.dispose();
    });

    it('flat bg is the tuned tone within the darkness binary-search bounds', () => {
      const env = createEnvironment();
      const bg = env.background as THREE.Color;
      const expected = new THREE.Color(...ENVIRONMENT_FLAT_BG_RGB);
      expect(bg.getHex()).toBe(expected.getHex());
      // The search converges between black and the round-1 upper
      // bound (0x1a1a2e, judged too light). Every channel must stay
      // inside [0x000000, 0x1a1a2e] and be a near-black cool tone
      // (B ≥ R ≈ G, no channel above the upper bound). Strictly
      // brighter than pure black so it's an off-black, not a void.
      const LOWER = [0, 0, 0]; // vantablack
      const UPPER = [0x1a / 255, 0x1a / 255, 0x2e / 255]; // round-1
      const sum = (c: readonly number[]): number => c[0] + c[1] + c[2];
      for (let c = 0; c < 3; c++) {
        expect(ENVIRONMENT_FLAT_BG_RGB[c]).toBeGreaterThanOrEqual(LOWER[c]);
        expect(ENVIRONMENT_FLAT_BG_RGB[c]).toBeLessThanOrEqual(UPPER[c]);
      }
      expect(sum(ENVIRONMENT_FLAT_BG_RGB)).toBeGreaterThan(0); // not pure black
      expect(sum(ENVIRONMENT_FLAT_BG_RGB)).toBeLessThan(sum(UPPER));
      // Cool near-black: blue ≥ red ≈ green (same family as the void).
      expect(ENVIRONMENT_FLAT_BG_RGB[2]).toBeGreaterThanOrEqual(
        ENVIRONMENT_FLAT_BG_RGB[0],
      );
      env.dispose();
    });

    it('does NOT gate flat mode on the dome invariants', () => {
      // flat has no dome/fog, so dome invariants must not fire.
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
      expect(() =>
        createEnvironment({ mode: 'dome', fogNear: 5 }),
      ).toThrow(/invariant/);
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
      expect(() =>
        createEnvironment({ mode: 'dome', radius: 15 }),
      ).toThrow(/invariant/);
    });
    it('rejects a radius that would clip the camera far plane', () => {
      expect(() =>
        createEnvironment({ mode: 'dome', radius: 120 }),
      ).toThrow(/invariant/);
    });
  });

  // v1.0-INTENTIONAL canary guarding the #215/#216 token calibration
  // (plan §2.3). Still relevant for the dome opt-in path. NOT a
  // forward-compatible invariant — if a later epic deliberately
  // brightens the gradient, DELETE this as part of that re-tune.
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
      const env = createEnvironment({ mode: 'dome' });
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
      const env = createEnvironment({ mode: 'dome', richness: true });
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

    it('flat-mode dispose is idempotent and safe', () => {
      const env = createEnvironment({ mode: 'flat' });
      expect(() => {
        env.dispose();
        env.dispose();
      }).not.toThrow();
    });
  });
});
