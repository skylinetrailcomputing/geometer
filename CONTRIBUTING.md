# Contributing to geometer

Thanks for your interest! `geometer` is a free, open-source passion
project — issues, PRs, and ideas are welcome.

## Before you start

- Read [`VISION.md`](VISION.md). The **VR-fit filter** section is
  the decision lens for whether a new idea belongs in this project.
  Time spent on a low-VR-fit topic is time the project would rather
  spend on a high-fit one.
- Read [`DEV_QUEST_SETUP.md`](DEV_QUEST_SETUP.md) if you'll be
  testing changes in a headset — and you generally should be.

## Filing issues

- **Bug reports:** include the URL or commit you tested, the
  headset model, browser version, and a clear description of
  expected vs actual behavior. Console errors via
  `chrome://inspect` are gold.
- **Feature ideas / new exhibits:** open an issue first before
  sending a non-trivial PR. The "is this a VR-fit topic?" check in
  `VISION.md` is easier to do in conversation than after code is
  written.
- **Polish, typos, doc fixes:** small fixes are fine as direct PRs,
  no issue needed.

## Pull requests

- **Branch from `main`.** Use `<issue-or-topic>-<short-description>`
  branch names.
- **Run pre-commit locally** before pushing:
  ```bash
  pre-commit install   # one-time per clone
  pre-commit run --all-files
  ```
  CI runs the same checks as a backstop. "Pre-commit failed in CI"
  means it would have failed for you locally too.
- **Conventional Commits** for messages — `feat:`, `fix:`, `docs:`,
  `refactor:`, `chore:`, `test:`. Body in imperative mood; one
  paragraph of "why" if the change isn't self-evident from the diff.
- **Keep PRs small.** Easier to review, faster to land.

## Previewing changes in a headset

Every PR against `main` from a branch in this repo gets an
automatic preview deploy on Cloudflare Workers, driven by the
`pr-preview` GitHub Actions workflow. Once the build finishes
(~1 minute after a push), the workflow posts a comment on the PR
with a URL of the shape

```
https://geometer-pr-<PR-number>.<account>.workers.dev
```

Open that URL in the Quest browser to smoke-test before requesting
review or merging. The preview Worker is automatically deleted
when the PR closes (merged or not).

Production continues to live at
<https://skylinetrailcomputing.github.io/geometer/> (GitHub Pages,
deployed on push to `main`); Cloudflare Workers serves PR
previews only. See [`DEV_QUEST_SETUP.md`](DEV_QUEST_SETUP.md) for
the headset's network setup.

**Fork PRs:** GitHub blocks secrets for workflows triggered from
forks, so PRs opened from a fork won't get an auto-preview. The
maintainer can deploy a preview manually if a fork PR needs
headset eyes; flag it in the PR description.

## Adding a new exhibit

If your PR introduces a new exhibit (typically `src/exhibits/<topic>/`):

- Confirm it passes the VR-fit filter from `VISION.md`. Open an
  issue first if it's a borderline case.
- Include a colocated **`SPEC.md`** — input contract (controls,
  ranges), math contract (the function being visualized;
  classification logic and edge / boundary cases if any),
  rendering invariants, explicit scope boundaries.
- Implement the `Exhibit` interface from `src/shell/Exhibit.ts` and
  call `registerExhibit(...)` at module top level so a side-effect
  import lands the registration.
- Add a side-effect `import './exhibits/<topic>'` to `src/main.ts`
  so the registration runs at boot. The shell's URL-param selector
  (`?exhibit=<id>`) routes to whichever exhibit's `id` matches.
- **Lean on `src/scaffold/`** for shared infrastructure rather than
  copying from `quadrics/`:
  - UI primitives (`Slider`, `Preset`, `SectionTab`, `Section`,
    `WorldAxes`, `Label`) live in `scaffold/ui/`. Their quadric-tuned
    constants are required constructor options — declare your scene's
    `snapDetent` / `grabRadiusMultiplier` / etc. explicitly so the
    intent is visible at the call site.
  - Math ↔ world frame helpers are in `scaffold/math/frames.ts`
    (math-Y forward = −world-Z; covered by basis-vector tests).
    Use these instead of open-coding the swap.
  - Design tokens (Wong/Okabe-Ito palette, default axis tints) are in
    `scaffold/design/tokens.ts`.
  - Performance probes (`FpsOverlay`, `RendererInfoProbe`) and
    animation helpers (`PresetTween`) plug in similarly.
- Floor + lighting are still per-scene today (no shared
  `mountStandardEnvironment` helper). Build your own; if a future
  scene shares the pattern, that's the rule-of-three trigger to
  lift it into `scaffold/`.

## Architecture decisions

For cross-cutting design choices (build tool change, rendering
approach, framework swap, dependency addition with non-trivial
footprint), an **ADR** in `docs/adr/` is welcome alongside the PR.

ADR template — short, ~30–50 lines:

- **Context:** what problem and constraints prompted the decision.
- **Decision:** what was chosen.
- **Consequences:** what becomes easier, harder, or off-limits as a
  result.

ADRs are dated and not edited after landing. If a later decision
supersedes one, write a new ADR referencing the old.

## Behavior

Be kind. Disagree with ideas, not people. Aggressive or bad-faith
engagement isn't tolerated.
