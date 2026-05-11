import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createGraphSurface,
  writeGraphPointToWorld,
} from '@/exhibits/saddle-extrema/GraphSurface';

// Vitest coverage for the meshed graph-surface primitive (#176; GPT #1 from
// the v1 roundtable). The primitive is a pure helper carrying the highest
// math-risk surface in the v0.8 saddle-extrema PR: grid indexing, math-frame
// mapping, and analytic vertex normals. Scope is the pure helper only —
// scene-registration / mount / unmount plumbing is exercised by the shell's
// boot-time pre-warm cycle, not here.

const STARTER_F = (x: number, y: number) => x * x - y * y;
const STARTER_GRAD_F = (x: number, y: number) =>
  [2 * x, -2 * y] as const;
const STARTER_DOMAIN = { xMin: -1.5, xMax: 1.5, yMin: -1.5, yMax: 1.5 };

function makeSurface(overrides: Partial<{
  f: (x: number, y: number) => number;
  gradF: (x: number, y: number) => readonly [number, number];
  domain: { xMin: number; xMax: number; yMin: number; yMax: number };
  res: number;
  surfaceCenter: THREE.Vector3;
  baseColor: THREE.Color;
  lightDir: THREE.Vector3;
}> = {}) {
  return createGraphSurface({
    f: STARTER_F,
    gradF: STARTER_GRAD_F,
    domain: STARTER_DOMAIN,
    res: 3,
    surfaceCenter: new THREE.Vector3(0, 1.5, -4),
    baseColor: new THREE.Color(0.4, 0.7, 0.95),
    lightDir: new THREE.Vector3(0.4, 0.8, 0.5).normalize(),
    ...overrides,
  });
}

describe('writeGraphPointToWorld', () => {
  it('remaps math (x, y, z) to world (x, z, -y) then adds surfaceCenter', () => {
    const out = new THREE.Vector3();
    writeGraphPointToWorld(1, 2, 3, new THREE.Vector3(0, 1.5, -4), out);
    // math (1, 2, 3) -> world (1, 3, -2), then + (0, 1.5, -4) -> (1, 4.5, -6).
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(4.5);
    expect(out.z).toBeCloseTo(-6);
  });

  it('math-origin lifts to the surfaceCenter', () => {
    const out = new THREE.Vector3();
    writeGraphPointToWorld(0, 0, 0, new THREE.Vector3(0, 1.5, -4), out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1.5);
    expect(out.z).toBeCloseTo(-4);
  });
});

describe('createGraphSurface — geometry shape', () => {
  it('emits res² vertices (positions and normals)', () => {
    const { mesh } = makeSurface({ res: 3 });
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    expect(position.count).toBe(9);
    expect(normal.count).toBe(9);
  });

  it('emits (res-1)² × 2 triangles', () => {
    const { mesh } = makeSurface({ res: 3 });
    const index = mesh.geometry.getIndex();
    expect(index).not.toBeNull();
    // 2² quads × 2 triangles × 3 indices = 24 index entries.
    expect(index!.count).toBe(24);
  });

  it('uses Uint16Array indices when res² ≤ 65535', () => {
    const { mesh } = makeSurface({ res: 3 });
    const index = mesh.geometry.getIndex()!;
    expect(index.array).toBeInstanceOf(Uint16Array);
  });

  it('uses Uint32Array indices when res² > 65535', () => {
    // res = 256 ⇒ res² = 65536 > 65535; tips into Uint32.
    const { mesh, dispose } = makeSurface({ res: 256 });
    const index = mesh.geometry.getIndex()!;
    try {
      expect(index.array).toBeInstanceOf(Uint32Array);
    } finally {
      dispose();
    }
  });
});

describe('createGraphSurface — math-frame mapping (sample positions)', () => {
  // Uses res = 3 with domain [-1, 1]² and surfaceCenter (0, 1.5, -4) so
  // sample vertices land at predictable world coords:
  //   (i, j) = (1, 1): math (0, 0, 0)   → world (0, 1.5, -4)
  //   (i, j) = (0, 0): math (-1, -1, 0) → world (-1, 1.5, -3)
  //   (i, j) = (2, 0): math (1, -1, 0)  → world (1, 1.5, -3)
  //   (i, j) = (0, 2): math (-1, 1, 0)  → world (-1, 1.5, -5)
  // A flipped math-frame mapping (e.g. math-Y → +world-Z instead of
  // -world-Z) would shift the corners; the test fails immediately.

  function makeFlatSurface() {
    return makeSurface({
      f: () => 0,
      gradF: () => [0, 0] as const,
      domain: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      res: 3,
      surfaceCenter: new THREE.Vector3(0, 1.5, -4),
    });
  }

  it('center vertex (1, 1) lifts to the surfaceCenter', () => {
    const { mesh } = makeFlatSurface();
    const p = mesh.geometry.getAttribute('position');
    const idx = 1 * 3 + 1; // (j, i) = (1, 1)
    expect(p.getX(idx)).toBeCloseTo(0);
    expect(p.getY(idx)).toBeCloseTo(1.5);
    expect(p.getZ(idx)).toBeCloseTo(-4);
  });

  it('corner (0, 0) sits at world (-1, 1.5, -3)', () => {
    const { mesh } = makeFlatSurface();
    const p = mesh.geometry.getAttribute('position');
    const idx = 0; // (j, i) = (0, 0)
    expect(p.getX(idx)).toBeCloseTo(-1);
    expect(p.getY(idx)).toBeCloseTo(1.5);
    expect(p.getZ(idx)).toBeCloseTo(-3);
  });

  it('corner (2, 0) sits at world (1, 1.5, -3)', () => {
    const { mesh } = makeFlatSurface();
    const p = mesh.geometry.getAttribute('position');
    const idx = 2; // (j, i) = (0, 2)
    expect(p.getX(idx)).toBeCloseTo(1);
    expect(p.getY(idx)).toBeCloseTo(1.5);
    expect(p.getZ(idx)).toBeCloseTo(-3);
  });

  it('corner (0, 2) sits at world (-1, 1.5, -5)', () => {
    const { mesh } = makeFlatSurface();
    const p = mesh.geometry.getAttribute('position');
    const idx = 2 * 3 + 0; // (j, i) = (2, 0)
    expect(p.getX(idx)).toBeCloseTo(-1);
    expect(p.getY(idx)).toBeCloseTo(1.5);
    expect(p.getZ(idx)).toBeCloseTo(-5);
  });

  it('saddle z = x² − y² lifts math-X edges up and math-Y edges down', () => {
    const { mesh } = makeSurface({
      domain: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      res: 3,
    });
    const p = mesh.geometry.getAttribute('position');
    // (i=2, j=1): math (1, 0, 1) → world (1, 2.5, -4) — up by 1 from
    // surfaceCenter.y because math-Z = 1.
    expect(p.getY(1 * 3 + 2)).toBeCloseTo(2.5);
    // (i=1, j=2): math (0, 1, -1) → world (0, 0.5, -5) — down by 1 from
    // surfaceCenter.y because math-Z = -1.
    expect(p.getY(2 * 3 + 1)).toBeCloseTo(0.5);
  });
});

describe('createGraphSurface — analytic normals', () => {
  // Math-frame normal for z = f(x, y): n_math = normalize(-f_x, -f_y, 1).
  // For z = x² − y², f_x = 2x, f_y = -2y, so n_math = normalize(-2x, 2y, 1).
  // World mapping: math (a, b, c) → world (a, c, -b).
  // So at (x, y), n_world = normalize(-2x, 1, -2y) (before normalization).

  it('saddle origin normal points straight up in world coords', () => {
    const { mesh } = makeSurface({
      domain: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      res: 3,
    });
    const n = mesh.geometry.getAttribute('normal');
    const idx = 1 * 3 + 1; // center vertex (i=1, j=1)
    expect(n.getX(idx)).toBeCloseTo(0);
    expect(n.getY(idx)).toBeCloseTo(1);
    expect(n.getZ(idx)).toBeCloseTo(0);
  });

  it('saddle off-center normal tilts correctly in world coords', () => {
    const { mesh } = makeSurface({
      domain: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      res: 3,
    });
    const n = mesh.geometry.getAttribute('normal');
    // (i=2, j=1): (x, y) = (1, 0); math-normal (-2, 0, 1) → world (-2, 1, 0)
    // normalized → (-0.8944, 0.4472, 0).
    const idx = 1 * 3 + 2;
    const len = Math.sqrt(5);
    expect(n.getX(idx)).toBeCloseTo(-2 / len);
    expect(n.getY(idx)).toBeCloseTo(1 / len);
    expect(n.getZ(idx)).toBeCloseTo(0);
  });

  it('saddle off-center normal in math-Y tilts toward +world-Z', () => {
    const { mesh } = makeSurface({
      domain: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      res: 3,
    });
    const n = mesh.geometry.getAttribute('normal');
    // (i=1, j=2): (x, y) = (0, 1); math-normal (0, 2, 1) → world (0, 1, -2)
    // normalized → (0, 0.4472, -0.8944). Math-Y = +1 maps to world-Z = -1,
    // so the normal's −math-Y² direction (negative tilt of f) shows up as
    // world-Z = -2 component.
    const idx = 2 * 3 + 1;
    const len = Math.sqrt(5);
    expect(n.getX(idx)).toBeCloseTo(0);
    expect(n.getY(idx)).toBeCloseTo(1 / len);
    expect(n.getZ(idx)).toBeCloseTo(-2 / len);
  });

  it('every emitted normal is unit-length', () => {
    const { mesh } = makeSurface({ res: 5 });
    const n = mesh.geometry.getAttribute('normal');
    for (let i = 0; i < n.count; i++) {
      const mag = Math.sqrt(
        n.getX(i) ** 2 + n.getY(i) ** 2 + n.getZ(i) ** 2,
      );
      expect(mag).toBeCloseTo(1);
    }
  });
});

describe('createGraphSurface — index winding', () => {
  // For a flat surface with up-facing normal, the cross product of two
  // edges of each emitted triangle (taken in winding order) should also
  // point up (positive world-Y). A flipped-winding bug would show as a
  // negative-Y cross product.

  it('triangle winding agrees with up-facing analytic normal on a flat surface', () => {
    const { mesh } = makeSurface({
      f: () => 0,
      gradF: () => [0, 0] as const,
      domain: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      res: 3,
    });
    const p = mesh.geometry.getAttribute('position');
    const idx = mesh.geometry.getIndex()!;

    // First triangle: bl → br → tl. Edges (br - bl) and (tl - bl).
    const i0 = idx.getX(0);
    const i1 = idx.getX(1);
    const i2 = idx.getX(2);

    const e1 = new THREE.Vector3(
      p.getX(i1) - p.getX(i0),
      p.getY(i1) - p.getY(i0),
      p.getZ(i1) - p.getZ(i0),
    );
    const e2 = new THREE.Vector3(
      p.getX(i2) - p.getX(i0),
      p.getY(i2) - p.getY(i0),
      p.getZ(i2) - p.getZ(i0),
    );
    const cross = new THREE.Vector3().crossVectors(e1, e2);
    expect(cross.y).toBeGreaterThan(0);
  });
});

describe('createGraphSurface — validation', () => {
  it('throws when res is non-integer', () => {
    expect(() => makeSurface({ res: 1.5 })).toThrow(/res must be an integer/);
  });

  it('throws when res < 2', () => {
    expect(() => makeSurface({ res: 1 })).toThrow(/res must be an integer/);
    expect(() => makeSurface({ res: 0 })).toThrow(/res must be an integer/);
    expect(() => makeSurface({ res: -2 })).toThrow(/res must be an integer/);
  });

  it('throws when xMin >= xMax', () => {
    expect(() =>
      makeSurface({ domain: { xMin: 1, xMax: 1, yMin: -1, yMax: 1 } }),
    ).toThrow(/domain\.xMin/);
    expect(() =>
      makeSurface({ domain: { xMin: 2, xMax: 1, yMin: -1, yMax: 1 } }),
    ).toThrow(/domain\.xMin/);
  });

  it('throws when yMin >= yMax', () => {
    expect(() =>
      makeSurface({ domain: { xMin: -1, xMax: 1, yMin: 0, yMax: 0 } }),
    ).toThrow(/domain\.yMin/);
  });

  it('throws on non-finite domain bounds', () => {
    expect(() =>
      makeSurface({ domain: { xMin: NaN, xMax: 1, yMin: -1, yMax: 1 } }),
    ).toThrow(/domain\.xMin/);
    expect(() =>
      makeSurface({
        domain: { xMin: -1, xMax: 1, yMin: -Infinity, yMax: 1 },
      }),
    ).toThrow(/domain\.yMin/);
  });
});

describe('createGraphSurface — dispose', () => {
  it('disposes both geometry and material', () => {
    const handles = makeSurface({ res: 3 });
    const geomSpy = vi.spyOn(handles.mesh.geometry, 'dispose');
    const matSpy = vi.spyOn(handles.material, 'dispose');
    handles.dispose();
    expect(geomSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });
});
