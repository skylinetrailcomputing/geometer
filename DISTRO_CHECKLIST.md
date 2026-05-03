# geometer — distribution checklist

Pre-distribution gate. Items below must be resolved (or explicitly
waived in this file, with reason) before this app ships beyond your
own devices.

Companion docs:
- `~/claude-workspace-2026/knowledge/legal-entity-for-apps.md` —
  entity strategy, EULA mechanics, E&O thresholds,
  attorney-consult triggers. Authoritative for the "why."
- This project's `README.md` — distribution scope and current
  status.

## Entity & legal posture

- [x] LLC publisher of record confirmed — **Skyline Trail Computing
  LLC** (see `LICENSE`, `README.md` copyright line).
- [x] EULA reviewed — **N/A for v0.1**. Free OSS distribution under
  MIT; no proprietary EULA layered on top.
- [x] E&O / Tech professional liability — **N/A for v0.1**. Geometer
  is an educational math visualization. No user-injury surface
  (health, finance, safety, dietary); renderer falsification is
  non-injury.
- [x] Per-app attorney consult — **N/A for v0.1**. No triggers per
  `legal-entity-for-apps.md` §7 (no PII, no money, no claims about
  real-world objects).

## App Store / Play Store paperwork

**Section-level N/A for v0.1.** Geometer v0.1 distributes via GitHub
Pages (free, public, OSS web app); it is not a native iOS / Android /
Quest store app, so store-specific paperwork doesn't apply. Revisit
this section if/when geometer is bundled for the Quest Store or
another native channel.

- [x] Privacy Policy — **N/A**: zero-data web app, no analytics, no
  cookies, no telemetry, no accounts.
- [x] App Store Connect "App Privacy" questionnaire — **N/A**: not
  store-distributed.
- [x] Apple Small Business Program — **N/A**: free, no paid tier,
  not store-distributed.
- [x] Listing copy reviewed — **N/A** beyond the README, which is
  reviewed under the marketing-copy guardrails below.

## In-app surfaces

- [x] First-launch disclaimer — **N/A for v0.1**. App makes no
  claims users could rely on; pure educational visualization of
  mathematically derivable classifications.
- [x] Persistent About / Disclaimers — **N/A for v0.1**. Pure
  utility, no claims to disclaim.
- [x] Verdict / rating UX honest about uncertainty — **N/A for
  v0.1**. No verdicts. Deterministic mathematical classification
  with the full taxonomy specified in
  `src/exhibits/quadrics/SPEC.md`.

## Marketing copy guardrails

Never use, anywhere (App Store listing, marketing site, in-app
copy, screenshots, social):
- "guaranteed", "always", "100%"
- "safe for [allergy / condition]"
- Health, medical, or dietary-advice claims unless the app is
  actually registered as a medical device

Reviewed for v0.1: `README.md`, in-exhibit text (family taxonomy,
slider labels), and SPEC documents contain none of the above. The
geometer marketing surface is small (README + the GitHub Pages
landing) and contains no claims.

## App-specific risk bright-lines

**Section waived for v0.1.** Geometer is pure utility with no
meaningful risk surface: no claims, no PII, no money, no health /
safety / dietary content, no advice. The "worst thing a user could
believe" based on the exhibit's output is that a rendered quadric
surface and its mathematical classification label match the
underlying equation — and that is the deterministic, documented
behavior in `SPEC.md`.

## Sign-off

- [x] All items above either checked or explicitly waived (with
  reason recorded inline).
- [x] This file reviewed at v0.1 GitHub Pages distribution
  (2026-05-03). The TestFlight / public-listing trigger is
  inapplicable for v0.1's web distribution and will be re-walked
  if/when geometer is bundled for a native store.
