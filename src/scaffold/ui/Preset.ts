import { TapButton, type TapButtonVisuals } from '@/scaffold/ui/TapButton';

// One canonical-pose preset button (#46). Pressing snaps the slider rack
// to a named family member (Sphere, Cylinder, Cone, Hyperboloid 1- or
// 2-sheet, …). Read as a tap-affordance distinct from the warm slider
// thumbs by use of a cool fill color and a brief press flash on
// activation.
//
// Label placement is below-button rather than right-of-button (#93): the
// preset rack is a horizontal sub-row beneath the section tabs, so right-
// of-button labels would collide with the next preset's button. Mirrors
// SectionTab's above-button label arrangement (with the offset flipped so
// labels fall toward the family classifier rather than crowding the tabs
// above).
//
// Mechanics (sphere mesh + ray-hit + press-flash + haptic + yaw-billboard
// label) live in the shared `TapButton` base (#156). `Preset` adds:
// (a) the cool-blue visual identity used by every preset row in the
// cluster, (b) two optional caller-read fields (`values`, `linearValues`)
// for quadrics-style coefficient presets, and (c) an optional
// `activeEmissive` for sticky-active preset rows (#201 PR 6 — was
// previously achieved by bypassing Preset and constructing TapButton
// directly with a custom visuals override in saddle-extrema).

export type PresetValues = readonly [number, number, number, number];
// Linear-term coefficients (u, v, w) in math frame — see index.ts for the
// math→world routing. Only paraboloid / saddle presets need a non-zero
// entry today; everything else is the canonical centered pose (0, 0, 0).
export type LinearPresetValues = readonly [number, number, number];

export interface PresetOptions {
  name: string;
  grabRadiusMultiplier: number;
  // Quadrics-style coefficient values (a, b, c, d). Optional so non-
  // quadrics scenes (saddle-extrema) can use Preset for its visual
  // identity without surfacing a presets-as-coefficient-tuples model
  // they don't have. Defaults to (0, 0, 0, 0) — never read by scenes
  // that don't supply it.
  values?: PresetValues;
  // Optional. Defaults to (0, 0, 0). Paraboloid uses (0, 0, -1) so that
  // ax² + by² + wz = 0 with a=b=1, w=-1 reads as z = x² + y² (open along
  // +math-Z, the "up" axis under the math-frame convention).
  linearValues?: LinearPresetValues;
  // Optional sticky-active emissive (#201 PR 6). When supplied, calling
  // `setActive(true)` on the resulting Preset lights this emissive until
  // a subsequent `setActive(false)` clears it. Quadrics omits this — its
  // presets are one-shot snaps; the press flash is the feedback.
  // Saddle-extrema passes 0x66ccdd — its presets are persistent surface-
  // family selectors. The scene drives `setActive` state on tap; Preset
  // does NOT self-toggle.
  activeEmissive?: number;
}

// Cool fill so presets read as "tap to apply" rather than "drag" — the
// slider thumbs use a warm orange for drag affordance. By default, no
// `activeEmissive`: presets are one-shot and the press flash IS the
// feedback. Per-instance `activeEmissive` lights up the sticky-active
// branch in TapButton's refreshButtonEmissive when supplied via
// PresetOptions.
//
// Smaller font than the tabs to keep adjacent labels from running
// together in the horizontal preset row introduced in #93. Paired with
// the row pitch in index.ts: 0.13 m pitch + 0.022 m font leaves clear
// air between "H 2-sheets" and its neighbors. Label sits below the
// button (anchor 'top' + negative offset) so it falls toward the family
// classifier rather than crowding the section tabs above.
const VISUALS: TapButtonVisuals = {
  groupNamePrefix: 'preset',
  buttonRadius: 0.02,
  baseColor: 0x44aabb,
  hoverEmissive: 0x224455,
  pressEmissive: 0x88ddff,
  labelFontSize: 0.022,
  labelOffsetY: -0.025,
  labelAnchorY: 'top',
};

export class Preset extends TapButton {
  readonly values: PresetValues;
  readonly linearValues: LinearPresetValues;

  constructor(opts: PresetOptions) {
    super({
      name: opts.name,
      grabRadiusMultiplier: opts.grabRadiusMultiplier,
      // Explicit spread when activeEmissive is supplied — keeps the
      // no-activeEmissive path bit-identical to the prior behavior
      // (shares the module-level VISUALS constant; no per-instance
      // allocation). The spread fires once per Preset construct, which
      // is at scene-mount, not per-frame.
      visuals:
        opts.activeEmissive !== undefined
          ? { ...VISUALS, activeEmissive: opts.activeEmissive }
          : VISUALS,
    });
    this.values = opts.values ?? [0, 0, 0, 0];
    this.linearValues = opts.linearValues ?? [0, 0, 0];
  }
}
