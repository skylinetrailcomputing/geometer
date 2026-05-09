# geometer

WebXR sandbox of geometry exhibits for STEM undergraduates. See
[`README.md`](README.md), [`VISION.md`](VISION.md), and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for project-level context and
the contribution flow.

## Stack

TypeScript + Three.js + Vite. WebXR via the platform `navigator.xr`
API; HTTPS or `localhost` is required for any XR session. Pages
deployment from `main` via `.github/workflows/pages.yml`.

## Source layout

- `src/main.ts` — entry; imports each exhibit as a side-effect
  registration and calls `bootShell()`.
- `src/shell/` — the WebXR shell: scene/camera/renderer setup, the
  `Exhibit` interface (mount/update/unmount + `onSelectStart` /
  `onSelectEnd`), the registry, the `SceneRack` cluster-navigation
  surface, and the `?exhibit=<id>` URL router. The shell owns the
  XR controllers and dispatches `selectstart` / `selectend` to the
  currently-mounted exhibit (rack-first-refusal: a tap on a
  SceneTab is consumed by the rack and not forwarded). Cluster
  membership is set per-exhibit via `Exhibit.cluster?: ClusterId`
  (see `shell/clusters.ts`); only cluster members appear in the
  rack and are reachable via `?exhibit=<id>` — non-cluster
  exhibits stay registered but are reachable only via direct dev
  import. URL routing helpers (`resolveExhibitId`, `planUrlSync`)
  and the request-and-defer scheduler live in `shell/url-routing.ts`
  and `shell/switch-scheduler.ts`; both are pure and Vitest-covered.
- `src/scaffold/` — domain-agnostic primitives shared across
  exhibits (#120). Subdivided by concern:
  - `scaffold/design/tokens.ts` — Wong/Okabe-Ito palette + axis tints.
  - `scaffold/math/frames.ts` — math ↔ world frame helpers (math-Y
    forward maps to −world-Z; tested in `test/scaffold/math/`).
  - `scaffold/ui/` — `Slider`, `Preset`, `SectionTab`, `SceneTab`,
    `Section`, `WorldAxes`, `Label`, `rayHit`. Quadric-tuned
    constants (`snapDetent`, `grabRadiusMultiplier`) are required
    ctor opts; each scene declares the design-feel choice explicitly.
  - `scaffold/perf/` — `FpsOverlay`, `RendererInfoProbe`.
  - `scaffold/anim/PresetTween` — durationMs + easing required opts.
- `src/exhibits/<topic>/` — per-exhibit code. Each exhibit owns its
  own `index.ts` (Exhibit impl), domain math (e.g.,
  `quadrics/classify.ts`), and `SPEC.md`. Imports from `@/scaffold/...`
  via the path alias configured in `vite.config.ts` + `tsconfig.json`.

When adding a new scene, see `CONTRIBUTING.md` → "Adding a new exhibit"
and lean on `src/scaffold/` rather than copying from quadrics.

## Headset smoke-testing

Every PR gets an auto-deployed Cloudflare Worker preview URL
(commented on the PR ~1 min after push). **Headset smoke-testing
happens there, not against `npm run dev` / localhost** — a Quest
on the network can't reach a laptop's dev server without extra
tunneling setup. So when a change needs in-headset eyes, the
Cloudflare PR preview is the surface; don't suggest "open
localhost in the Quest browser." Full details — fork-PR caveat,
production URL, network setup pointer — in
[`CONTRIBUTING.md`](CONTRIBUTING.md) → "Previewing changes in a
headset."

## Repo conventions

- **Public OSS repo, MIT-licensed, copyright Skyline Trail Computing
  LLC.** Never commit secrets, credentials, or proprietary content.
- **Pre-commit hygiene.** `pre-commit` hooks (gitleaks + standard
  fixers) run before every commit, with CI as a backstop. Fix the
  underlying issue rather than `--no-verify`-ing.
- **Conventional Commits** for messages (`feat:`, `fix:`, `docs:`,
  `refactor:`, `chore:`, `test:`); see `CONTRIBUTING.md`.
- **Branch protection on `main`:** PR required, the `gitleaks` check
  must pass, no force-push or delete.

## Maintainer-side Claude Code context

A git-ignored `CLAUDE.local.md` alongside this file holds the
maintainer's personal Claude Code context — workspace cross-references,
author-identity rules, agent autonomy policy. It's auto-loaded by
Claude Code in addition to this file. Not required to contribute to
or build the project; nothing in it changes the public contract above.
