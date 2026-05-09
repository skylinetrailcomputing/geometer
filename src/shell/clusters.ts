// Cluster identifiers — single source of truth for the SceneRack visibility
// filter (#150) and any future per-cluster routing. Each "season" of geometer
// (per the Decisions log in `_private/...`) maps to one CU course-aligned
// cluster: APPM 2350 (Calculus 3) is the v1.0 cluster; APPM 2360 (Diff Eq +
// Linear Algebra) is the planned next.
//
// `Exhibit.cluster?` is typed as `ClusterId` rather than raw `string` so a
// typo of the literal (e.g. 'calc3' instead of 'calculus3') widens the type
// to plain `string` and visibly fails the autocomplete — the same silent-
// miss as a string admits, but the literal is much harder to mistype.
// `(string & {})` is the standard "literal-narrows-but-string-still-allowed"
// trick: future cluster names can be added as additional consts without the
// type fighting back.

export const CLUSTER_CALCULUS3 = 'calculus3' as const;

export type ClusterId = typeof CLUSTER_CALCULUS3 | (string & {});
