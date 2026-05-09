import type { HistoryMode } from './url-routing';

// Defer-and-coalesce state machine for in-session exhibit switches
// (#150 step 5). Lives apart from `shell.ts` so the coalescing /
// re-entrancy semantics can be Vitest-covered without spinning up a
// renderer.
//
// Two contracts the scheduler enforces, each tested in
// `test/shell/switch-scheduler.test.ts`:
//
//   1. **Coalescing.** Two `requestSwitch(id)` calls within the same
//      tick mount only the *last* id at the next `drain()`. The
//      shell calls `drain()` from the animation loop, so two taps
//      processed in the same `selectstart` → `selectstart` window
//      collapse to a single mount. Prevents the "user double-tapped
//      and saw a flash of A before landing on B" failure mode.
//
//   2. **Re-entrancy guard.** If `commit` happens to call
//      `requestSwitch` itself (e.g. an exhibit's `mount` hook
//      indirectly triggers a routing change), the scheduler does
//      not re-enter `commit` mid-execution. The new request is
//      queued and drained on the next tick. This is the "controller
//      event never unmounts mid-dispatch" guarantee from §4.2 of the
//      plan, generalized to any commit-time triggered switch.
//
// `commit` is the caller-provided hook that does the actual
// resolve → unmount → mount work. The scheduler doesn't know or
// care about Three.js, the registry, or URL state — it owns
// scheduling only.
//
// `id` carries through nullable so the resolver downstream can
// distinguish `null` (bare URL — silent fallback) from `''` (empty
// `?exhibit=` — fall back with a console warn). Coercing both to
// `''` upstream of the resolver loses that distinction and would
// warn on every bare-URL boot.

type PendingRequest = {
  id: string | null;
  mode: HistoryMode;
};

export interface SwitchScheduler {
  requestSwitch(id: string | null, mode: HistoryMode): void;
  /**
   * Drain a pending request, if any. Calls `commit(id, mode)`
   * exactly once per drain when a request is pending; no-ops
   * otherwise. Safe to call every frame.
   */
  drain(): void;
}

export interface SchedulerOptions {
  commit: (id: string | null, mode: HistoryMode) => void;
}

export function createSwitchScheduler(opts: SchedulerOptions): SwitchScheduler {
  let pending: PendingRequest | null = null;
  let committing = false;

  return {
    requestSwitch(id, mode) {
      pending = { id, mode };
    },
    drain() {
      if (committing) return;
      if (pending === null) return;
      const { id, mode } = pending;
      pending = null;
      committing = true;
      try {
        opts.commit(id, mode);
      } finally {
        committing = false;
      }
    },
  };
}
