import type { Exhibit } from './Exhibit';

// Pure URL-routing helpers for the cluster-navigation shell (#150
// step 5). Extracted from `shell.ts` so the routing logic can be
// Vitest-covered without spinning up a renderer. Keep these
// functions side-effect-free: the shell turns the planned writes
// into `history.pushState` / `replaceState` calls in `applyUrlSync`.

export type HistoryMode = 'push' | 'replace' | 'none';

export interface ResolveResult {
  // The cluster-member id we ended up on. When the requested id was
  // unrecognized / empty / non-cluster, this is `clusterExhibits[0].id`.
  id: string;
  // True when the resolver had to fall back from a non-null requested
  // value. The shell uses this to decide whether to console-warn:
  //   - `null` (bare URL, no `?exhibit=`)         → fellBack=false
  //   - `''`   (`?exhibit=` empty)                → fellBack=true
  //   - any unknown / non-cluster id              → fellBack=true
  //   - a valid cluster id                        → fellBack=false
  // The empty-string case warns because it represents a user-typed
  // (or programmatically-built) URL that meant to specify an exhibit
  // and got it wrong, vs. a bare URL which is the default-load shape.
  fellBack: boolean;
}

/**
 * Resolve an arbitrary requested id to a cluster-member id, falling
 * back to `clusterExhibits[0]` on unknown / empty values. Pure;
 * caller (`shell.ts`) handles the console-warn and the URL
 * normalization.
 */
export function resolveExhibitId(
  requested: string | null | undefined,
  clusterExhibits: readonly Exhibit[],
): ResolveResult {
  if (requested && clusterExhibits.find((e) => e.id === requested)) {
    return { id: requested, fellBack: false };
  }
  return { id: clusterExhibits[0].id, fellBack: requested != null };
}

export interface UrlSyncPlan {
  // `null` means "no history write needed" — either the URL already
  // matches the desired state, or the caller asked for `'none'`
  // (popstate, where writing would loop). Otherwise the field tells
  // the caller which `history.*State` to invoke.
  write: 'push' | 'replace' | null;
  // The target href as a fully-qualified URL string. Equal to
  // `currentHref` when `write` is `null`.
  href: string;
}

/**
 * Decide what URL to write for a given exhibit id. The cluster
 * default canonicalizes to a bare URL (no `?exhibit=` param) — this
 * preserves the "default == bare URL" invariant mid-session, not
 * just at boot, so back-button history doesn't accumulate redundant
 * `?exhibit=<defaultId>` entries when the user hops to a non-default
 * scene and back.
 */
export function planUrlSync(
  id: string,
  mode: HistoryMode,
  defaultId: string,
  currentHref: string,
): UrlSyncPlan {
  if (mode === 'none') return { write: null, href: currentHref };
  const url = new URL(currentHref);
  const isDefault = id === defaultId;
  const currentParam = url.searchParams.get('exhibit');
  if (isDefault) {
    if (currentParam === null) return { write: null, href: currentHref };
    url.searchParams.delete('exhibit');
  } else {
    if (currentParam === id) return { write: null, href: currentHref };
    url.searchParams.set('exhibit', id);
  }
  return { write: mode, href: url.toString() };
}
