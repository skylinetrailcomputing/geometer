import { TapButton, type TapButtonVisuals } from '@/scaffold/ui/TapButton';

// Tap button for the rack section selector (#57). Sticky-active state
// persists until another tab claims active; press flash still fires on
// tap as feedback that the switch was registered, layered on top of the
// active state.
//
// Mechanics (sphere mesh + emissive priority + ray-hit + press-flash +
// haptic + yaw-billboard label + sticky active) live in the shared
// `TapButton` base (#156). This subclass only declares the visual
// identity (slate base, sky-blue active, label above the button).

export interface SectionTabOptions {
  name: string;
  grabRadiusMultiplier: number;
}

// Slate base reads as a "mode" affordance, distinct from Preset's cool
// blue ("snap to family member") and the warm orange slider thumbs
// ("drag to change a value"). Active emissive is bright enough to read
// at a glance which section is current; hover is a softer pre-light;
// press flash is the brightest, layered momentarily on top of active.
//
// Label sits above the button (anchor 'bottom' + positive offset) rather
// than to the right (Preset's layout): the tab row is horizontal, so
// right-of-button labels would collide with the next tab's button.
//
// `labelOrientation: 'surface'` (#255 PR2). SectionTab is exclusively
// plinth-mounted in geometer today (quadrics' canonical-forms heading
// + 3 SectionTabs at slot-X = -0.42). The button group inherits the
// plinth slot's `R_x(-tilt)` surface tilt, so the default yaw-billboard
// label rotation would diverge from the slab plane and visibly clip
// into the slab volume (see TapButton.ts `labelOrientation` doc + plan
// `_private/plans/255-section-tab-anchoring-labels.md`). `'surface'`
// leaves the label in the button's local frame (identity), co-tilting
// with the slab through the parent group's transform — no clipping,
// ~8% worst-case foreshortening accepted as legibility-acceptable.
// Bake the choice into VISUALS rather than threading per-instance: the
// surface-mounted-tap-affordance identity is what SectionTab IS today;
// a future mid-air SectionTab consumer would override at that point.
const VISUALS: TapButtonVisuals = {
  groupNamePrefix: 'tab',
  buttonRadius: 0.022,
  baseColor: 0x556677,
  hoverEmissive: 0x223344,
  activeEmissive: 0x88bbdd,
  pressEmissive: 0xddeeff,
  labelFontSize: 0.035,
  labelOffsetY: 0.04,
  labelAnchorY: 'bottom',
  labelOrientation: 'surface',
};

export class SectionTab extends TapButton {
  constructor(opts: SectionTabOptions) {
    super({
      name: opts.name,
      grabRadiusMultiplier: opts.grabRadiusMultiplier,
      visuals: VISUALS,
    });
  }
}
