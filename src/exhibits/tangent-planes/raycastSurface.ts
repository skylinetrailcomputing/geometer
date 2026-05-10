import type { MathVec3 } from '@/scaffold/math/frames';

// CPU-side raymarch + bisect against an axis-aligned bounded implicit surface
// f(p) = 0 (#147). Mirrors the GPU pass in `scaffold/render/ImplicitSurface.ts`
// — same fixed-step march for sign change, same bisection refinement — so the
// indicator (CPU) and the rendered surface (GPU) agree on hit position. Pure;
// allocation-light (one `Vec3Mut` for the hit point built up in place, plus
// the gradient eval's return).
//
// Domain: forward-only. After AABB clip, `t0 = max(tNear, 0)` so origins
// allowed *inside* the AABB don't pick up back-side intersections (the v1
// plan-review's GPT #1 / HIGH finding — without the clamp, an origin at
// [0,0,0] inside the unit-sphere AABB and a +x direction marches from
// t = -1.5, finds the back-side sign change at t ≈ -1, and returns the
// wrong-side hit).

export type Vec3Mut = [number, number, number];

export interface RaycastHit {
  hit: true;
  point: MathVec3;   // surface-local
  normal: MathVec3;  // surface-local, unit, outward (= normalize(gradF(point)))
}

export interface RaycastMiss {
  hit: false;
}

export type RaycastResult = RaycastHit | RaycastMiss;

export interface RaycastOptions {
  /** Implicit surface scalar in surface-local coords. Surface is `f = 0`. */
  f: (x: number, y: number, z: number) => number;
  /**
   * Closed-form gradient of `f` in surface-local coords. Required — keep
   * `raycastImplicit` thin and force the consumer to supply analytic
   * gradients for every surface used here. Central differences are not
   * a fallback: they amplify floating-point noise on flat regions
   * (#116-style artifact) and the v0.6 surfaces all have closed forms.
   */
  gradF: (x: number, y: number, z: number) => MathVec3;
  /** Ray origin in surface-local coords. */
  origin: MathVec3;
  /** Ray direction in surface-local coords; assumed unit-length. */
  dir: MathVec3;
  /** Half-extent of the AABB around the surface origin. */
  bound: number;
  /**
   * Number of uniform march steps across `[t0, tFar]`. Defaults to 64 — the
   * GPU harness's tuned default per #102. Lower is cheaper and more
   * aliasing-prone.
   */
  steps?: number;
  /**
   * Bisection iterations after a sign change is detected. Defaults to 8 —
   * yields ~stepWidth/2^8 precision; for the v0.6 unit sphere with
   * `bound=1.5, steps=64`, that's ~1.8e-4 m.
   */
  bisect?: number;
}

const DEFAULT_STEPS = 64;
const DEFAULT_BISECT = 8;

/**
 * Raymarch a ray against an implicit surface, returning the nearest forward
 * intersection (and its outward unit normal) or a miss.
 *
 * The returned `point` and `normal` are fresh tuples — safe to retain across
 * frames. Allocates two `MathVec3` per hit; the per-frame caller in
 * `tangent-planes/index.ts` accepts this since it only happens on hit
 * frames (and v0.6's unit sphere always hits, so two allocs/frame).
 */
export function raycastImplicit(opts: RaycastOptions): RaycastResult {
  const { f, gradF, origin, dir, bound } = opts;
  const steps = opts.steps ?? DEFAULT_STEPS;
  const bisect = opts.bisect ?? DEFAULT_BISECT;

  // 1. AABB clip via the slabs method. Direction components of zero are
  //    handled correctly by `1.0 / 0 = ±Infinity`: the resulting slab
  //    intervals collapse to `±Infinity`, and `min`/`max` propagate them
  //    so the on-axis cardinal-direction tests still resolve.
  const invDx = 1 / dir[0];
  const invDy = 1 / dir[1];
  const invDz = 1 / dir[2];
  const t0x = (-bound - origin[0]) * invDx;
  const t1x = (+bound - origin[0]) * invDx;
  const t0y = (-bound - origin[1]) * invDy;
  const t1y = (+bound - origin[1]) * invDy;
  const t0z = (-bound - origin[2]) * invDz;
  const t1z = (+bound - origin[2]) * invDz;
  const tMinX = Math.min(t0x, t1x);
  const tMaxX = Math.max(t0x, t1x);
  const tMinY = Math.min(t0y, t1y);
  const tMaxY = Math.max(t0y, t1y);
  const tMinZ = Math.min(t0z, t1z);
  const tMaxZ = Math.max(t0z, t1z);
  const tNear = Math.max(tMinX, tMinY, tMinZ);
  const tFar = Math.min(tMaxX, tMaxY, tMaxZ);
  if (tFar < tNear) return { hit: false };
  // Ray entirely behind the origin — nothing forward can hit.
  if (tFar < 0) return { hit: false };

  // 2. Forward-only domain.
  const t0 = Math.max(tNear, 0);

  // 3. Uniform march from t0 to tFar, watching for a sign flip in f.
  const dt = (tFar - t0) / steps;
  // Guard the degenerate case where t0 ≈ tFar (e.g., origin exactly at a
  // corner). No interval to march; treat as a miss.
  if (!(dt > 0)) return { hit: false };

  let tPrev = t0;
  let fPrev = f(
    origin[0] + dir[0] * tPrev,
    origin[1] + dir[1] * tPrev,
    origin[2] + dir[2] * tPrev,
  );
  let tHit = 0;
  let foundSignChange = false;

  for (let i = 1; i <= steps; i++) {
    const tNext = t0 + i * dt;
    const fNext = f(
      origin[0] + dir[0] * tNext,
      origin[1] + dir[1] * tNext,
      origin[2] + dir[2] * tNext,
    );
    if (fPrev * fNext < 0) {
      // 4. Bisect to refine the bracket.
      let lo = tPrev;
      let hi = tNext;
      let fLo = fPrev;
      for (let b = 0; b < bisect; b++) {
        const mid = 0.5 * (lo + hi);
        const fMid = f(
          origin[0] + dir[0] * mid,
          origin[1] + dir[1] * mid,
          origin[2] + dir[2] * mid,
        );
        if (fLo * fMid < 0) {
          hi = mid;
        } else {
          lo = mid;
          fLo = fMid;
        }
      }
      tHit = 0.5 * (lo + hi);
      foundSignChange = true;
      break;
    }
    tPrev = tNext;
    fPrev = fNext;
  }

  if (!foundSignChange) return { hit: false };

  // 5. Compose the hit point + outward unit normal. `gradF` points outward
  //    by convention (∇f points in the direction of increasing f, and for
  //    `f < 0` inside / `f > 0` outside that's outward).
  const px = origin[0] + dir[0] * tHit;
  const py = origin[1] + dir[1] * tHit;
  const pz = origin[2] + dir[2] * tHit;
  const g = gradF(px, py, pz);
  const gLen = Math.hypot(g[0], g[1], g[2]);
  // Defensive: at a critical point (∇f = 0) the normal is undefined.
  // Treat as miss rather than emit a NaN-laced normal that would propagate
  // into the indicator's transform. For non-degenerate quadrics this
  // branch never fires inside the visible region.
  if (gLen === 0 || !Number.isFinite(gLen)) return { hit: false };

  return {
    hit: true,
    point: [px, py, pz],
    normal: [g[0] / gLen, g[1] / gLen, g[2] / gLen],
  };
}
