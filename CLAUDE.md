# geometer

WebXR sandbox of geometry exhibits for STEM undergraduates. See
[`README.md`](README.md), [`VISION.md`](VISION.md), and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for project-level context and
the contribution flow.

## Stack

TypeScript + Three.js + Vite. WebXR via the platform `navigator.xr`
API; HTTPS or `localhost` is required for any XR session. Pages
deployment from `main` via `.github/workflows/pages.yml`.

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
