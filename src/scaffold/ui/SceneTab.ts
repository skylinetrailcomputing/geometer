import { TapButton, type TapButtonVisuals } from '@/scaffold/ui/TapButton';

// Tap button for the SceneRack — the in-app navigation surface that
// lets the user move between sibling exhibits in a cluster (#150).
// Sibling of `SectionTab` (sticky-active sphere + yaw-billboard label
// + ray-hit + press-flash machinery), but tuned a step larger and
// recolored warm amber so the SceneRack reads as a higher-level
// affordance than the SectionTab row beneath it.
//
// Mechanics live in the shared `TapButton` base (#156). This subclass
// only declares the visual identity (larger button, warm-amber active,
// label above the button).

export interface SceneTabOptions {
  name: string;
  grabRadiusMultiplier: number;
}

// Same slate base as SectionTab so the off / inactive vocabulary stays
// consistent across rack tiers (cf. AxisToggle's matching disabled
// slate). Active emissive is warm amber, distinct from SectionTab's
// sky-blue, so users can tell at a glance which rack owns the
// currently-glowing tab. Hover / press scale the same way — soft pre-
// light → bright press flash on top of any sustained active glow.
//
// Larger button radius and label font than SectionTab's so the
// SceneRack reads as the outer / higher-priority navigation layer when
// the two racks share the user's field of view. Label placement matches
// SectionTab's (anchor 'bottom' + positive offset) — the SceneRack lays
// out horizontally, so right-of-button labels would collide with the
// next tab's button.
const VISUALS: TapButtonVisuals = {
  groupNamePrefix: 'scene-tab',
  buttonRadius: 0.028,
  baseColor: 0x556677,
  hoverEmissive: 0x442200,
  activeEmissive: 0xddaa66,
  pressEmissive: 0xffeebb,
  labelFontSize: 0.04,
  labelOffsetY: 0.04,
  labelAnchorY: 'bottom',
};

export class SceneTab extends TapButton {
  constructor(opts: SceneTabOptions) {
    super({
      name: opts.name,
      grabRadiusMultiplier: opts.grabRadiusMultiplier,
      visuals: VISUALS,
    });
  }
}
