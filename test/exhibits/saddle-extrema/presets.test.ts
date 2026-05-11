import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET_INDEX,
  PRESETS,
  type SaddleExtremaPreset,
} from '@/exhibits/saddle-extrema/presets';

// Vitest coverage for the saddle-extrema preset library (#178). Scope:
// math correctness of f, gradF, and hessF on each preset, plus the
// per-archetype classification reading at the critical point. The
// presets feed downstream consumers (#179 markers, #180 quadratic
// overlay, #181 classification readout) — analytic-derivative bugs would
// surface as silent misalignment between the surface mesh (vertex
// normals from gradF) and the indicator / overlays.

// Central-difference step for the finite-difference cross-check. Small
// enough to keep truncation error <1e-5 on smooth polynomials; large
// enough to keep roundoff noise comfortable.
const FD_STEP = 1e-4;

function gradFD(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
): [number, number] {
  return [
    (f(x + FD_STEP, y) - f(x - FD_STEP, y)) / (2 * FD_STEP),
    (f(x, y + FD_STEP) - f(x, y - FD_STEP)) / (2 * FD_STEP),
  ];
}

function hessFD(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
): [number, number, number] {
  // Standard second-order central differences for f_xx, f_xy, f_yy.
  const fxx =
    (f(x + FD_STEP, y) - 2 * f(x, y) + f(x - FD_STEP, y)) / (FD_STEP * FD_STEP);
  const fyy =
    (f(x, y + FD_STEP) - 2 * f(x, y) + f(x, y - FD_STEP)) / (FD_STEP * FD_STEP);
  const fxy =
    (f(x + FD_STEP, y + FD_STEP)
      - f(x + FD_STEP, y - FD_STEP)
      - f(x - FD_STEP, y + FD_STEP)
      + f(x - FD_STEP, y - FD_STEP)) / (4 * FD_STEP * FD_STEP);
  return [fxx, fxy, fyy];
}

function presetById(id: string): SaddleExtremaPreset {
  const p = PRESETS.find((preset) => preset.id === id);
  if (!p) throw new Error(`preset not found: ${id}`);
  return p;
}

describe('PRESETS — library shape', () => {
  it('contains exactly five archetypes in the canonical order', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      'paraboloid',
      'inv-paraboloid',
      'saddle',
      'monkey-saddle',
      'quartic-min',
    ]);
  });

  it('DEFAULT_PRESET_INDEX points at the saddle (#176 starter)', () => {
    expect(PRESETS[DEFAULT_PRESET_INDEX].id).toBe('saddle');
  });

  it('every preset has a finite, well-ordered (x, y) domain', () => {
    for (const p of PRESETS) {
      expect(Number.isFinite(p.domain.xMin)).toBe(true);
      expect(Number.isFinite(p.domain.xMax)).toBe(true);
      expect(Number.isFinite(p.domain.yMin)).toBe(true);
      expect(Number.isFinite(p.domain.yMax)).toBe(true);
      expect(p.domain.xMin).toBeLessThan(p.domain.xMax);
      expect(p.domain.yMin).toBeLessThan(p.domain.yMax);
      // Every v0.8 preset's critical point sits at the origin —
      // confirm origin is inside the domain.
      expect(p.domain.xMin).toBeLessThanOrEqual(0);
      expect(p.domain.xMax).toBeGreaterThanOrEqual(0);
      expect(p.domain.yMin).toBeLessThanOrEqual(0);
      expect(p.domain.yMax).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('PRESETS — critical point at origin', () => {
  it('gradF vanishes at the origin for every preset', () => {
    for (const p of PRESETS) {
      const [fx, fy] = p.gradF(0, 0);
      expect(fx).toBeCloseTo(0);
      expect(fy).toBeCloseTo(0);
    }
  });
});

describe('PRESETS — analytic derivatives agree with finite differences', () => {
  // Sample at a generic non-origin, non-axis point inside every domain.
  // (0.3, 0.2) sits inside the quartic preset's [-1, 1]² (the tightest
  // domain in the set) with room to spare.
  const x = 0.3;
  const y = 0.2;

  it('gradF matches finite-difference gradient at a sample point', () => {
    for (const p of PRESETS) {
      const [fx, fy] = p.gradF(x, y);
      const [fxNum, fyNum] = gradFD(p.f, x, y);
      expect(fx).toBeCloseTo(fxNum, 4);
      expect(fy).toBeCloseTo(fyNum, 4);
    }
  });

  it('hessF matches finite-difference Hessian at a sample point', () => {
    for (const p of PRESETS) {
      const [fxx, fxy, fyy] = p.hessF(x, y);
      const [fxxNum, fxyNum, fyyNum] = hessFD(p.f, x, y);
      // FD second derivatives accumulate more roundoff; loosen the
      // tolerance via toBeCloseTo precision 3 (≈ ±5e-4).
      expect(fxx).toBeCloseTo(fxxNum, 3);
      expect(fxy).toBeCloseTo(fxyNum, 3);
      expect(fyy).toBeCloseTo(fyyNum, 3);
    }
  });
});

describe('PRESETS — per-archetype Hessian at origin', () => {
  it('paraboloid (x²+y²): f_xx = f_yy = 2, f_xy = 0', () => {
    const [fxx, fxy, fyy] = presetById('paraboloid').hessF(0, 0);
    expect(fxx).toBe(2);
    expect(fxy).toBe(0);
    expect(fyy).toBe(2);
  });

  it('inv-paraboloid (−x²−y²): f_xx = f_yy = -2, f_xy = 0', () => {
    const [fxx, fxy, fyy] = presetById('inv-paraboloid').hessF(0, 0);
    expect(fxx).toBe(-2);
    expect(fxy).toBe(0);
    expect(fyy).toBe(-2);
  });

  it('saddle (x²−y²): f_xx = 2, f_yy = -2, f_xy = 0', () => {
    const [fxx, fxy, fyy] = presetById('saddle').hessF(0, 0);
    expect(fxx).toBe(2);
    expect(fxy).toBe(0);
    expect(fyy).toBe(-2);
  });

  it('monkey saddle (x³−3xy²): Hessian vanishes at origin', () => {
    const [fxx, fxy, fyy] = presetById('monkey-saddle').hessF(0, 0);
    // toBeCloseTo (rather than toBe) so −0 from `-6 * 0` matches +0 — the
    // pedagogically meaningful claim is that the entries are zero, not
    // their IEEE 754 sign.
    expect(fxx).toBeCloseTo(0);
    expect(fxy).toBeCloseTo(0);
    expect(fyy).toBeCloseTo(0);
  });

  it('quartic min (x⁴+y⁴): Hessian vanishes at origin', () => {
    const [fxx, fxy, fyy] = presetById('quartic-min').hessF(0, 0);
    expect(fxx).toBeCloseTo(0);
    expect(fxy).toBeCloseTo(0);
    expect(fyy).toBeCloseTo(0);
  });
});

describe('PRESETS — second-derivative test reading at origin', () => {
  // D = f_xx · f_yy − f_xy². The four archetype outcomes the preset
  // library is designed to demonstrate:
  //   D > 0 + f_xx > 0 ⇒ local min
  //   D > 0 + f_xx < 0 ⇒ local max
  //   D < 0            ⇒ saddle
  //   D = 0            ⇒ inconclusive (test failure: monkey saddle + quartic)

  function discriminantAtOrigin(p: SaddleExtremaPreset): number {
    const [fxx, fxy, fyy] = p.hessF(0, 0);
    return fxx * fyy - fxy * fxy;
  }

  it('paraboloid: D > 0 and f_xx > 0 ⇒ local min', () => {
    const p = presetById('paraboloid');
    expect(discriminantAtOrigin(p)).toBeGreaterThan(0);
    expect(p.hessF(0, 0)[0]).toBeGreaterThan(0);
  });

  it('inv-paraboloid: D > 0 and f_xx < 0 ⇒ local max', () => {
    const p = presetById('inv-paraboloid');
    expect(discriminantAtOrigin(p)).toBeGreaterThan(0);
    expect(p.hessF(0, 0)[0]).toBeLessThan(0);
  });

  it('saddle: D < 0 ⇒ saddle', () => {
    expect(discriminantAtOrigin(presetById('saddle'))).toBeLessThan(0);
  });

  it('monkey saddle: D = 0 ⇒ test inconclusive', () => {
    expect(discriminantAtOrigin(presetById('monkey-saddle'))).toBeCloseTo(0);
  });

  it('quartic min: D = 0 ⇒ test inconclusive (the §11.7 punch-line counterexample)', () => {
    expect(discriminantAtOrigin(presetById('quartic-min'))).toBeCloseTo(0);
  });
});
