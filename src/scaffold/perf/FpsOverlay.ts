import * as THREE from 'three';
import { Text } from 'troika-three-text';

// Debug-only billboarded FPS readout for #99 (release-readiness perf
// pass). Hidden behind the `?fps=1` query flag in the URL — the
// default exhibit doesn't ship it. Tracks rolling-average frame rate
// from the shell's per-frame `delta` and syncs the troika Text at
// ~5 Hz so the readout itself doesn't perturb the metric.

const SAMPLE_WINDOW = 60; // ~ 1 s of history at 72 Hz
const SYNC_INTERVAL_MS = 200; // 5 Hz, matches EquationReadout.ts cadence
const FONT_SIZE = 0.04;
const COLOR = 0x88ff88; // soft green — distinct from the equation's white
const OUTLINE_WIDTH = '6%';
const OUTLINE_COLOR = 0x000000;

export class FpsOverlay {
  readonly group: THREE.Group;

  private readonly text: Text;
  // Pre-sized circular buffer of frame deltas (seconds). Wraps via
  // writeIdx; sampleCount tracks fill-up before the buffer wraps so
  // the first second of readings doesn't average against zeros.
  private readonly deltas = new Float32Array(SAMPLE_WINDOW);
  private writeIdx = 0;
  private sampleCount = 0;
  private lastSyncMs = 0;
  private currentText = '';

  private readonly camWorld = new THREE.Vector3();
  private readonly selfWorld = new THREE.Vector3();

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'fps-overlay';

    this.text = new Text();
    this.text.fontSize = FONT_SIZE;
    this.text.color = COLOR;
    this.text.anchorX = 'center';
    this.text.anchorY = 'middle';
    this.text.outlineWidth = OUTLINE_WIDTH;
    this.text.outlineColor = OUTLINE_COLOR;
    this.text.text = 'FPS —';
    this.text.sync();
    this.group.add(this.text);
  }

  update(delta: number, nowMs: number): void {
    this.deltas[this.writeIdx] = delta;
    this.writeIdx = (this.writeIdx + 1) % SAMPLE_WINDOW;
    if (this.sampleCount < SAMPLE_WINDOW) this.sampleCount++;

    if (nowMs - this.lastSyncMs < SYNC_INTERVAL_MS) return;
    this.lastSyncMs = nowMs;

    let sum = 0;
    for (let i = 0; i < this.sampleCount; i++) sum += this.deltas[i];
    // Guard against the all-zero first frame (delta=0 before the loop
    // has produced any real timing). Without this the first sync would
    // divide by zero and emit "Infinity".
    const avgDelta = sum > 0 ? sum / this.sampleCount : 0;
    const fps = avgDelta > 0 ? 1 / avgDelta : 0;
    const next = `FPS ${fps.toFixed(1)}`;
    if (next !== this.currentText) {
      this.currentText = next;
      this.text.text = next;
      this.text.sync();
    }
  }

  // Yaw-only billboard, mirroring Label.faceCamera(): keeps world-up
  // upright so head tilt doesn't roll the readout.
  faceCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camWorld);
    this.group.getWorldPosition(this.selfWorld);
    const dx = this.camWorld.x - this.selfWorld.x;
    const dz = this.camWorld.z - this.selfWorld.z;
    this.group.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  dispose(): void {
    this.text.dispose();
  }
}
