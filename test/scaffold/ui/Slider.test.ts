import { describe, expect, it } from 'vitest';
import { Slider } from '@/scaffold/ui/Slider';

// Vitest coverage for `Slider.setRange` (#178), the constructor's
// snap-point validation pass (#200), and `Slider.setSnapPoints` (#200).
// Other Slider behavior — drag-tick accumulation, snap-detent escape,
// ray-grab — is exercised indirectly via per-scene mount/unmount; these
// three surfaces are new module-level state mutation that benefit from
// direct coverage.
//
// Note: `setSnapPoints`'s "no mid-drag rebase" invariant (plan §2.4)
// requires a stubbed `Pointer`; the test setup cost outweighs the
// payoff. Verified by source inspection (the method does not write
// `lastPointerAxisX`) and by the multi-pointer-VR smoke-check on the
// Cloudflare PR preview.

function makeSlider(overrides: Partial<{
  min: number;
  max: number;
  initial: number;
  snapDetent: number;
  snapPoints: readonly number[];
}> = {}) {
  return new Slider({
    label: 'test',
    min: -1.5,
    max: 1.5,
    initial: 1.0,
    snapDetent: 0.05,
    snapPoints: [0],
    grabRadiusMultiplier: 2.75,
    ...overrides,
  });
}

describe('Slider.setRange', () => {
  it('updates min and max so subsequent setValue clamps to the new bounds', () => {
    const slider = makeSlider({ initial: 0 });
    slider.setRange(-1, 1);
    slider.setValue(2);
    expect(slider.value).toBe(1);
    slider.setValue(-2);
    expect(slider.value).toBe(-1);
  });

  it('clamps the current value into the new range when it falls outside', () => {
    // initial = 1.4, range [-1.5, 1.5]. Shrink to [-1.2, 1.2] — 1.4 clamps to 1.2.
    const slider = makeSlider({ initial: 1.4 });
    expect(slider.value).toBeCloseTo(1.4);
    slider.setRange(-1.2, 1.2);
    expect(slider.value).toBeCloseTo(1.2);
  });

  it('leaves the current value untouched when it is inside the new range', () => {
    const slider = makeSlider({ initial: 0.5 });
    slider.setRange(-1.2, 1.2);
    expect(slider.value).toBeCloseTo(0.5);
  });

  it('re-applies snap to the clamped value', () => {
    // Park inside the [0]-snap detent (|v| < 0.05), then expand the range —
    // the value should stay snapped to 0 after re-snap.
    const slider = makeSlider({ initial: 0.02 });
    expect(slider.value).toBe(0);
    slider.setRange(-2, 2);
    expect(slider.value).toBe(0);
  });

  it('throws when min >= max', () => {
    const slider = makeSlider();
    expect(() => slider.setRange(1, 1)).toThrow(/Slider\.setRange/);
    expect(() => slider.setRange(2, 1)).toThrow(/Slider\.setRange/);
  });

  it('throws on non-finite bounds', () => {
    const slider = makeSlider();
    expect(() => slider.setRange(NaN, 1)).toThrow(/Slider\.setRange/);
    expect(() => slider.setRange(-1, Infinity)).toThrow(/Slider\.setRange/);
  });
});

describe('Slider constructor — snap-point validation (#200)', () => {
  it('throws on non-finite snap points', () => {
    expect(() => makeSlider({ snapPoints: [NaN] })).toThrow(/non-finite/);
    expect(() => makeSlider({ snapPoints: [Infinity] })).toThrow(/non-finite/);
    expect(() => makeSlider({ snapPoints: [-Infinity] })).toThrow(/non-finite/);
  });

  it('throws on snap points outside [min, max] — boundary-adjacent regression', () => {
    // range = [-1.5, 1.5]; 1.02 sits inside the range so use a tighter
    // construct to mirror the GPT #1 counterexample (range = [-1, 1],
    // snap = 1.02, detent = 0.05 → rawValue=1 would silently snap to
    // 1.02 outside range under v1's reasoning). v2 rejects at ctor.
    expect(() =>
      makeSlider({ min: -1, max: 1, initial: 0, snapPoints: [1.02] }),
    ).toThrow(/outside range/);
  });

  it('accepts snap points exactly at min or max (inclusive bounds)', () => {
    // The canonical "park at the boundary" detent must work.
    expect(() =>
      makeSlider({ min: -1, max: 1, initial: 0, snapPoints: [1] }),
    ).not.toThrow();
    expect(() =>
      makeSlider({ min: -1, max: 1, initial: 0, snapPoints: [-1] }),
    ).not.toThrow();
  });

  it('throws on snap points spaced under 2 * snapDetent', () => {
    // snapDetent = 0.05 → adjacent points must be >= 0.1 apart.
    expect(() =>
      makeSlider({ snapPoints: [0, 0.05] }),
    ).toThrow(/would.*overlap/);
  });

  it('accepts snap points spaced exactly 2 * snapDetent (boundary)', () => {
    // Strict-< on the overlap check: gap == 2 * snapDetent is the
    // touch-but-don't-overlap boundary, matching applySnap's strict-<.
    expect(() => makeSlider({ snapPoints: [0, 0.1] })).not.toThrow();
  });
});

describe('Slider.setSnapPoints (#200)', () => {
  it('replaces the snap-point set; new value snaps within new detent', () => {
    // Initial 0.52 is outside the [0]-detent window (|0.52 - 0| > 0.05),
    // so value === 0.52 at construction. After setSnapPoints([0, 0.5]),
    // 0.52 sits inside the new 0.5-detent window (|0.52 - 0.5| < 0.05)
    // and snaps to 0.5. A no-op implementation would leave value at 0.52.
    const slider = makeSlider({ initial: 0.52 });
    expect(slider.value).toBeCloseTo(0.52);
    slider.setSnapPoints([0, 0.5]);
    expect(slider.value).toBe(0.5);
  });

  it('releases an old snap when the snap point is no longer in the set', () => {
    // initial 0.02 snaps to 0 against [0]-detent (currentValue = 0,
    // rawValue = 0.02 underneath per the rawValue/currentValue split).
    // After setSnapPoints([0.5]), 0 is no longer a detent, so
    // currentValue returns to rawValue (0.02).
    const slider = makeSlider({ initial: 0.02 });
    expect(slider.value).toBe(0);
    slider.setSnapPoints([0.5]);
    expect(slider.value).toBeCloseTo(0.02);
  });

  it('empty array disables snapping; value returns to rawValue', () => {
    const slider = makeSlider({ initial: 0.02 });
    expect(slider.value).toBe(0);
    slider.setSnapPoints([]);
    expect(slider.value).toBeCloseTo(0.02);
  });

  it('re-applies snap to current rawValue when transitioning out of empty', () => {
    const slider = makeSlider({ snapPoints: [], initial: 0.51 });
    expect(slider.value).toBeCloseTo(0.51);
    slider.setSnapPoints([0.5]);
    expect(slider.value).toBe(0.5);
  });

  it('throws on adjacent points spaced under 2 * snapDetent', () => {
    const slider = makeSlider();
    expect(() => slider.setSnapPoints([0, 0.05])).toThrow(/would.*overlap/);
    expect(() => slider.setSnapPoints([0, 0.1])).not.toThrow();
  });

  it('throws on duplicate values in input (gap=0 trips overlap check)', () => {
    const slider = makeSlider();
    expect(() => slider.setSnapPoints([0, 0])).toThrow(/would.*overlap/);
  });

  it('accepts unsorted input — overlap check operates on sorted copy', () => {
    const slider = makeSlider({ initial: 0.51 });
    expect(() => slider.setSnapPoints([0.5, 0, -0.5])).not.toThrow();
    expect(slider.value).toBe(0.5);
  });

  it('throws on non-finite snap points', () => {
    const slider = makeSlider();
    expect(() => slider.setSnapPoints([NaN])).toThrow(/non-finite/);
    expect(() => slider.setSnapPoints([Infinity])).toThrow(/non-finite/);
    expect(() => slider.setSnapPoints([-Infinity])).toThrow(/non-finite/);
  });

  it('throws on boundary-adjacent out-of-range snap point (GPT #1)', () => {
    // The v1 regression: range = [-1, 1], snapDetent = 0.05, snap = 1.02.
    // rawValue clamped to 1 would silently match |1 - 1.02| = 0.02 < 0.05
    // and emit 1.02 — outside the slider's stated range. v2 rejects
    // the snap at validation time.
    const slider = makeSlider({ min: -1, max: 1, initial: 0 });
    expect(() => slider.setSnapPoints([1.02])).toThrow(/outside range/);
    // Exact-max remains valid (inclusive bounds).
    expect(() => slider.setSnapPoints([1])).not.toThrow();
  });
});
