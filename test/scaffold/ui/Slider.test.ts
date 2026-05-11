import { describe, expect, it } from 'vitest';
import { Slider } from '@/scaffold/ui/Slider';

// Vitest coverage for `Slider.setRange` (#178). Other Slider behavior —
// drag-tick accumulation, snap-detent escape, ray-grab — is exercised
// indirectly via per-scene mount/unmount; setRange is new module-level
// state mutation that benefits from direct coverage.

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
