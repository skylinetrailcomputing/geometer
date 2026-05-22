import { describe, expect, it } from 'vitest';

// Static-grep regression guards for the #225 / E1.4 PR2 cluster-on-plinth
// port (`_private/plans/251-cluster-on-plinth.md` §5).
//
// These tests catch the easy mechanical regression class — a future
// scene copying the old grab-radius import from a sibling, or a refactor
// reintroducing a world-frame UI anchor — that would not visibly
// misplace any primitive in headset smoke. They run as part of the
// standard Vitest invocation; Vite's `import.meta.glob` enumerates the
// repo at config-resolution time, so no Three.js context or filesystem
// API is required.

// Every .ts file under src/ as { path -> contents } at config time.
// `eager: true` makes the glob synchronous; `query: '?raw'` returns the
// raw file text; `import: 'default'` unwraps the default export.
const allSrcTsFiles = import.meta.glob<string>('../../src/**/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// Subset of the same map restricted to the three target scene files —
// the world-frame UI anchors that the port deletes are scoped to these
// files only.
const targetScenePaths = [
  '../../src/exhibits/tangent-planes/index.ts',
  '../../src/exhibits/gradient-levels/index.ts',
  '../../src/exhibits/saddle-extrema/index.ts',
] as const;

// ────────────────────────────────────────────────────────────────────
// Sanity — a future repo restructure that breaks the glob should fail
// loudly here rather than silently passing zero assertions.
// ────────────────────────────────────────────────────────────────────

describe('cluster-on-plinth — test setup', () => {
  it('glob collects .ts files from src/', () => {
    expect(Object.keys(allSrcTsFiles).length).toBeGreaterThan(50);
  });

  it.each(targetScenePaths)('target scene exists: %s', (path) => {
    expect(allSrcTsFiles[path]).toBeTypeOf('string');
  });
});

// ────────────────────────────────────────────────────────────────────
// Static-grep assertions
// ────────────────────────────────────────────────────────────────────

function findMatches(
  pattern: RegExp,
  files: Record<string, string>,
): { path: string; line: number; text: string }[] {
  const hits: { path: string; line: number; text: string }[] = [];
  for (const [path, src] of Object.entries(files)) {
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        hits.push({ path, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return hits;
}

describe('cluster-on-plinth — static-grep regression guards', () => {
  // Scope explicitly `.ts` only — `quadrics/SPEC.md`'s pre-PR2 prose
  // is rewritten in PR2 per the plan's §2.0, but the test's regression
  // target is import-by-source, not doc text. Plan v3 §5 / §6 narrows
  // the assertion scope explicitly.
  it('zero `GRAB_RADIUS_MULTIPLIER` references in .ts files repo-wide', () => {
    // Negative lookahead so `GRAB_RADIUS_MULTIPLIER_PLINTH` (the
    // successor constant) doesn't match.
    const pattern = /\bGRAB_RADIUS_MULTIPLIER\b(?!_PLINTH)/;
    const hits = findMatches(pattern, allSrcTsFiles);
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  // Scaffold-level legacy anchors: `SLIDER_RACK_CENTER` (the named
  // handle), `SLIDER_RACK_CENTER_COORDS` (the tuple), and
  // `createSliderRackCenter` (its factory) all lived in
  // `clusterRackTokens.ts` alongside the deleted `GRAB_RADIUS_MULTIPLIER`
  // and were deleted at PR2. Checked repo-wide so a future scene
  // author can't reintroduce them by re-extracting a factory into
  // scaffold.
  const scaffoldLegacy = [
    'SLIDER_RACK_CENTER',
    'SLIDER_RACK_CENTER_COORDS',
    'createSliderRackCenter',
  ];
  it.each(scaffoldLegacy)(
    'zero `%s` references in .ts files repo-wide',
    (symbol) => {
      const pattern = new RegExp(`\\b${symbol}\\b`);
      const hits = findMatches(pattern, allSrcTsFiles);
      expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
    },
  );

  // Scene-local legacy anchors: `READOUT_POSITION` and
  // `AXIS_INDICATOR_POSITION` were per-scene world-frame `Vector3`s,
  // never in scaffold. The regression class is "a target scene
  // re-introduces a world-frame position," so the guard is scoped to
  // the three target scenes' index.ts files. (Quadrics has historical
  // doc-comments listing the names — those are intentional change
  // notes, not regressions.)
  const sceneLocalLegacy = ['READOUT_POSITION', 'AXIS_INDICATOR_POSITION'];
  const targetSceneFiles = Object.fromEntries(
    targetScenePaths
      .map((p) => [p, allSrcTsFiles[p]] as const)
      .filter(([, src]) => typeof src === 'string'),
  );
  it.each(sceneLocalLegacy)(
    'zero `%s` references in the three target scene index.ts files',
    (symbol) => {
      const pattern = new RegExp(`\\b${symbol}\\b`);
      const hits = findMatches(pattern, targetSceneFiles);
      expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
    },
  );
});
