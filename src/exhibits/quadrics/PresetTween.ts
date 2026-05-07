import type { PresetValues } from '@/scaffold/ui/Preset';
import type { Slider } from '@/scaffold/ui/Slider';

// Animated transition between canonical-pose preset values (#56). v0.2's
// preset buttons snapped instantly; the tween makes the family transition
// itself visible — the user *sees* the cone pinch into a hyperboloid as `c`
// flips sign, with the live family classifier readout morphing along — not
// just the endpoints.
//
// Two-phase animation, ordered to dodge the empty-set / degenerate-point
// regions that a naive 4D linear lerp would visit (see issue #56 §2). The
// rule, derived from the documented preset → preset transitions:
//
//   1. Source d = 0, target d ≠ 0 (leaving the cone): phase 1 moves d
//      first, then the rest. Without this, intermediate (a,b,c) at d=0
//      with same-sign coefficients would render only the origin.
//   2. Source d ≠ 0, target d = 0 (landing on the cone): phase 1 moves
//      (a,b,c) first, phase 2 moves d. Lands on the cone last.
//   3. Otherwise: phase 1 moves (a,b,c), phase 2 moves d. Sphere↔cylinder
//      and 1-sheet↔2-sheets transits stay smooth — the latter passes
//      through cone at d=0 with c already negative, no degeneracy.
//
// Empty phases are collapsed: a transition that only changes d (e.g., cone →
// 1-sheet) skips its empty phase rather than leaving 150 ms of dead frames.

// 0.9 s after a headset trial of the original 0.3 s — three-times slower
// reads as deliberate enough to actually watch the family-classifier
// readout flip across the morph, where 0.3 s was over before the eye could
// track. Tunable; the issue defers final calibration to in-headset feel.
const DURATION_MS = 900;

// Cubic ease-in-out — picked because it reads as "deliberate" rather than
// "snappy" at this duration. Tunable in headset; the issue defers easing
// experiments to a follow-up.
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Index 3 is `d` in (a,b,c,d). Phase ordering keys off it.
const D_INDEX = 3;
const ABC_INDICES: readonly number[] = [0, 1, 2];

interface Phase {
  // Indices into PresetValues to interpolate during this phase.
  readonly indices: readonly number[];
  // Phase span as a fraction of total elapsed time, [start, end] in [0, 1].
  readonly tStart: number;
  readonly tEnd: number;
}

// Optional secondary rack tweened in parallel with the coefficient phases
// (#92). Used so coefficient-section presets also drive the linear-terms
// rack to (0, 0, 0) — otherwise tapping "Sphere" with non-zero (u, v, w)
// produces a translated sphere instead of the canonical pose. Lerps across
// the full duration; phase ordering is unnecessary because zeroing linear
// terms has no degeneracy region to dodge.
export interface SecondaryRackSpec {
  readonly start: readonly number[];
  readonly target: readonly number[];
  readonly sliders: readonly Slider[];
}

export class PresetTween {
  private readonly start: PresetValues;
  private readonly target: PresetValues;
  private readonly sliders: readonly Slider[];
  private readonly phases: readonly Phase[];
  private readonly secondary?: SecondaryRackSpec;
  private readonly startedAtMs: number;
  private done = false;

  constructor(
    start: PresetValues,
    target: PresetValues,
    sliders: readonly Slider[],
    nowMs: number,
    secondary?: SecondaryRackSpec,
  ) {
    this.start = start;
    this.target = target;
    this.sliders = sliders;
    this.startedAtMs = nowMs;
    this.secondary = secondary;

    // Source-at-cone (d=0) is the only signal that flips ordering: leave
    // the cone before flipping signs, so we never sit at d=0 with same-sign
    // (a,b,c). Rule 2 (landing on the cone) and rule 3 both fall out of the
    // else branch — `d` last in either case.
    const sourceAtCone = start[D_INDEX] === 0;
    const phase1Indices: readonly number[] = sourceAtCone
      ? [D_INDEX]
      : ABC_INDICES;
    const phase2Indices: readonly number[] = sourceAtCone
      ? ABC_INDICES
      : [D_INDEX];

    const phase1Active = phase1Indices.some((i) => start[i] !== target[i]);
    const phase2Active = phase2Indices.some((i) => start[i] !== target[i]);
    const secondaryActive =
      !!secondary && secondary.start.some((v, i) => v !== secondary.target[i]);

    // Edge case: nothing changes. Already-done tween is a no-op on tick().
    if (!phase1Active && !phase2Active && !secondaryActive) {
      this.phases = [];
      this.done = true;
      return;
    }

    let phase1End: number;
    if (phase1Active && phase2Active) {
      phase1End = 0.5;
    } else if (phase1Active) {
      phase1End = 1;
    } else {
      phase1End = 0;
    }

    const phases: Phase[] = [];
    if (phase1Active) {
      phases.push({ indices: phase1Indices, tStart: 0, tEnd: phase1End });
    }
    if (phase2Active) {
      phases.push({ indices: phase2Indices, tStart: phase1End, tEnd: 1 });
    }
    this.phases = phases;
  }

  /**
   * Advance the tween. Returns true while still animating, false once
   * complete. On completion the final frame uses `setValue` (not
   * `setValueRaw`) so the zero-detent re-engages on each slider.
   */
  tick(nowMs: number): boolean {
    if (this.done) return false;
    const t = Math.min((nowMs - this.startedAtMs) / DURATION_MS, 1);

    for (const phase of this.phases) {
      const localT = clamp01((t - phase.tStart) / (phase.tEnd - phase.tStart));
      const eased = ease(localT);
      for (const i of phase.indices) {
        const v = lerp(this.start[i], this.target[i], eased);
        this.sliders[i].setValueRaw(v);
      }
    }

    if (this.secondary) {
      const easedFull = ease(t);
      for (let i = 0; i < this.secondary.sliders.length; i++) {
        const v = lerp(this.secondary.start[i], this.secondary.target[i], easedFull);
        this.secondary.sliders[i].setValueRaw(v);
      }
    }

    if (t >= 1) {
      // Land exactly on target values *and* re-engage the detent. Targets
      // are typically detent-clean (1, 0, -1, …), so setValue is a no-op
      // beyond that, but it keeps the final state consistent with a manual
      // preset press.
      for (let i = 0; i < this.sliders.length; i++) {
        this.sliders[i].setValue(this.target[i]);
      }
      if (this.secondary) {
        for (let i = 0; i < this.secondary.sliders.length; i++) {
          this.secondary.sliders[i].setValue(this.secondary.target[i]);
        }
      }
      this.done = true;
      return false;
    }
    return true;
  }

  cancel(): void {
    this.done = true;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
