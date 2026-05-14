import { describe, expect, it } from 'vitest';
import { buildAxisSnapPoints } from '@/exhibits/saddle-extrema/snap-points';

// Coverage for the pure per-axis CP-projection helper (#200). Imported
// from the standalone `snap-points.ts` sub-file rather than from
// `index.ts` — the latter triggers `registerExhibit` at module load,
// pulls in Three.js-heavy constructors, and can collide with other
// tests in the same run.
//
// Every v0.8 preset has CPs at the origin only, so the production code
// path collapses to `[0]` for both axes; this file is the only place
// the off-origin / dedup / axis-index branches actually run.

describe('buildAxisSnapPoints', () => {
  it('origin-only CP projects to [0] on both axes', () => {
    expect(buildAxisSnapPoints([[0, 0]], 0)).toEqual([0]);
    expect(buildAxisSnapPoints([[0, 0]], 1)).toEqual([0]);
  });

  it('off-origin CP seeds the origin and adds the projected coordinate', () => {
    expect(buildAxisSnapPoints([[0.5, -0.3]], 0)).toEqual([0, 0.5]);
    expect(buildAxisSnapPoints([[0.5, -0.3]], 1)).toEqual([-0.3, 0]);
  });

  it('deduplicates same-axis-coord CPs', () => {
    // Two CPs share x = 0.5 → x-axis collapses to [0, 0.5].
    // Distinct y coords → y-axis gets all three (sorted).
    const cps: readonly (readonly [number, number])[] = [
      [0.5, 0.3],
      [0.5, -0.3],
    ];
    expect(buildAxisSnapPoints(cps, 0)).toEqual([0, 0.5]);
    expect(buildAxisSnapPoints(cps, 1)).toEqual([-0.3, 0, 0.3]);
  });

  it('empty CP list still returns the origin seed', () => {
    expect(buildAxisSnapPoints([], 0)).toEqual([0]);
    expect(buildAxisSnapPoints([], 1)).toEqual([0]);
  });

  it('axis index selects the correct CP coordinate (regression: swap guard)', () => {
    // Asymmetric CP so a swapped axis index would visibly fail.
    expect(buildAxisSnapPoints([[1, 2]], 0)).toEqual([0, 1]);
    expect(buildAxisSnapPoints([[1, 2]], 1)).toEqual([0, 2]);
  });

  it('returns ascending sorted order', () => {
    const cps: readonly (readonly [number, number])[] = [
      [0.5, 0.5],
      [-0.5, -0.5],
      [0.25, 0.25],
    ];
    expect(buildAxisSnapPoints(cps, 0)).toEqual([-0.5, 0, 0.25, 0.5]);
    expect(buildAxisSnapPoints(cps, 1)).toEqual([-0.5, 0, 0.25, 0.5]);
  });
});
