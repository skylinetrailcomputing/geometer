import { describe, it, expect, vi } from 'vitest';
import { createSwitchScheduler } from '@/shell/switch-scheduler';

describe('createSwitchScheduler', () => {
  it('drain with no pending request is a no-op', () => {
    const commit = vi.fn();
    const s = createSwitchScheduler({ commit });
    s.drain();
    expect(commit).not.toHaveBeenCalled();
  });

  it('coalesces same-tick requests: only the last id commits', () => {
    const commit = vi.fn();
    const s = createSwitchScheduler({ commit });
    s.requestSwitch('a', 'push');
    s.requestSwitch('b', 'push');
    s.requestSwitch('c', 'replace');
    s.drain();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('c', 'replace');
  });

  it('forwards the latest history mode along with the latest id', () => {
    const commit = vi.fn();
    const s = createSwitchScheduler({ commit });
    s.requestSwitch('a', 'push');
    s.requestSwitch('b', 'replace');
    s.drain();
    expect(commit).toHaveBeenCalledWith('b', 'replace');
  });

  it('drain after a successful commit is a no-op (queue cleared)', () => {
    const commit = vi.fn();
    const s = createSwitchScheduler({ commit });
    s.requestSwitch('a', 'push');
    s.drain();
    s.drain();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('re-entrancy guard: commit-time requestSwitch defers to next drain', () => {
    // Simulates the §4.2 "controller event never unmounts mid-
    // dispatch" guarantee, generalized: if `commit` triggers
    // another `requestSwitch`, it must not re-enter the same
    // commit call. The new request rides on the next drain().
    let nestedRequested = false;
    const commitOrder: (string | null)[] = [];
    const commit = vi.fn((id: string | null) => {
      commitOrder.push(id);
      if (!nestedRequested) {
        nestedRequested = true;
        s.requestSwitch('b', 'push');
      }
    });
    const s = createSwitchScheduler({ commit });
    s.requestSwitch('a', 'push');
    s.drain();
    // After first drain: commit('a') ran exactly once. The nested
    // requestSwitch('b') is pending but did NOT re-enter commit.
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commitOrder).toEqual(['a']);
    // Second drain: now commit('b') fires.
    s.drain();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commitOrder).toEqual(['a', 'b']);
  });

  it('passes null id through commit (bare-URL boot stays distinct from empty `?exhibit=`)', () => {
    // The boot path passes `requestedParam` (which is `null` for
    // a bare URL) directly through `requestSwitch` so the
    // downstream resolver can keep the bare-URL boot silent
    // while still warning on `?exhibit=` (empty). Coercing null
    // to '' upstream of the resolver would warn on every
    // bare-URL boot.
    const commit = vi.fn();
    const s = createSwitchScheduler({ commit });
    s.requestSwitch(null, 'replace');
    s.drain();
    expect(commit).toHaveBeenCalledWith(null, 'replace');
  });

  it('repeated drains without new requests stay no-ops', () => {
    const commit = vi.fn();
    const s = createSwitchScheduler({ commit });
    s.requestSwitch('a', 'push');
    s.drain();
    s.drain();
    s.drain();
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
