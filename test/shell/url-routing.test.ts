import { describe, it, expect } from 'vitest';
import type { Exhibit } from '@/shell/Exhibit';
import { CLUSTER_CALCULUS3 } from '@/shell/clusters';
import { resolveExhibitId, planUrlSync } from '@/shell/url-routing';

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
});
