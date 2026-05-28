import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// `troika-three-text` reaches for `self`, a browser-only global, in
// its UMD `now$1` helper. The default vitest environment is Node,
// so any `new Text()` would blow up at construction time. Stub the
// module with an Object3D-backed surrogate; matches the pattern in
// `TapButton.test.ts` / `Preset.test.ts` / `PointerMigration.test.ts`.
// None of this file's assertions touch text rendering — `Object3D`
// gives the position/rotation/quaternion machinery the faceCamera
// algorithm needs, plus a `text` string property the label-text
// assertions read.
vi.mock('troika-three-text', () => {
  class StubText extends THREE.Object3D {
    text = '';
    fontSize = 0;
    color = 0xffffff;
    anchorX: string | undefined;
    anchorY: string | undefined;
    outlineWidth: string | undefined;
    outlineColor: number | undefined;
    sync() {}
    dispose() {}
  }
  return { Text: StubText };
});

import { Text } from 'troika-three-text';
import { Slider } from '@/scaffold/ui/Slider';
import type { Pointer } from '@/shell/Pointer';

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

// Thumb-label test scaffolding (#276 plan §4.2). Tests locate scene-
// graph nodes by `userData.role` traversal, not by positional indexing.

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

function findThumbLabel(slider: Slider): Text {
  let found: Text | null = null;
  slider.group.traverse((obj) => {
    if (obj.userData?.role === 'slider-thumb-label') {
      found = obj as Text;
    }
  });
  if (!found) throw new Error('slider-thumb-label role not found');
  return found;
}

// Stub Pointer aimed at a given world position along world −Z; thumb
// at world origin → ray hits the thumb's grab sphere.
interface StubPointer extends Pointer {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}
function stubPointer(
  origin: [number, number, number],
  direction: [number, number, number],
): StubPointer {
  return {
    id: 'test',
    origin: new THREE.Vector3(...origin),
    direction: new THREE.Vector3(...direction).normalize(),
    pulse: vi.fn(),
    getRayOrigin(target) {
      return target.copy(this.origin);
    },
    getRayDirection(target) {
      return target.copy(this.direction);
    },
  };
}
const HIT_RAY = (): StubPointer => stubPointer([0, 0, 1], [0, 0, -1]);

describe('Slider thumb label (#276)', () => {
  it('thumb is a single opaque sphere with a Text label child', () => {
    const slider = makeSlider({ thumbLabel: 'x²', baseColor: 0xff0000 });
    const thumb = findThumbMesh(slider);
    expect(thumb).toBeInstanceOf(THREE.Mesh);
    expect(thumb.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect((thumb.geometry as THREE.SphereGeometry).parameters.radius).toBe(
      0.025,
    );
    const mat = thumb.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(false);
    expect(mat.color.getHex()).toBe(0xff0000);
    // Exactly one child of the thumb mesh — the Text label.
    expect(thumb.children).toHaveLength(1);
    expect(thumb.children[0].userData?.role).toBe('slider-thumb-label');
  });

  it('label text matches thumbLabel; persists through hover', () => {
    // `initial: 0` parks the thumb at slider-local origin so HIT_RAY
    // (aimed at world (0,0,0) along −Z) reliably hits the grab sphere.
    const slider = makeSlider({ thumbLabel: 'θ', initial: 0 });
    const thumb = findThumbMesh(slider);
    const label = findThumbLabel(slider);
    expect(label.text).toBe('θ');

    slider.updateHover([HIT_RAY()]);
    expect(slider.isHovered).toBe(true);
    expect(label.text).toBe('θ');
    expect(label.parent).toBe(thumb);

    slider.updateHover([]);
    expect(slider.isHovered).toBe(false);
    expect(label.text).toBe('θ');
    expect(label.parent).toBe(thumb);
  });

  it('label persists through tryGrab / releaseFromPointer', () => {
    const slider = makeSlider({ thumbLabel: 'C', initial: 0 });
    const thumb = findThumbMesh(slider);
    const label = findThumbLabel(slider);
    const pointer = HIT_RAY();

    expect(slider.tryGrab(pointer)).toBe(true);
    expect(label.text).toBe('C');
    expect(label.parent).toBe(thumb);

    slider.releaseFromPointer(pointer);
    expect(label.text).toBe('C');
    expect(label.parent).toBe(thumb);
  });

  it('dispose() cleans up label, track, and thumb resources', () => {
    const slider = makeSlider({ thumbLabel: 'x' });
    const thumb = findThumbMesh(slider);
    const label = findThumbLabel(slider);
    // The track is the first child of the slider group (constructed
    // before the thumb in Slider's ctor).
    const track = slider.group.children.find(
      (c) => c instanceof THREE.Mesh && c !== thumb,
    ) as THREE.Mesh;
    expect(track).toBeDefined();

    const labelSpy = vi.spyOn(label, 'dispose');
    const thumbGeomSpy = vi.spyOn(thumb.geometry, 'dispose');
    const thumbMatSpy = vi.spyOn(thumb.material as THREE.Material, 'dispose');
    const trackGeomSpy = vi.spyOn(track.geometry, 'dispose');
    const trackMatSpy = vi.spyOn(track.material as THREE.Material, 'dispose');

    slider.dispose();

    expect(labelSpy).toHaveBeenCalledTimes(1);
    expect(thumbGeomSpy).toHaveBeenCalledTimes(1);
    expect(thumbMatSpy).toHaveBeenCalledTimes(1);
    expect(trackGeomSpy).toHaveBeenCalledTimes(1);
    expect(trackMatSpy).toHaveBeenCalledTimes(1);
  });

  // Test 5: world-frame billboard correctness under a plinth-tilt
  // parent. Replaces the v1-plan local-Euler assertion; world-frame
  // assertions are the only way to detect the v1 algorithmic bug
  // where local-Y rotation under a tilted parent diverges from
  // world-Y yaw (#276 roundtable convergent HIGH).
  it('faceCamera writes correct world-space billboard under plinth tilt', () => {
    const slider = makeSlider({ thumbLabel: 'x' });
    const thumb = findThumbMesh(slider);
    const label = findThumbLabel(slider);

    // Tilt parent: rotate the slider group 20° about world-X to
    // mimic the plinth's surface tilt.
    const scene = new THREE.Scene();
    const tiltParent = new THREE.Object3D();
    tiltParent.rotation.x = Math.PI / 9; // ≈ 20°
    scene.add(tiltParent);
    tiltParent.add(slider.group);

    const camera = new THREE.PerspectiveCamera();

    const labelWorld = new THREE.Vector3();
    const thumbWorld = new THREE.Vector3();
    const labelWorldQuat = new THREE.Quaternion();
    const labelUp = new THREE.Vector3();
    const labelForward = new THREE.Vector3();

    const assertWorldFrameBillboard = (
      camPos: [number, number, number],
      label0: Text,
    ): void => {
      camera.position.set(...camPos);
      scene.updateMatrixWorld(true);
      slider.faceCamera(camera);
      // updateMatrixWorld AFTER faceCamera so the label's transform
      // writes (rotation + position in thumb-local frame) propagate
      // to label.matrixWorld for the getWorldPosition / world-axis
      // reads below.
      scene.updateMatrixWorld(true);

      // Use getWorldPosition for both thumb and label — NOT local
      // `.position`. The plinth tilt makes the label's local frame
      // distinct from world frame, and the world-frame equator check
      // is what proves the algorithm correctly compensates the
      // parent rotation.
      label0.getWorldPosition(labelWorld);
      thumb.getWorldPosition(thumbWorld);
      label0.getWorldQuaternion(labelWorldQuat);

      // Label world-up = local +Y transformed by world quaternion.
      labelUp.set(0, 1, 0).applyQuaternion(labelWorldQuat);
      // Yaw-only convention: label-up stays world-Y within float
      // tolerance regardless of parent tilt.
      expect(labelUp.x).toBeCloseTo(0, 5);
      expect(labelUp.y).toBeCloseTo(1, 5);
      expect(labelUp.z).toBeCloseTo(0, 5);

      // Label world-forward = local +Z transformed by world
      // quaternion. Projected onto world-XZ, it should align with
      // the camera-to-thumb XZ direction.
      labelForward.set(0, 0, 1).applyQuaternion(labelWorldQuat);
      labelForward.y = 0;
      labelForward.normalize();
      const camFacing = new THREE.Vector3(
        camPos[0] - thumbWorld.x,
        0,
        camPos[2] - thumbWorld.z,
      ).normalize();
      expect(labelForward.dot(camFacing)).toBeGreaterThan(0.999);

      // Label rides the sphere equator: world Y-offset from thumb
      // is near zero. This is the GPT-roundtable position-vs-
      // orientation conflict gate.
      expect(labelWorld.y - thumbWorld.y).toBeCloseTo(0, 5);

      // Magnitude of world offset = thumbRadius + standoff.
      const offsetWorld = new THREE.Vector3().subVectors(labelWorld, thumbWorld);
      expect(offsetWorld.length()).toBeCloseTo(0.025 + 0.0015, 4);
    };

    // Standing eye-level pose.
    assertWorldFrameBillboard([0, 1.5, 1.0], label);
    // Tall pose — vertical camera move; label still rides the equator.
    assertWorldFrameBillboard([0, 1.8, 1.0], label);
    // Crouched pose.
    assertWorldFrameBillboard([0, 1.3, 1.0], label);
    // Yaw-change pose — camera rotated in XZ around the thumb.
    assertWorldFrameBillboard([1.0, 1.5, 1.0], label);
  });

  it('empty-string label is a structurally valid opt-out', () => {
    const slider = makeSlider({ thumbLabel: '' });
    const label = findThumbLabel(slider);
    expect(label.text).toBe('');
  });

  it('ctor places label outside sphere envelope before faceCamera', () => {
    const slider = makeSlider({ thumbLabel: 'x²' });
    const label = findThumbLabel(slider);
    // Neutral local +Z placement set in ctor; faceCamera will refine
    // it once the scene is mounted + a camera available, but the
    // constructor-time default sits OUTSIDE the sphere envelope so
    // the first render lands cleanly even without a faceCamera
    // dispatch.
    expect(label.position.x).toBe(0);
    expect(label.position.y).toBe(0);
    expect(label.position.z).toBeCloseTo(0.025 + 0.0015, 6);
    expect(label.position.length()).toBeGreaterThan(0.025);
  });
});
