import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createTaylorOverlay } from '@/exhibits/saddle-extrema/TaylorOverlay';
import { writeGraphPointToWorld } from '@/exhibits/saddle-extrema/GraphSurface';
import { PRESETS } from '@/exhibits/saddle-extrema/presets';

// Vitest coverage for the local-quadratic-approximation overlay (#180;
// epic #175 closer). Strategy mirrors GraphSurface.test.ts — pure
// helper-level coverage. The overlay is the §11.7–11.8 pedagogical
// punch line; its math correctness is what makes "the local quadratic
// IS the local shape at a critical point" a true claim. Tessellation
// + per-frame mutation contracts get pinned here.

const SURFACE_CENTER = new THREE.Vector3(0, 1.5, -4);
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.5).normalize();

// Saddle preset — third entry per `presets.ts`. Picked because:
// (a) Hessian has mixed signs (f_xx = 2, f_yy = -2), exercising
//     analytic-normal derivation across both sign regimes,
// (b) at (x0, y0) = (0, 0) the linear term vanishes and the overlay
//     is pure quadratic — the cleanest test of the q formula,
// (c) at (x0, y0) = (0.5, 0) the linear term is non-trivial.
const SADDLE_PRESET = PRESETS[2];

// Production resolution. Tests assert against the same RES the
// production overlay uses; smaller RES would mask the odd-grid
// center-vertex invariant that's the whole point of RES = 49.
const RES = 49;

// Half-extent for the saddle preset. The overlay's helper computes
// `halfExtent = 0.25 × min(xRange, yRange) / 2` — saddle's domain is
// [-1.5, 1.5]² (range 3.0 each side) ⇒ halfExtent = 0.375. Tests
// reproduce the formula independently as a check that the helper
// hasn't drifted.
const SADDLE_HALF_EXTENT = (0.25 * Math.min(3.0, 3.0)) / 2;

function makeOverlay(
  preset = SADDLE_PRESET,
): ReturnType<typeof createTaylorOverlay> {
  return createTaylorOverlay({
    preset,
    surfaceCenter: SURFACE_CENTER,
    lightDir: LIGHT_DIR,
  });
}

// Center index — for odd RES = 49, the middle is (RES - 1) / 2 = 24
// in both i and j; flat index = 24 * 49 + 24 = 1200.
const CENTER_I = (RES - 1) / 2;
const CENTER_J = (RES - 1) / 2;
const CENTER_FLAT = CENTER_J * RES + CENTER_I;

describe('createTaylorOverlay — odd-res center vertex parity', () => {
  it('places a vertex exactly at (u, v) = (0, 0)', () => {
    const { mesh, dispose } = makeOverlay();
    try {
      const aLocal = mesh.geometry.getAttribute('aLocal');
      // For RES = 49 with symmetric domain [-half, +half], the middle
      // index lands on (0, 0). If RES were even, this would fail.
      expect(aLocal.getX(CENTER_FLAT)).toBeCloseTo(0);
      expect(aLocal.getY(CENTER_FLAT)).toBeCloseTo(0);
    } finally {
      dispose();
    }
  });

  it('corner vertices sit at (±half, ±half)', () => {
    const { mesh, dispose } = makeOverlay();
    try {
      const aLocal = mesh.geometry.getAttribute('aLocal');
      // (i, j) = (0, 0) ⇒ flat 0; (RES-1, RES-1) ⇒ flat RES²-1.
      expect(aLocal.getX(0)).toBeCloseTo(-SADDLE_HALF_EXTENT);
      expect(aLocal.getY(0)).toBeCloseTo(-SADDLE_HALF_EXTENT);
      const tr = RES * RES - 1;
      expect(aLocal.getX(tr)).toBeCloseTo(SADDLE_HALF_EXTENT);
      expect(aLocal.getY(tr)).toBeCloseTo(SADDLE_HALF_EXTENT);
    } finally {
      dispose();
    }
  });
});

describe('createTaylorOverlay — quadratic invariance at the selected point', () => {
  it('center vertex sits at world writeGraphPointToWorld(x0, y0, f(x0, y0))', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      const x0 = 0.5;
      const y0 = -0.3;
      setPose(x0, y0);

      const expected = new THREE.Vector3();
      writeGraphPointToWorld(
        x0,
        y0,
        SADDLE_PRESET.f(x0, y0),
        SURFACE_CENTER,
        expected,
      );

      const pos = mesh.geometry.getAttribute('position');
      expect(pos.getX(CENTER_FLAT)).toBeCloseTo(expected.x);
      expect(pos.getY(CENTER_FLAT)).toBeCloseTo(expected.y);
      expect(pos.getZ(CENTER_FLAT)).toBeCloseTo(expected.z);
    } finally {
      dispose();
    }
  });

  it('works for every preset at a non-trivial pose', () => {
    for (const preset of PRESETS) {
      const overlay = makeOverlay(preset);
      try {
        const x0 = 0.2;
        const y0 = 0.1;
        overlay.setPose(x0, y0);
        const expected = new THREE.Vector3();
        writeGraphPointToWorld(
          x0,
          y0,
          preset.f(x0, y0),
          SURFACE_CENTER,
          expected,
        );
        const pos = overlay.mesh.geometry.getAttribute('position');
        expect(pos.getX(CENTER_FLAT)).toBeCloseTo(expected.x);
        expect(pos.getY(CENTER_FLAT)).toBeCloseTo(expected.y);
        expect(pos.getZ(CENTER_FLAT)).toBeCloseTo(expected.z);
      } finally {
        overlay.dispose();
      }
    }
  });
});

describe('createTaylorOverlay — at a critical point, overlay equals pure quadratic', () => {
  // At (x₀, y₀) = (0, 0) on the saddle, f₀ = 0 and (fx, fy) = (0, 0).
  // The Taylor expansion collapses to ½·(fxx·u² + 2·fxy·u·v + fyy·v²)
  // = ½·(2u² + 0 − 2v²) = u² − v². Math-Z = u² − v² should be the
  // graph height at every (u, v); the math→world frame map (math-Z
  // → +world-Y) means the world-Y coord of each vertex equals
  // surfaceCenter.y + (u² − v²).

  it('saddle at origin — corner (+half, +half) has world-Y = surfaceCenter.y', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      setPose(0, 0);
      const aLocal = mesh.geometry.getAttribute('aLocal');
      const pos = mesh.geometry.getAttribute('position');
      const tr = RES * RES - 1;
      const u = aLocal.getX(tr);
      const v = aLocal.getY(tr);
      const expectedZ = u * u - v * v; // u = v = +half ⇒ 0
      expect(pos.getY(tr)).toBeCloseTo(SURFACE_CENTER.y + expectedZ);
    } finally {
      dispose();
    }
  });

  it('saddle at origin — corner (+half, -half) has world-Y = surfaceCenter.y', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      setPose(0, 0);
      const aLocal = mesh.geometry.getAttribute('aLocal');
      const pos = mesh.geometry.getAttribute('position');
      // (i, j) = (RES-1, 0) ⇒ flat RES-1
      const idx = RES - 1;
      const u = aLocal.getX(idx);
      const v = aLocal.getY(idx);
      expect(u).toBeCloseTo(SADDLE_HALF_EXTENT);
      expect(v).toBeCloseTo(-SADDLE_HALF_EXTENT);
      const expectedZ = u * u - v * v; // u² − v² = 0 (saddle symmetry)
      expect(pos.getY(idx)).toBeCloseTo(SURFACE_CENTER.y + expectedZ);
    } finally {
      dispose();
    }
  });

  it('saddle at origin — edge midpoint matches u² − v²', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      setPose(0, 0);
      const aLocal = mesh.geometry.getAttribute('aLocal');
      const pos = mesh.geometry.getAttribute('position');
      // (i = CENTER_I, j = 0): top-edge middle.
      const idx = 0 * RES + CENTER_I;
      const u = aLocal.getX(idx);
      const v = aLocal.getY(idx);
      expect(u).toBeCloseTo(0);
      expect(v).toBeCloseTo(-SADDLE_HALF_EXTENT);
      const expectedZ = u * u - v * v;
      expect(pos.getY(idx)).toBeCloseTo(SURFACE_CENTER.y + expectedZ);
    } finally {
      dispose();
    }
  });
});

describe('createTaylorOverlay — away from a critical point, linear+quadratic shape', () => {
  // At (x₀, y₀) = (0.5, 0) on the saddle (f = x² − y²): f₀ = 0.25,
  // fx = 1, fy = 0, fxx = 2, fxy = 0, fyy = −2.
  //   q(u, v) = 0.25 + 1·u + ½·(2u² − 2v²)
  //          = 0.25 + u + u² − v².
  // At a positive-u corner (u = +half, v = 0), q = 0.25 + half + half².

  it('linear term contributes at off-CP pose', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      setPose(0.5, 0);
      const aLocal = mesh.geometry.getAttribute('aLocal');
      const pos = mesh.geometry.getAttribute('position');
      // Right-edge middle: i = RES-1, j = CENTER_J.
      const idx = CENTER_J * RES + (RES - 1);
      const u = aLocal.getX(idx);
      const v = aLocal.getY(idx);
      expect(u).toBeCloseTo(SADDLE_HALF_EXTENT);
      expect(v).toBeCloseTo(0);
      const expectedZ = 0.25 + u + u * u - v * v;
      expect(pos.getY(idx)).toBeCloseTo(SURFACE_CENTER.y + expectedZ);
    } finally {
      dispose();
    }
  });
});

describe('createTaylorOverlay — setPose lifecycle', () => {
  it('mutates positions but leaves aLocal unchanged', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      const aLocal = mesh.geometry.getAttribute('aLocal');
      const aLocalCopy = new Float32Array(aLocal.array);

      const pos = mesh.geometry.getAttribute('position');
      const posBeforeY = pos.getY(CENTER_FLAT);

      setPose(0.7, -0.2);

      // aLocal untouched.
      for (let i = 0; i < aLocal.array.length; i++) {
        expect(aLocal.array[i]).toBe(aLocalCopy[i]);
      }
      // Position moved (saddle f at (0.7, -0.2) = 0.49 - 0.04 = 0.45,
      // distinct from f(0, 0) = 0 the constructor seeded).
      expect(pos.getY(CENTER_FLAT)).not.toBeCloseTo(posBeforeY);
    } finally {
      dispose();
    }
  });

  it('marks both position and normal needsUpdate exactly once per call', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const norm = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
      const posSpy = vi.spyOn(pos, 'needsUpdate', 'set');
      const normSpy = vi.spyOn(norm, 'needsUpdate', 'set');

      setPose(0.3, 0.4);

      expect(posSpy).toHaveBeenCalledTimes(1);
      expect(posSpy).toHaveBeenCalledWith(true);
      expect(normSpy).toHaveBeenCalledTimes(1);
      expect(normSpy).toHaveBeenCalledWith(true);
    } finally {
      dispose();
    }
  });

  it('does NOT mark aLocal needsUpdate on setPose', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      const aLocal = mesh.geometry.getAttribute('aLocal') as THREE.BufferAttribute;
      const localSpy = vi.spyOn(aLocal, 'needsUpdate', 'set');

      setPose(0.3, 0.4);

      expect(localSpy).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });
});

describe('createTaylorOverlay — setPreset lifecycle', () => {
  it('updates halfExtent uniform when switching to a smaller-domain preset', () => {
    const overlay = makeOverlay(SADDLE_PRESET);
    try {
      const material = (overlay.mesh.material as THREE.ShaderMaterial);
      const initialHalf = (material.uniforms.uHalfExtent as { value: number })
        .value;
      expect(initialHalf).toBeCloseTo(SADDLE_HALF_EXTENT);

      // quartic-min has domain [-1, 1]² (range 2.0); half = 0.25 * 2 / 2 = 0.25.
      const quartic = PRESETS.find((p) => p.id === 'quartic-min')!;
      overlay.setPreset(quartic, 0, 0);

      const after = (material.uniforms.uHalfExtent as { value: number }).value;
      expect(after).toBeCloseTo((0.25 * 2.0) / 2);
      expect(after).not.toBeCloseTo(initialHalf);
    } finally {
      overlay.dispose();
    }
  });

  it('rewrites aLocal corners to the new half-extent', () => {
    const overlay = makeOverlay(SADDLE_PRESET);
    try {
      const quartic = PRESETS.find((p) => p.id === 'quartic-min')!;
      overlay.setPreset(quartic, 0, 0);
      const aLocal = overlay.mesh.geometry.getAttribute('aLocal');
      const quarticHalf = (0.25 * 2.0) / 2;
      // Corner (0, 0) ⇒ (-half, -half) at new preset.
      expect(aLocal.getX(0)).toBeCloseTo(-quarticHalf);
      expect(aLocal.getY(0)).toBeCloseTo(-quarticHalf);
    } finally {
      overlay.dispose();
    }
  });

  it('marks aLocal needsUpdate on setPreset (per roundtable Sonnet F2 + GPT F4)', () => {
    const overlay = makeOverlay(SADDLE_PRESET);
    try {
      const aLocal = overlay.mesh.geometry.getAttribute(
        'aLocal',
      ) as THREE.BufferAttribute;
      const localSpy = vi.spyOn(aLocal, 'needsUpdate', 'set');

      const quartic = PRESETS.find((p) => p.id === 'quartic-min')!;
      overlay.setPreset(quartic, 0, 0);

      expect(localSpy).toHaveBeenCalledWith(true);
    } finally {
      overlay.dispose();
    }
  });

  it('also refreshes positions + normals from the new preset', () => {
    const overlay = makeOverlay(SADDLE_PRESET);
    try {
      // Switch to paraboloid (f = x² + y²); at (0, 0) the center
      // vertex sits at math-Z = 0 (same as saddle), but at the corner
      // (+half, +half) the paraboloid's z = 2·half² is positive,
      // unlike the saddle's z = 0.
      const paraboloid = PRESETS.find((p) => p.id === 'paraboloid')!;
      overlay.setPreset(paraboloid, 0, 0);

      const aLocal = overlay.mesh.geometry.getAttribute('aLocal');
      const pos = overlay.mesh.geometry.getAttribute('position');
      const tr = RES * RES - 1;
      const u = aLocal.getX(tr);
      const v = aLocal.getY(tr);
      const expectedZ = u * u + v * v;
      expect(pos.getY(tr)).toBeCloseTo(SURFACE_CENTER.y + expectedZ);
    } finally {
      overlay.dispose();
    }
  });
});

describe('createTaylorOverlay — analytic normals', () => {
  it('every normal is unit-length on the saddle preset (mixed-sign Hessian)', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      setPose(0.3, -0.4);
      const norm = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < norm.count; i++) {
        const mag = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
        expect(mag).toBeCloseTo(1);
      }
    } finally {
      dispose();
    }
  });

  it('center-vertex normal at saddle origin points straight up in world coords', () => {
    const { mesh, dispose, setPose } = makeOverlay();
    try {
      setPose(0, 0);
      // At a critical point, qx = qy = 0 everywhere along u = v = 0,
      // so the math-frame normal is (0, 0, 1) → world (0, 1, 0).
      const norm = mesh.geometry.getAttribute('normal');
      expect(norm.getX(CENTER_FLAT)).toBeCloseTo(0);
      expect(norm.getY(CENTER_FLAT)).toBeCloseTo(1);
      expect(norm.getZ(CENTER_FLAT)).toBeCloseTo(0);
    } finally {
      dispose();
    }
  });
});

describe('createTaylorOverlay — buffer-usage hints + culling', () => {
  it('position attribute uses DynamicDrawUsage', () => {
    const { mesh, dispose } = makeOverlay();
    try {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      expect(pos.usage).toBe(THREE.DynamicDrawUsage);
    } finally {
      dispose();
    }
  });

  it('normal attribute uses DynamicDrawUsage', () => {
    const { mesh, dispose } = makeOverlay();
    try {
      const norm = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
      expect(norm.usage).toBe(THREE.DynamicDrawUsage);
    } finally {
      dispose();
    }
  });

  it('aLocal attribute uses default StaticDrawUsage', () => {
    const { mesh, dispose } = makeOverlay();
    try {
      const aLocal = mesh.geometry.getAttribute('aLocal') as THREE.BufferAttribute;
      expect(aLocal.usage).toBe(THREE.StaticDrawUsage);
    } finally {
      dispose();
    }
  });

  it('mesh.frustumCulled is false (stale-bounds mitigation per §2.4.2)', () => {
    const { mesh, dispose } = makeOverlay();
    try {
      expect(mesh.frustumCulled).toBe(false);
    } finally {
      dispose();
    }
  });
});

describe('createTaylorOverlay — material flags', () => {
  it('has polygonOffset enabled with negative factor + units', () => {
    const { mesh, dispose } = makeOverlay();
    try {
      const mat = mesh.material as THREE.ShaderMaterial;
      expect(mat.polygonOffset).toBe(true);
      expect(mat.polygonOffsetFactor).toBeLessThan(0);
      expect(mat.polygonOffsetUnits).toBeLessThan(0);
    } finally {
      dispose();
    }
  });

  it('is transparent, double-sided, depthWrite false, renderOrder 1', () => {
    const { mesh, dispose } = makeOverlay();
    try {
      const mat = mesh.material as THREE.ShaderMaterial;
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
      expect(mat.side).toBe(THREE.DoubleSide);
      expect(mesh.renderOrder).toBe(1);
    } finally {
      dispose();
    }
  });
});

describe('createTaylorOverlay — out-of-domain robustness', () => {
  it('produces all-finite positions when overlay extends past preset domain', () => {
    // Sonnet PR-review LOW F1: when the slider sits at (xMax, yMax)
    // and halfExtent extends past the domain, f(x0+u, y0+v) is called
    // with arguments outside [xMin, xMax]×[yMin, yMax]. Current v0.8
    // presets are global polynomials so f never NaNs/asserts at the
    // boundary, but this test pins the property so a future preset
    // whose f misbehaves at domain edges trips at unit-test time.
    // Worst v0.8 case: quartic-min at (xMax, yMax) = (1, 1) with
    // halfExtent = 0.25, sampling out to x = y = 1.25.
    const quartic = PRESETS.find((p) => p.id === 'quartic-min')!;
    const overlay = createTaylorOverlay({
      preset: quartic,
      surfaceCenter: SURFACE_CENTER,
      lightDir: LIGHT_DIR,
    });
    try {
      overlay.setPose(quartic.domain.xMax, quartic.domain.yMax);
      const pos = overlay.mesh.geometry.getAttribute('position');
      const norm = overlay.mesh.geometry.getAttribute('normal');
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true);
        expect(Number.isFinite(pos.getY(i))).toBe(true);
        expect(Number.isFinite(pos.getZ(i))).toBe(true);
        expect(Number.isFinite(norm.getX(i))).toBe(true);
        expect(Number.isFinite(norm.getY(i))).toBe(true);
        expect(Number.isFinite(norm.getZ(i))).toBe(true);
      }
    } finally {
      overlay.dispose();
    }
  });
});

describe('createTaylorOverlay — dispose', () => {
  it('disposes both geometry and material exactly once', () => {
    const handles = makeOverlay();
    const geomSpy = vi.spyOn(handles.mesh.geometry, 'dispose');
    const matSpy = vi.spyOn(handles.mesh.material as THREE.ShaderMaterial, 'dispose');
    handles.dispose();
    expect(geomSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });
});
