import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Pointer } from '@/shell/Pointer';
import { Slider, type ThumbShape } from '@/scaffold/ui/Slider';

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
  thumbShape: ThumbShape;
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
    ...overrides,
  });
}

// Stable, role-marked discovery for the composite thumb (#256). The
// `slider-thumb` marker lands on the thumb Group; `slider-thumb-outer`
// lands on the outer translucent sphere mesh. Tests never index
// `slider.group.children` by position or sniff geometry types.
function findThumbGroup(slider: Slider): THREE.Group {
  let found: THREE.Group | null = null;
  slider.group.traverse((obj) => {
    if (obj.userData?.role === 'slider-thumb') {
      found = obj as THREE.Group;
    }
  });
  if (!found) throw new Error('slider-thumb role not found');
  return found;
}

function findThumbOuterMesh(
  slider: Slider,
): THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> {
  let found: THREE.Mesh | null = null;
  slider.group.traverse((obj) => {
    if (obj.userData?.role === 'slider-thumb-outer') {
      found = obj as THREE.Mesh;
    }
  });
  if (!found) throw new Error('slider-thumb-outer role not found');
  return found as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
}

// Per-vertex radial check on a BufferGeometry: every vertex must be
// inside a sphere of `radius + ε` around origin. This is the true
// envelope-containment check from the v3 plan §4.2 Test 6 — a
// per-vertex loop rather than a bounding-box-corner over-approximation
// that would let a diagonal vertex silently violate the sphere if
// future tuning bumps `coneRadius` without bumping `coneHeight`.
function assertEveryVertexWithinRadius(
  geometry: THREE.BufferGeometry,
  radius: number,
): void {
  const positions = geometry.attributes.position;
  if (!positions) throw new Error('geometry has no position attribute');
  const epsilon = 1e-6;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    expect(r, `vertex ${i} at (${x}, ${y}, ${z})`).toBeLessThanOrEqual(
      radius + epsilon,
    );
  }
}

interface MockPointer extends Pointer {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}

function mockPointer(
  origin: [number, number, number],
  direction: [number, number, number],
  id = 'test',
): MockPointer {
  return {
    id,
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

// Ray aimed at world origin. Fires when the caller passes
// `initial: 0` to makeSlider — that's outside the [0]-detent's
// half-width (0.05) so currentValue stays at 0 and
// syncThumbPosition writes thumb.position.x = 0. The default
// makeSlider config (initial: 1.0) places the thumb at x ≈ +0.1,
// where this ray would miss; tests using hittingRay() must
// override initial: 0.
const hittingRay = (): MockPointer => mockPointer([0, 0, 1], [0, 0, -1]);
const missingRay = (): MockPointer => mockPointer([10, 0, 1], [0, 0, -1]);

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

// Vitest coverage for the composite thumb visual (#256 v3): each
// shape's group composition, depth/render flags, hover-target
// wiring, hover-state opacity bump (sphere only), dispose cleanup
// (including track preservation), and the per-vertex radial
// envelope assertion that bounds future arrow-proportion retunes.

describe('Slider thumb composition (#256)', () => {
  const BASE_COLOR = 0xd55e00; // VERMILLION; arbitrary axis tint for test.
  const THUMB_RADIUS = 0.025; // Slider's DEFAULT_THUMB_RADIUS.

  describe('arrow-x composite', () => {
    it('produces a Group with outer translucent sphere + interior arrow', () => {
      const slider = makeSlider({
        thumbShape: 'arrow-x',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const thumbGroup = findThumbGroup(slider);
      expect(thumbGroup.children.length).toBe(2);
    });

    it('outer mesh has correct depth + transparency + render flags', () => {
      const slider = makeSlider({
        thumbShape: 'arrow-x',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const outerMesh = findThumbOuterMesh(slider);
      expect(outerMesh.geometry.parameters.radius).toBeCloseTo(THUMB_RADIUS);
      expect(outerMesh.material.transparent).toBe(true);
      expect(outerMesh.material.opacity).toBeCloseTo(0.3);
      expect(outerMesh.material.depthWrite).toBe(false);
      expect(outerMesh.material.side).toBe(THREE.FrontSide);
      expect(outerMesh.renderOrder).toBe(1);
      expect(outerMesh.material.color.getHex()).toBe(BASE_COLOR);
    });

    it('interior arrow is opaque, baseColor-tinted, and per-vertex radially contained', () => {
      const slider = makeSlider({
        thumbShape: 'arrow-x',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const thumbGroup = findThumbGroup(slider);
      // Interior is the thumb-group child without the `slider-thumb-outer`
      // role marker — we never index by position.
      const interior = thumbGroup.children.find(
        (c) => c.userData?.role !== 'slider-thumb-outer',
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      expect(interior).toBeDefined();
      expect(interior.material.transparent).toBe(false);
      expect(interior.material.color.getHex()).toBe(BASE_COLOR);
      // Per-vertex radial containment — every vertex must sit inside a
      // sphere of radius `thumbRadius + ε` around the group origin.
      // True envelope check, not box-corner over-approximation.
      assertEveryVertexWithinRadius(interior.geometry, THUMB_RADIUS);
    });
  });

  describe('sphere composite', () => {
    it('produces a Group with one child (outer translucent sphere only)', () => {
      const slider = makeSlider({
        thumbShape: 'sphere',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const thumbGroup = findThumbGroup(slider);
      expect(thumbGroup.children.length).toBe(1);
      const outerMesh = findThumbOuterMesh(slider);
      expect(thumbGroup.children[0]).toBe(outerMesh);
    });

    it('outer mesh carries the same depth + transparency + render flags as arrow-*', () => {
      const slider = makeSlider({
        thumbShape: 'sphere',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const outerMesh = findThumbOuterMesh(slider);
      expect(outerMesh.material.transparent).toBe(true);
      expect(outerMesh.material.opacity).toBeCloseTo(0.3);
      expect(outerMesh.material.depthWrite).toBe(false);
      expect(outerMesh.material.side).toBe(THREE.FrontSide);
      expect(outerMesh.renderOrder).toBe(1);
      expect(outerMesh.material.color.getHex()).toBe(BASE_COLOR);
    });

    it('default thumbShape (no override) is sphere', () => {
      // Slider's DEFAULT_THUMB_SHAPE is 'sphere'; verify the default
      // branch produces the same single-child composite. Tangent-planes
      // / gradient-levels / saddle-extrema rely on this default
      // implicitly via `thumbShape: 'sphere'` (they pass it explicitly,
      // but the default fallback is the same code path).
      const slider = makeSlider({ baseColor: BASE_COLOR, initial: 0 });
      const thumbGroup = findThumbGroup(slider);
      expect(thumbGroup.children.length).toBe(1);
    });
  });

  describe('hover-target wiring per shape (emissive flips on the right material)', () => {
    it('arrow-x: emissive flips on interior arrow; outer envelope stays at zero', () => {
      const slider = makeSlider({
        thumbShape: 'arrow-x',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const thumbGroup = findThumbGroup(slider);
      const outerMesh = findThumbOuterMesh(slider);
      const interior = thumbGroup.children.find(
        (c) => c.userData?.role !== 'slider-thumb-outer',
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

      // Idle.
      expect(interior.material.emissive.getHex()).toBe(0x000000);
      expect(outerMesh.material.emissive.getHex()).toBe(0x000000);

      slider.updateHover([hittingRay()]);
      expect(slider.isHovered).toBe(true);
      // Interior lights up.
      expect(interior.material.emissive.getHex()).not.toBe(0x000000);
      // Outer envelope stays unlit — the steady-state translucent body
      // should not flicker on hover.
      expect(outerMesh.material.emissive.getHex()).toBe(0x000000);

      slider.updateHover([missingRay()]);
      expect(slider.isHovered).toBe(false);
      expect(interior.material.emissive.getHex()).toBe(0x000000);
      expect(outerMesh.material.emissive.getHex()).toBe(0x000000);
    });

    it('sphere: emissive flips on outer translucent sphere', () => {
      const slider = makeSlider({
        thumbShape: 'sphere',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const outerMesh = findThumbOuterMesh(slider);

      expect(outerMesh.material.emissive.getHex()).toBe(0x000000);
      slider.updateHover([hittingRay()]);
      expect(outerMesh.material.emissive.getHex()).not.toBe(0x000000);
      slider.updateHover([missingRay()]);
      expect(outerMesh.material.emissive.getHex()).toBe(0x000000);
    });
  });

  describe('hover-state opacity bump fires iff applyOpacityBump is true', () => {
    it('sphere: outer opacity bumps idle → hover → grab → release', () => {
      const slider = makeSlider({
        thumbShape: 'sphere',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const outerMesh = findThumbOuterMesh(slider);

      // Idle.
      expect(outerMesh.material.opacity).toBeCloseTo(0.3);

      // Hover.
      slider.updateHover([hittingRay()]);
      expect(outerMesh.material.opacity).toBeCloseTo(0.5);

      // Grab — `tryGrab` sets grabbedBy and calls
      // refreshThumbEmissive; the grabbed-branch fires (it's
      // checked before the hovered-branch in the if/else), so
      // emissive flips to grabbed and opacity bumps to the grab
      // value. The `hovered` field stays true underneath —
      // updateHover would short-circuit while grabbed, and only
      // releaseFromPointer explicitly clears it.
      const grabber = hittingRay();
      expect(slider.tryGrab(grabber)).toBe(true);
      expect(outerMesh.material.opacity).toBeCloseTo(0.7);

      // Release.
      slider.releaseFromPointer(grabber);
      expect(outerMesh.material.opacity).toBeCloseTo(0.3);
    });

    it('arrow-x (control case): outer opacity stays at idle through hover/grab', () => {
      // The opacity bump should NOT fire for `arrow-*` thumbs —
      // their hover target is the opaque interior, so the outer
      // translucent body stays at its steady-state opacity regardless
      // of state. Tests the `applyOpacityBump === false` contract.
      const slider = makeSlider({
        thumbShape: 'arrow-x',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const outerMesh = findThumbOuterMesh(slider);

      expect(outerMesh.material.opacity).toBeCloseTo(0.3);

      slider.updateHover([hittingRay()]);
      expect(slider.isHovered).toBe(true);
      expect(outerMesh.material.opacity).toBeCloseTo(0.3);

      const grabber = hittingRay();
      expect(slider.tryGrab(grabber)).toBe(true);
      expect(outerMesh.material.opacity).toBeCloseTo(0.3);

      slider.releaseFromPointer(grabber);
      expect(outerMesh.material.opacity).toBeCloseTo(0.3);
    });
  });

  describe('dispose() cleans up thumb composite AND preserves track disposal', () => {
    it('arrow-x: both children\'s geometries + materials disposed; track also disposed', () => {
      const slider = makeSlider({
        thumbShape: 'arrow-x',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const thumbGroup = findThumbGroup(slider);
      const outerMesh = findThumbOuterMesh(slider);
      const interior = thumbGroup.children.find(
        (c) => c.userData?.role !== 'slider-thumb-outer',
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

      // Spy on every disposable resource — both composite children plus
      // the track. The §3.6 / §4.1 v3 invariant: dispose() preserves the
      // track lines unchanged, only the thumb-owned resources move to
      // `disposeThumb()`. This test catches a regression where an
      // implementer reads "DROP the old thumb dispose lines" as "replace
      // the whole dispose() body" and silently leaks the track.
      const outerGeoSpy = vi.spyOn(outerMesh.geometry, 'dispose');
      const outerMatSpy = vi.spyOn(outerMesh.material, 'dispose');
      const interiorGeoSpy = vi.spyOn(interior.geometry, 'dispose');
      const interiorMatSpy = vi.spyOn(interior.material, 'dispose');
      // Track sits as a child of slider.group; the slider's own
      // `track` field is private, so locate via traversal — exclude
      // the thumb group, exclude the thumb-outer, and what remains is
      // the track mesh.
      const track = slider.group.children.find(
        (c) =>
          c.userData?.role !== 'slider-thumb' &&
          c instanceof THREE.Mesh,
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      expect(track).toBeDefined();
      const trackGeoSpy = vi.spyOn(track.geometry, 'dispose');
      const trackMatSpy = vi.spyOn(track.material, 'dispose');

      slider.dispose();

      expect(outerGeoSpy).toHaveBeenCalledTimes(1);
      expect(outerMatSpy).toHaveBeenCalledTimes(1);
      expect(interiorGeoSpy).toHaveBeenCalledTimes(1);
      expect(interiorMatSpy).toHaveBeenCalledTimes(1);
      expect(trackGeoSpy).toHaveBeenCalledTimes(1);
      expect(trackMatSpy).toHaveBeenCalledTimes(1);
    });

    it('sphere: outer mesh disposed; track also disposed', () => {
      const slider = makeSlider({
        thumbShape: 'sphere',
        baseColor: BASE_COLOR,
        initial: 0,
      });
      const outerMesh = findThumbOuterMesh(slider);
      const outerGeoSpy = vi.spyOn(outerMesh.geometry, 'dispose');
      const outerMatSpy = vi.spyOn(outerMesh.material, 'dispose');
      const track = slider.group.children.find(
        (c) =>
          c.userData?.role !== 'slider-thumb' &&
          c instanceof THREE.Mesh,
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      const trackGeoSpy = vi.spyOn(track.geometry, 'dispose');
      const trackMatSpy = vi.spyOn(track.material, 'dispose');

      slider.dispose();

      expect(outerGeoSpy).toHaveBeenCalledTimes(1);
      expect(outerMatSpy).toHaveBeenCalledTimes(1);
      expect(trackGeoSpy).toHaveBeenCalledTimes(1);
      expect(trackMatSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('interior arrow per-vertex radial envelope (per shape)', () => {
    // For each `arrow-*` shape, the per-vertex check confirms every
    // vertex of the merged shaft + 2-cones geometry (after the per-
    // axis rotation) is within `thumbRadius` of the group origin.
    // This is the regression guard: a future maintainer can't drift
    // any single arrow-proportion constant past the §3.3 envelope
    // along any direction (axial or diagonal) without tripping the
    // assertion.
    it.each<ThumbShape>(['arrow-x', 'arrow-y', 'arrow-z'])(
      '%s: every vertex inside thumbRadius',
      (shape) => {
        const slider = makeSlider({
          thumbShape: shape,
          baseColor: BASE_COLOR,
          initial: 0,
        });
        const thumbGroup = findThumbGroup(slider);
        const interior = thumbGroup.children.find(
          (c) => c.userData?.role !== 'slider-thumb-outer',
        ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
        assertEveryVertexWithinRadius(interior.geometry, THUMB_RADIUS);
      },
    );
  });
});
