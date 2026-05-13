import { describe, it, expect } from 'vitest';
import type { Exhibit } from '@/shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '@/shell/clusters';
import {
  resolveExhibitId,
  resolveMode,
  planUrlSync,
} from '@/shell/url-routing';

// Stand-in cluster exhibits for the resolver tests. Only the `id`
// and `cluster` fields matter for `resolveExhibitId`; the rest are
// stubbed because the resolver looks at neither. `'hello'` is
// included as a *registered-but-not-in-cluster* sibling — i.e. the
// shape `listExhibits()` would return after registration but
// *before* `shell.ts` filters it out — so `resolveExhibitId('hello',
// clusterExhibits)` exercises the "non-cluster id" branch. The plan
// promise (#150 §4.3) is that hello is reachable only via direct dev
// import, never via `?exhibit=hello`.

function stubExhibit(id: string, cluster?: string): Exhibit {
  return {
    id,
    title: id,
    cluster,
    mount: () => {},
    update: () => {},
    unmount: () => {},
    onSelectStart: () => {},
    onSelectEnd: () => {},
  };
}

const clusterExhibits = [
  stubExhibit('quadrics', CLUSTER_CALCULUS3),
  stubExhibit('tangent-planes', CLUSTER_CALCULUS3),
];
const defaultId = clusterExhibits[0].id;

describe('resolveExhibitId', () => {
  it('null requested → cluster default, no fallback (silent bare-URL boot)', () => {
    const r = resolveExhibitId(null, clusterExhibits);
    expect(r.id).toBe(defaultId);
    expect(r.fellBack).toBe(false);
  });
  it('undefined requested → cluster default, no fallback', () => {
    const r = resolveExhibitId(undefined, clusterExhibits);
    expect(r.id).toBe(defaultId);
    expect(r.fellBack).toBe(false);
  });
  it("empty string ('?exhibit=') → cluster default, fellBack=true", () => {
    const r = resolveExhibitId('', clusterExhibits);
    expect(r.id).toBe(defaultId);
    expect(r.fellBack).toBe(true);
  });
  it("unknown id ('?exhibit=bogus') → cluster default, fellBack=true", () => {
    const r = resolveExhibitId('bogus', clusterExhibits);
    expect(r.id).toBe(defaultId);
    expect(r.fellBack).toBe(true);
  });
  it("non-cluster registered id ('?exhibit=hello') → cluster default, fellBack=true", () => {
    // `clusterExhibits` is the post-filter list, so hello is
    // already excluded — the resolver doesn't need to know hello
    // exists to reject it.
    const r = resolveExhibitId('hello', clusterExhibits);
    expect(r.id).toBe(defaultId);
    expect(r.fellBack).toBe(true);
  });
  it('valid cluster default id → that id, no fallback', () => {
    const r = resolveExhibitId('quadrics', clusterExhibits);
    expect(r.id).toBe('quadrics');
    expect(r.fellBack).toBe(false);
  });
  it('valid non-default cluster id → that id, no fallback', () => {
    const r = resolveExhibitId('tangent-planes', clusterExhibits);
    expect(r.id).toBe('tangent-planes');
    expect(r.fellBack).toBe(false);
  });
});

describe('planUrlSync', () => {
  const base = 'https://example.com/geometer/';
  const baseWithDefault = 'https://example.com/geometer/?exhibit=quadrics';
  const baseWithTangent = 'https://example.com/geometer/?exhibit=tangent-planes';

  it("mode='none' → no write, regardless of state", () => {
    const plan = planUrlSync('tangent-planes', 'none', defaultId, baseWithDefault);
    expect(plan.write).toBe(null);
    expect(plan.href).toBe(baseWithDefault);
  });

  it('default id + bare URL → no write (settled state)', () => {
    const plan = planUrlSync(defaultId, 'replace', defaultId, base);
    expect(plan.write).toBe(null);
    expect(plan.href).toBe(base);
  });

  it("default id + ?exhibit=<defaultId> → write bare URL (canonicalize)", () => {
    const plan = planUrlSync(defaultId, 'replace', defaultId, baseWithDefault);
    expect(plan.write).toBe('replace');
    // URL normalizes to drop the trailing `?` when no params remain.
    expect(plan.href).toBe(base);
  });

  it("default id + ?exhibit=bogus → write bare URL (canonicalize)", () => {
    const plan = planUrlSync(
      defaultId,
      'replace',
      defaultId,
      'https://example.com/geometer/?exhibit=bogus',
    );
    expect(plan.write).toBe('replace');
    expect(plan.href).toBe(base);
  });

  it('non-default id + bare URL → push ?exhibit=<id>', () => {
    const plan = planUrlSync('tangent-planes', 'push', defaultId, base);
    expect(plan.write).toBe('push');
    expect(plan.href).toBe(baseWithTangent);
  });

  it('non-default id + ?exhibit=<same-id> → no write (already settled)', () => {
    const plan = planUrlSync('tangent-planes', 'push', defaultId, baseWithTangent);
    expect(plan.write).toBe(null);
    expect(plan.href).toBe(baseWithTangent);
  });

  it('non-default id + ?exhibit=<other-id> → push the new id', () => {
    const plan = planUrlSync('tangent-planes', 'push', defaultId, baseWithDefault);
    expect(plan.write).toBe('push');
    expect(plan.href).toBe(baseWithTangent);
  });

  it('preserves unrelated query params when canonicalizing default', () => {
    const plan = planUrlSync(
      defaultId,
      'replace',
      defaultId,
      'https://example.com/geometer/?exhibit=quadrics&fps=1',
    );
    expect(plan.write).toBe('replace');
    expect(plan.href).toBe('https://example.com/geometer/?fps=1');
  });

  it('preserves unrelated query params when setting a non-default id', () => {
    const plan = planUrlSync(
      'tangent-planes',
      'push',
      defaultId,
      'https://example.com/geometer/?fps=1',
    );
    expect(plan.write).toBe('push');
    expect(plan.href).toBe('https://example.com/geometer/?fps=1&exhibit=tangent-planes');
  });

  // Mode-preservation invariant (#189, plan G6): the SceneRack-nav
  // path in pancake mode rewrites `?exhibit=` on every cluster
  // switch; `?mode=desktop` / `?mode=mobile` must ride through
  // unchanged so the user doesn't fall out of pancake mid-session.
  describe('mode preservation (#189)', () => {
    it('preserves ?mode=desktop when canonicalizing default id', () => {
      const plan = planUrlSync(
        defaultId,
        'replace',
        defaultId,
        'https://example.com/geometer/?exhibit=quadrics&mode=desktop',
      );
      expect(plan.write).toBe('replace');
      expect(plan.href).toBe('https://example.com/geometer/?mode=desktop');
    });

    it('preserves ?mode=mobile when setting a non-default id from bare', () => {
      const plan = planUrlSync(
        'tangent-planes',
        'push',
        defaultId,
        'https://example.com/geometer/?mode=mobile',
      );
      expect(plan.write).toBe('push');
      expect(plan.href).toBe(
        'https://example.com/geometer/?mode=mobile&exhibit=tangent-planes',
      );
    });

    it('preserves ?mode=desktop across SceneRack-style id swap', () => {
      // SceneRack tap: was on quadrics with mode=desktop, taps the
      // tangent-planes tab. planUrlSync is called with the new id.
      const plan = planUrlSync(
        'tangent-planes',
        'push',
        defaultId,
        'https://example.com/geometer/?exhibit=quadrics&mode=desktop',
      );
      expect(plan.write).toBe('push');
      expect(plan.href).toBe(
        'https://example.com/geometer/?exhibit=tangent-planes&mode=desktop',
      );
    });

    it('preserves ?mode=desktop on no-op write (already-settled non-default)', () => {
      const plan = planUrlSync(
        'tangent-planes',
        'push',
        defaultId,
        'https://example.com/geometer/?exhibit=tangent-planes&mode=desktop',
      );
      expect(plan.write).toBe(null);
      expect(plan.href).toBe(
        'https://example.com/geometer/?exhibit=tangent-planes&mode=desktop',
      );
    });
  });
});

describe('resolveMode', () => {
  it('null requested → mode=null, no fallback (silent bare-URL boot)', () => {
    const r = resolveMode(null);
    expect(r.mode).toBe(null);
    expect(r.fellBack).toBe(false);
  });
  it('undefined requested → mode=null, no fallback', () => {
    const r = resolveMode(undefined);
    expect(r.mode).toBe(null);
    expect(r.fellBack).toBe(false);
  });
  it("empty string ('?mode=') → mode=null, fellBack=true", () => {
    const r = resolveMode('');
    expect(r.mode).toBe(null);
    expect(r.fellBack).toBe(true);
  });
  it("unknown value ('?mode=bogus') → mode=null, fellBack=true", () => {
    const r = resolveMode('bogus');
    expect(r.mode).toBe(null);
    expect(r.fellBack).toBe(true);
  });
  it("'vr' → mode='vr', no fallback", () => {
    const r = resolveMode('vr');
    expect(r.mode).toBe('vr');
    expect(r.fellBack).toBe(false);
  });
  it("'desktop' → mode='desktop', no fallback", () => {
    const r = resolveMode('desktop');
    expect(r.mode).toBe('desktop');
    expect(r.fellBack).toBe(false);
  });
  it("'mobile' → mode='mobile', no fallback", () => {
    const r = resolveMode('mobile');
    expect(r.mode).toBe('mobile');
    expect(r.fellBack).toBe(false);
  });
  it('case-sensitive: "DESKTOP" is not recognized', () => {
    // Match the existing `?exhibit=` semantics — case-sensitive.
    // Keep URL keywords lowercase by convention; an uppercased
    // value is a typo, treated like any other unknown.
    const r = resolveMode('DESKTOP');
    expect(r.mode).toBe(null);
    expect(r.fellBack).toBe(true);
  });
});

describe('combined ?mode= + ?exhibit= URLs', () => {
  // The two parsers operate on the same URL but don't share state.
  // These tests document the end-to-end shape a pancake boot will
  // see when the shell wires resolveMode in (later #105 step).
  function parseBoth(href: string): {
    exhibit: ReturnType<typeof resolveExhibitId>;
    mode: ReturnType<typeof resolveMode>;
  } {
    const params = new URL(href).searchParams;
    return {
      exhibit: resolveExhibitId(params.get('exhibit'), clusterExhibits),
      mode: resolveMode(params.get('mode')),
    };
  }

  it('?mode=desktop&exhibit=quadrics → both resolve cleanly', () => {
    const { exhibit, mode } = parseBoth(
      'https://example.com/geometer/?mode=desktop&exhibit=quadrics',
    );
    expect(exhibit.id).toBe('quadrics');
    expect(exhibit.fellBack).toBe(false);
    expect(mode.mode).toBe('desktop');
    expect(mode.fellBack).toBe(false);
  });

  it('?mode=desktop&exhibit=tangent-planes → both resolve cleanly', () => {
    const { exhibit, mode } = parseBoth(
      'https://example.com/geometer/?mode=desktop&exhibit=tangent-planes',
    );
    expect(exhibit.id).toBe('tangent-planes');
    expect(mode.mode).toBe('desktop');
  });

  it('bare URL → null mode + default exhibit, neither warns', () => {
    const { exhibit, mode } = parseBoth('https://example.com/geometer/');
    expect(exhibit.id).toBe(defaultId);
    expect(exhibit.fellBack).toBe(false);
    expect(mode.mode).toBe(null);
    expect(mode.fellBack).toBe(false);
  });

  it('?mode=bogus&exhibit=quadrics → exhibit clean, mode fellBack', () => {
    const { exhibit, mode } = parseBoth(
      'https://example.com/geometer/?mode=bogus&exhibit=quadrics',
    );
    expect(exhibit.id).toBe('quadrics');
    expect(exhibit.fellBack).toBe(false);
    expect(mode.mode).toBe(null);
    expect(mode.fellBack).toBe(true);
  });
});
