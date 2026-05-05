import type { Preset } from './Preset';
import type { Slider } from './Slider';

// A Section is a thin container of sliders + presets that share a single
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
// Family-classifier readout, equation readout, and the math-frame axis
// indicator stay outside the Section abstraction — they're cross-cutting
// and visible regardless of the active section.

export interface SectionOptions {
  name: string;
  sliders: readonly Slider[];
  presets: readonly Preset[];
}

export class Section {
  readonly name: string;
  readonly sliders: readonly Slider[];
  readonly presets: readonly Preset[];

  // `enabled` gates controller dispatch (hover / grab / activate). Kept
  // as a separate flag from `group.visible` because an invisible-but-
  // enabled control would still resolve a ray hit and grab silently —
  // the issue calls this out as the reason `visible` alone is insufficient.
  private active = true;

  constructor(opts: SectionOptions) {
    this.name = opts.name;
    this.sliders = opts.sliders;
    this.presets = opts.presets;
  }

  get isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
    for (const s of this.sliders) s.group.visible = active;
    for (const p of this.presets) p.group.visible = active;
  }
}
