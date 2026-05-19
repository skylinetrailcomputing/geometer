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

// Point-in-time `renderer.info` reading (#247). Two classes of counter:
//
//  - `calls` / `triangles` / `points` / `lines` are *per-frame* render
//    stats (Three.js resets them each frame via `info.autoReset`). They
//    proxy "scene-graph cost right now" — the value the manual
//    mount-leak smoke eyeballs returning to baseline after a SceneRack
//    switch. Read these immediately after a render of the relevant
//    state.
//  - `geometries` / `textures` / `programs` are *persistent* GPU-object
//    counts that fall only on disposal. These are the true
//    mount → unmount → re-mount leak signal: a delta vs. a pre-mount
//    baseline means an exhibit leaked a geometry/texture/program
//    through its unmount path.
export interface RendererInfoSnapshot {
  readonly calls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

export class RendererInfoProbe {
  private readonly renderer: THREE.WebGLRenderer;
  private lastLogMs = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  // Side-effect-free read of the current `renderer.info`. Does not
  // touch the log throttle, so it composes with `update()` and is
  // safe to call at arbitrary points (e.g. a programmable mount-leak
  // assertion: snapshot before mount, snapshot after unmount, compare
  // the persistent counts).
  snapshot(): RendererInfoSnapshot {
    const { render, memory, programs } = this.renderer.info;
    return {
      calls: render.calls,
      triangles: render.triangles,
      points: render.points,
      lines: render.lines,
      geometries: memory.geometries,
      textures: memory.textures,
      programs: programs?.length ?? 0,
    };
  }

  update(nowMs: number): void {
    if (nowMs - this.lastLogMs < LOG_INTERVAL_MS) return;
    this.lastLogMs = nowMs;

    const s = this.snapshot();
    console.log(
      `[renderer.info] calls=${s.calls} ` +
        `triangles=${s.triangles} ` +
        `points=${s.points} ` +
        `lines=${s.lines} ` +
        `geometries=${s.geometries} ` +
        `textures=${s.textures} ` +
        `programs=${s.programs}`,
    );
  }
}
