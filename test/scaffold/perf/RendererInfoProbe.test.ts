import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import { RendererInfoProbe } from '../../../src/scaffold/perf/RendererInfoProbe.ts';

// `WebGLRenderer` needs a real GL context; the probe only ever reads
// `renderer.info`, so a stub with a mutable `info` shape is sufficient
// and lets us drive counter changes deterministically.
function stubRenderer(info: {
  render: { calls: number; triangles: number; points: number; lines: number };
  memory: { geometries: number; textures: number };
  programs: { length: number } | null;
}): THREE.WebGLRenderer {
  return { info } as unknown as THREE.WebGLRenderer;
}

function defaultInfo() {
  return {
    render: { calls: 3, triangles: 120, points: 0, lines: 4 },
    memory: { geometries: 7, textures: 2 },
    programs: { length: 5 },
  };
}

describe('RendererInfoProbe (#247 — programmable mount-leak snapshot)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('snapshot() reflects current renderer.info, render + memory + programs', () => {
    const probe = new RendererInfoProbe(stubRenderer(defaultInfo()));
    expect(probe.snapshot()).toEqual({
      calls: 3,
      triangles: 120,
      points: 0,
      lines: 4,
      geometries: 7,
      textures: 2,
      programs: 5,
    });
  });

  it('snapshot() treats a null programs list as zero', () => {
    const info = defaultInfo();
    const probe = new RendererInfoProbe(
      stubRenderer({ ...info, programs: null }),
    );
    expect(probe.snapshot().programs).toBe(0);
  });

  it('snapshot() re-reads live — leak shows as a persistent-count delta', () => {
    const info = defaultInfo();
    const probe = new RendererInfoProbe(stubRenderer(info));
    const baseline = probe.snapshot();

    // Simulate mount → unmount → re-mount that leaks one geometry +
    // one texture (per-frame render counts returned to baseline).
    info.memory.geometries += 1;
    info.memory.textures += 1;
    const after = probe.snapshot();

    expect(after.geometries - baseline.geometries).toBe(1);
    expect(after.textures - baseline.textures).toBe(1);
    expect(after.calls).toBe(baseline.calls);
  });

  it('snapshot() is side-effect-free: does not arm the log throttle', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const probe = new RendererInfoProbe(stubRenderer(defaultInfo()));

    probe.snapshot();
    probe.snapshot();
    probe.snapshot();
    // Snapshot must not move the throttle: the first logging update is
    // still the one past LOG_INTERVAL_MS, identical to baseline.
    probe.update(4999); // within the 5 s window — suppressed
    expect(log).not.toHaveBeenCalled();
    probe.update(5000); // window elapsed — logs once
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('update() throttles to LOG_INTERVAL_MS and logs the full snapshot', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const probe = new RendererInfoProbe(stubRenderer(defaultInfo()));

    // lastLogMs initializes to 0, so the t=0 call is itself within the
    // window and suppressed — pre-existing throttle behavior, unchanged
    // by #247.
    probe.update(0); // suppressed (0 - 0 < 5000)
    probe.update(5000); // window elapsed — logs (1)
    probe.update(9999); // within window — suppressed
    probe.update(10000); // window elapsed — logs (2)
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toContain('geometries=7');
    expect(log.mock.calls[0][0]).toContain('textures=2');
    expect(log.mock.calls[0][0]).toContain('programs=5');
  });
});
