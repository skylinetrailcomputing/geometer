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

Every PR against `main` gets an automatic Cloudflare Workers
preview deploy. The Cloudflare GitHub bot posts the unique preview
URL as a comment on the PR once the build finishes (~1 minute
after a push). Open that URL in the Quest browser to smoke-test
before requesting review or merging.

Production continues to live at
<https://skylinetrailcomputing.github.io/geometer/> (GitHub Pages,
deployed on push to `main`); Cloudflare Workers serves the PR
previews only. See [`DEV_QUEST_SETUP.md`](DEV_QUEST_SETUP.md) for
the headset's network setup.

## Adding a new exhibit

If your PR introduces a new exhibit (typically `src/exhibits/<topic>/`):

- Confirm it passes the VR-fit filter from `VISION.md`. Open an
  issue first if it's a borderline case.
- Include a colocated **`SPEC.md`** — input contract (controls,
  ranges), math contract (the function being visualized;
  classification logic and edge / boundary cases if any),
  rendering invariants, explicit scope boundaries.
- Add the exhibit to the shared shell's exhibit registry so users
  can navigate to it.

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
