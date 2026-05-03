# geometer

@/Users/bradmartin/claude-workspace-2026/knowledge/projects/geometer.md

## Multi-agent autonomy policy
@/Users/bradmartin/claude-workspace-2026/knowledge/agents/autonomy-policy.md

## Open-source repo policy
@/Users/bradmartin/claude-workspace-2026/knowledge/oss-repo-policy.md

## Repo-specific rules

- **Public OSS repo.** Never commit anything that references FullContact
  or Ziff Davis systems, internal account IDs, proprietary data shapes,
  or other day-job artifacts. The work/personal wall in
  `~/.claude/CLAUDE.md` applies to everything in this directory.
- **Pre-commit hygiene.** `pre-commit` hooks run gitleaks + standard
  fixers before every commit. If a hook ever blocks legitimate work,
  fix the underlying issue rather than `--no-verify`-ing.
- **Author identity.** Commits are authored by Brad's personal Gmail
  (`1bradley.martin1@gmail.com`) — never the deprecating CU Boulder
  email, which is explicitly banned in `.gitleaks.toml` (rule id
  `deprecated-cu-email`).
- **Distribution.** Public, MIT-licensed, copyright Skyline Trail
  Computing LLC. Deployed via GitHub Pages from `main` (workflow:
  `.github/workflows/pages.yml`).
- **Stack.** TypeScript + Three.js + Vite. WebXR via the platform
  `navigator.xr` API; HTTPS or `localhost` is required for any XR
  session.
