import type { Slider } from './Slider';

// A Section is a thin container of sliders that share a single
// active/inactive state. The slider rack is partitioned into sections so
// that future advanced controls (level-set slicing, first-degree linear
// terms, …) can land without crowding the visual budget — the user
// switches sections via the SectionTab row above the rack.
//
// Slider state persists across switches: the Slider instances live for
// the lifetime of the exhibit, and `setActive(false)` only hides their
// groups + drops them from controller dispatch. Re-activating returns
// the rack to the same parameter values.
//
// Family-classifier readout, equation readout, math-frame axis indicator,
// and the canonical-pose preset rack stay outside the Section abstraction
// — they're cross-cutting and visible regardless of the active section.
// (Presets are global as of #93: pressing one drives the coefficient
// rack to a canonical pose and zeros the linear-term rack regardless of
// which section is currently focused, so they belong above the section
// boundary, not inside it.)

export interface SectionOptions {
  name: string;
  sliders: readonly Slider[];
}

export class Section {
  readonly name: string;
  readonly sliders: readonly Slider[];

  // `enabled` gates controller dispatch (hover / grab / activate). Kept
  // as a separate flag from `group.visible` because an invisible-but-
  // enabled control would still resolve a ray hit and grab silently —
  // the issue calls this out as the reason `visible` alone is insufficient.
  private active = true;

  constructor(opts: SectionOptions) {
    this.name = opts.name;
    this.sliders = opts.sliders;
  }

  get isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
    for (const s of this.sliders) s.group.visible = active;
  }

  // Section is a pure container — the exhibit owns the underlying
  // Slider instances and disposes them directly. Implemented for
  // contract parity with the rest of `scaffold/ui/` so callers can
  // treat any owned primitive uniformly during exhibit unmount.
  dispose(): void {
    // intentionally empty
  }
}
