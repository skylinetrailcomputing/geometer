import * as THREE from 'three';
import { Text } from 'troika-three-text';

export interface LabelOptions {
  // Font sizes in world units (meters). Defaults sized for the family-label
  // viewing distance in SPEC.md "Scene geometry" (~3 m). Per-slider reuse
  // (#22) at ~1.5 m will pass smaller values.
  primaryFontSize?: number;
  secondaryFontSize?: number;
  // Vertical gap between the bottom of the primary line and the top of the
  // secondary line, in meters.
  lineGap?: number;
  color?: number | string;
  // Horizontal anchor for both lines. Default 'center' (family-label and
  // axis-letter use). Per-slider labels (#170) pass 'right' so the rendered
  // text right-edge stays fixed regardless of value-string length, keeping
  // the worst-case secondary text clear of the slider thumb.
  anchorX?: 'left' | 'center' | 'right';
}

const DEFAULT_PRIMARY_FONT_SIZE = 0.16;
const DEFAULT_SECONDARY_FONT_SIZE = 0.07;
const DEFAULT_LINE_GAP = 0.02;
const DEFAULT_COLOR = 0xffffff;

// Outline gives the text contrast against any surface color behind it.
// SDF outline width is a fraction of the font size.
const OUTLINE_WIDTH = '6%';
const OUTLINE_COLOR = 0x000000;

/**
 * Two-line billboarded text label. Primary line on top (large), secondary
 * line below (small). Owns a single `THREE.Group` you can position on the
 * scene; call `faceCamera(camera)` per-frame to billboard.
 *
 * Reuse target: this primitive is shared with the per-slider labels in #22 —
 * keep the surface narrow and orientation-agnostic.
 */
export class Label {
  readonly group: THREE.Group;

  private readonly primary: Text;
  private readonly secondary: Text;
  private primaryText = '';
  private secondaryText = '';

  // Hoisted out of `faceCamera` so per-frame billboarding does no allocation.
  private readonly camWorld = new THREE.Vector3();
  private readonly labelWorld = new THREE.Vector3();

  constructor(opts: LabelOptions = {}) {
    const primaryFontSize = opts.primaryFontSize ?? DEFAULT_PRIMARY_FONT_SIZE;
    const secondaryFontSize =
      opts.secondaryFontSize ?? DEFAULT_SECONDARY_FONT_SIZE;
    const lineGap = opts.lineGap ?? DEFAULT_LINE_GAP;
    const color = opts.color ?? DEFAULT_COLOR;
    const anchorX = opts.anchorX ?? 'center';
    const textAlign =
      anchorX === 'right' ? 'right' : anchorX === 'left' ? 'left' : 'center';

    this.group = new THREE.Group();
    this.group.name = 'label';

    // Primary: glyphs extend upward from y = lineGap/2 (anchor at bottom).
    this.primary = new Text();
    this.primary.fontSize = primaryFontSize;
    this.primary.color = color;
    this.primary.anchorX = anchorX;
    this.primary.anchorY = 'bottom';
    this.primary.textAlign = textAlign;
    this.primary.outlineWidth = OUTLINE_WIDTH;
    this.primary.outlineColor = OUTLINE_COLOR;
    this.primary.position.y = lineGap / 2;
    this.group.add(this.primary);

    // Secondary: glyphs extend downward from y = -lineGap/2 (anchor at top).
    this.secondary = new Text();
    this.secondary.fontSize = secondaryFontSize;
    this.secondary.color = color;
    this.secondary.anchorX = anchorX;
    this.secondary.anchorY = 'top';
    this.secondary.textAlign = textAlign;
    this.secondary.outlineWidth = OUTLINE_WIDTH;
    this.secondary.outlineColor = OUTLINE_COLOR;
    this.secondary.position.y = -lineGap / 2;
    this.group.add(this.secondary);
  }

  setPrimary(text: string): void {
    if (text === this.primaryText) return;
    this.primaryText = text;
    this.primary.text = text;
    this.primary.sync();
  }

  setSecondary(text: string): void {
    if (text === this.secondaryText) return;
    this.secondaryText = text;
    this.secondary.text = text;
    this.secondary.sync();
  }

  // Yaw-only billboard: face the camera in the XZ plane while staying
  // upright in world space. Matching the camera's full quaternion would
  // inherit head pitch and roll, which in VR rolls the label with a head
  // tilt and reads as disorienting (#29). World-up stays world-up.
  faceCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    this.group.getWorldPosition(this.labelWorld);
    const dx = this.camWorld.x - this.labelWorld.x;
    const dz = this.camWorld.z - this.labelWorld.z;
    this.group.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  dispose(): void {
    this.primary.dispose();
    this.secondary.dispose();
  }
}
