import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  _cacheStateForTests,
  _clearCacheForTests,
  _setCanvasFactoryForTests,
  acquireBakedSymbolTexture,
  releaseBakedSymbolTexture,
} from '@/scaffold/ui/bakedSymbolTexture';
import { Slider } from '@/scaffold/ui/Slider';

// Slider's #278 emblazon-texture path calls
// `document.createElement('canvas')` in
// `bakedSymbolTexture.renderTexture`. The Node Vitest environment
// has no `document`; inject a stub canvas factory so the
// rendering path runs end-to-end. Drain the cache between tests
// so the legacy `makeSlider()` callsites in this file (which
// don't call `slider.dispose()`) don't pollute cache state
// across tests — the new #278 tests assert specific size/refCount
// values from a clean state and would fail without the drain.
function makeStubCanvas(): HTMLCanvasElement {
  const ctx = {
    fillRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 0 }),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    set lineWidth(_v: number) {},
    set lineJoin(_v: string) {},
  };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  _setCanvasFactoryForTests(makeStubCanvas);
});

afterEach(() => {
  _clearCacheForTests();
  _setCanvasFactoryForTests(null);
});

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
  thumbLabel: string;
  baseColor: number;
}> = {}) {
  return new Slider({
    label: 'test',
    min: -1.5,
    max: 1.5,
    initial: 1.0,
    snapDetent: 0.05,
    snapPoints: [0],
    grabRadiusMultiplier: 2.75,
    thumbLabel: 'test',
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

// Thumb texture test scaffolding (#278). Tests locate the thumb
// mesh by `userData.role` traversal; the per-slider symbol is
// exposed on `thumb.userData.thumbLabel` for inline assertion
// (replacing the #276-era `slider-thumb-label` role marker that
// pointed at the deleted Text child).

function findThumbMesh(slider: Slider): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  slider.group.traverse((obj) => {
    if (obj.userData?.role === 'slider-thumb') {
      found = obj as THREE.Mesh;
    }
  });
  if (!found) throw new Error('slider-thumb role not found');
  return found;
}

describe('Slider thumb texture (#278)', () => {
  it('thumb is a single opaque sphere with a baked emblazon texture', () => {
    const slider = makeSlider({ thumbLabel: 'x²', baseColor: 0xff0000 });
    const thumb = findThumbMesh(slider);
    expect(thumb).toBeInstanceOf(THREE.Mesh);
    expect(thumb.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect((thumb.geometry as THREE.SphereGeometry).parameters.radius).toBe(
      0.025,
    );
    expect(thumb.userData.thumbLabel).toBe('x²');

    const mat = thumb.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(false);
    // Color is neutral white — the baked texture supplies the
    // diffuse body color, not mat.color.
    expect(mat.color.getHex()).toBe(0xffffff);
    expect(mat.map).not.toBeNull();
    // The thumb mesh has no children (the #276 Text child is gone).
    expect(thumb.children).toHaveLength(0);

    // Reference-equality: a fresh acquire of the same key returns
    // the cached texture instance. Refcount ladders: slider's
    // acquire = 1, this duplicate acquire = 2; release one and
    // expect the slider's reference still alive.
    const duplicate = acquireBakedSymbolTexture('x²', 0xff0000);
    expect(mat.map).toBe(duplicate);
    releaseBakedSymbolTexture('x²', 0xff0000);
    expect(_cacheStateForTests().refCounts['x²|0xff0000']).toBe(1);
  });

  it('dispose() releases the texture; refcount ladders through cleanup', () => {
    // Pre-acquire to inflate refcount, so slider.dispose() doesn't
    // collapse refcount to zero — verifies the per-slider release
    // doesn't dispose the shared texture while another consumer
    // still holds it.
    acquireBakedSymbolTexture('θ', 0xaaaaaa); // refCount = 1
    const slider = makeSlider({ thumbLabel: 'θ', baseColor: 0xaaaaaa });
    expect(_cacheStateForTests().refCounts['θ|0xaaaaaa']).toBe(2);

    const thumb = findThumbMesh(slider);
    const texture = (thumb.material as THREE.MeshStandardMaterial).map!;
    const textureSpy = vi.spyOn(texture, 'dispose');

    slider.dispose();
    expect(_cacheStateForTests().refCounts['θ|0xaaaaaa']).toBe(1);
    expect(textureSpy).not.toHaveBeenCalled();

    releaseBakedSymbolTexture('θ', 0xaaaaaa);
    expect(_cacheStateForTests().size).toBe(0);
    expect(textureSpy).toHaveBeenCalledTimes(1);
  });

  it('Slider.dispose() is idempotent — double-dispose is a no-op', () => {
    // Pre-acquire so the slider's release doesn't go to zero on
    // the first dispose; we want to assert the SECOND dispose
    // doesn't decrement again.
    acquireBakedSymbolTexture('C', 0xeeaa33); // refCount = 1
    const slider = makeSlider({ thumbLabel: 'C', baseColor: 0xeeaa33 });
    expect(_cacheStateForTests().refCounts['C|0xeeaa33']).toBe(2);

    slider.dispose();
    expect(_cacheStateForTests().refCounts['C|0xeeaa33']).toBe(1);

    // Second dispose — the _disposed guard short-circuits.
    slider.dispose();
    expect(_cacheStateForTests().refCounts['C|0xeeaa33']).toBe(1);

    releaseBakedSymbolTexture('C', 0xeeaa33);
    expect(_cacheStateForTests().size).toBe(0);
  });

  // Static-orientation invariant: the glyph faces slider-local
  // +Y, which under the slot-frame rotation a cluster scene
  // applies (`Plinth.computePlinthSlotTransform` with
  // orientation='surface' = −tilt about world +X) becomes the
  // drafting-board surface normal in world. The thumb's own
  // rotation is constant — no per-frame billboard — so the glyph
  // stays fixed on the sphere as the camera moves.
  it('thumb is statically oriented with the glyph at slider-local +Y', () => {
    const slider = makeSlider({ thumbLabel: 'x' });
    const thumb = findThumbMesh(slider);

    // The thumb's own rotation: about local +X by −π/2.
    expect(thumb.rotation.x).toBeCloseTo(-Math.PI / 2, 8);
    expect(thumb.rotation.y).toBeCloseTo(0, 8);
    expect(thumb.rotation.z).toBeCloseTo(0, 8);

    // The geometry rotation (rotateY(−π/2)) moved the texture's
    // UV (0.5, 0.5) point from sphere-local +X to sphere-local
    // +Z. Applying the thumb's quaternion to sphere-local +Z
    // should yield slider-local +Y.
    const glyphDirSliderLocal = new THREE.Vector3(0, 0, 1).applyQuaternion(
      thumb.quaternion,
    );
    expect(glyphDirSliderLocal.x).toBeCloseTo(0, 5);
    expect(glyphDirSliderLocal.y).toBeCloseTo(1, 5);
    expect(glyphDirSliderLocal.z).toBeCloseTo(0, 5);
  });

  it('glyph faces the drafting-board surface normal under plinth tilt', () => {
    // Reproduce the cluster mounting: slider-group rotated by
    // −tilt about world +X (matches
    // Plinth.computePlinthSlotTransform with orientation='surface').
    // The thumb's static orientation, composed with this parent
    // rotation, should put the glyph direction at world
    // (0, cos(tilt), −sin(tilt)) — the surface normal direction
    // the Plinth comment documents.
    const slider = makeSlider({ thumbLabel: 'θ' });
    const thumb = findThumbMesh(slider);

    const tilt = (20 * Math.PI) / 180; // PLINTH_TILT_DEFAULT
    const scene = new THREE.Scene();
    scene.add(slider.group);
    slider.group.rotation.x = -tilt;
    scene.updateMatrixWorld(true);

    // Walk the glyph direction from mesh-local +Z to world.
    const glyphDirWorld = new THREE.Vector3(0, 0, 1);
    const thumbWorldQuat = new THREE.Quaternion();
    thumb.getWorldQuaternion(thumbWorldQuat);
    glyphDirWorld.applyQuaternion(thumbWorldQuat);

    expect(glyphDirWorld.x).toBeCloseTo(0, 5);
    expect(glyphDirWorld.y).toBeCloseTo(Math.cos(tilt), 5);
    expect(glyphDirWorld.z).toBeCloseTo(-Math.sin(tilt), 5);
  });

  it('thumb orientation does NOT track camera movement', () => {
    // Static-orientation contract: there is no faceCamera method;
    // the thumb's quaternion never changes after construction (the
    // only writes touching the thumb mesh during update() are
    // syncThumbPosition's position.x writes).
    const slider = makeSlider({ thumbLabel: 'y' });
    const thumb = findThumbMesh(slider);

    const q0 = thumb.quaternion.clone();

    // Drive the slider's update path; quaternion must stay put.
    slider.setValue(1.0);
    slider.setValue(-1.0);
    slider.update();

    expect(thumb.quaternion.x).toBeCloseTo(q0.x, 8);
    expect(thumb.quaternion.y).toBeCloseTo(q0.y, 8);
    expect(thumb.quaternion.z).toBeCloseTo(q0.z, 8);
    expect(thumb.quaternion.w).toBeCloseTo(q0.w, 8);

    // The Slider class no longer exposes a `faceCamera` method.
    expect(
      (slider as unknown as { faceCamera?: unknown }).faceCamera,
    ).toBeUndefined();
  });

  it('empty-string label is a structurally valid opt-out', () => {
    const slider = makeSlider({ thumbLabel: '' });
    const thumb = findThumbMesh(slider);
    expect(thumb.userData.thumbLabel).toBe('');
    expect((thumb.material as THREE.MeshStandardMaterial).map).not.toBeNull();
    // Cache acquired the empty-string key.
    expect(_cacheStateForTests().refCounts['|0xeeaa33']).toBe(1);
  });
});
