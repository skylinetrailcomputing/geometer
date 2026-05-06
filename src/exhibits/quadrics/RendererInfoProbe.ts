import * as THREE from 'three';

// Debug-only renderer.info dump for #102 (steady-state perf
// investigation). Hidden behind the same `?fps=1` query flag as the
// FPS overlay (#101) — both diagnostics are scoped to the same in-VR
// perf-pass workflow, and gating them together keeps the prod build
// free of either.
//
// Logs scene-graph cost per LOG_INTERVAL_MS to the browser console:
// draw calls, triangles, points, lines, and active program count.
// Read tethered (chrome://inspect on the Quest) or after the session
// (the console buffer survives the WebXR exit). Confirms whether the
// scene-graph CPU/draw-call cost is plausibly the steady-state ~40
// FPS bottleneck, or whether the raymarcher fragment cost is.

const LOG_INTERVAL_MS = 5000;

export class RendererInfoProbe {
  private readonly renderer: THREE.WebGLRenderer;
  private lastLogMs = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  update(nowMs: number): void {
    if (nowMs - this.lastLogMs < LOG_INTERVAL_MS) return;
    this.lastLogMs = nowMs;

    const { render, programs } = this.renderer.info;
    console.log(
      `[renderer.info] calls=${render.calls} ` +
        `triangles=${render.triangles} ` +
        `points=${render.points} ` +
        `lines=${render.lines} ` +
        `programs=${programs?.length ?? 0}`,
    );
  }
}
