import type { Exhibit } from './Exhibit';

// Pure URL-routing helpers for the cluster-navigation shell (#150
// step 5). Extracted from `shell.ts` so the routing logic can be
// Vitest-covered without spinning up a renderer. Keep these
// functions side-effect-free: the shell turns the planned writes
// into `history.pushState` / `replaceState` calls in `applyUrlSync`.

export type HistoryMode = 'push' | 'replace' | 'none';

// Form-factor modes the shell can boot into (#189, pancake step 1
// of #105). `'vr'` is today's path; `'desktop'` + `'mobile'` are
// pancake form factors landing in later #105 steps. Listed as a
// `const` tuple so the runtime check in `resolveMode` and the
// `Mode` type stay in lockstep — adding a fourth mode (e.g.,
// emulator) is a single-line change here.
export const MODES = ['vr', 'desktop', 'mobile'] as const;
export type Mode = (typeof MODES)[number];

export interface ModeResolveResult {
  // The mode the user explicitly requested via `?mode=`, or `null`
  // when there was no usable override and the caller should fall
  // through to auto-detect (per plan §3.2). Mirrors
  // `resolveExhibitId`'s shape, but the "default" for mode is the
  // async `isSessionSupported` probe — not a synchronously
  // resolvable value — so we return `null` rather than picking one.
  mode: Mode | null;
  // True when the resolver had to fall back from a non-null
  // requested value. Same console-warn semantics as
  // `resolveExhibitId.fellBack`:
  //   - `null` / `undefined` (no `?mode=`)  → fellBack=false
  //   - `''`  (`?mode=` empty)              → fellBack=true
  //   - any unknown value                   → fellBack=true
  //   - one of `MODES`                      → fellBack=false
  fellBack: boolean;
}

/**
 * Parse a `?mode=` value into a recognized `Mode` or `null` for
 * "no override; auto-detect." Pure; the shell handles the
 * console-warn and the async mode probe per plan §3.2.
 */
export function resolveMode(
  requested: string | null | undefined,
): ModeResolveResult {
  if (requested != null && (MODES as readonly string[]).includes(requested)) {
    return { mode: requested as Mode, fellBack: false };
  }
  return { mode: null, fellBack: requested != null };
}

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
 *
 * Mode-preservation invariant (#189, plan G6): this function only
 * mutates the `exhibit` search param, so any unrelated params on
 * `currentHref` — including `?mode=` for pancake form-factor
 * selection — survive the rewrite. SceneRack navigation in pancake
 * therefore preserves `mode=desktop` (or `mobile`) for free.
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
