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

- [ ] LLC publisher of record confirmed
- [ ] EULA reviewed (Apple Standard EULA + any project-specific
  addendum)
- [ ] E&O / Tech professional liability bound *if* this app has a
  user-injury surface (health, finance, safety, dietary). See
  `legal-entity-for-apps.md` §4-5 to decide.
- [ ] Per-app attorney consult complete *if* this app warrants
  per-project legal review (see `legal-entity-for-apps.md` §7
  for triggers)

## App Store / Play Store paperwork

- [ ] Privacy Policy authored and hosted (required by App Store
  even for zero-data apps)
- [ ] App Store Connect "App Privacy" questionnaire answered
- [ ] Apple Small Business Program enrolled if any paid tier
  (drops commission 30% → 15%; Skyline qualifies)
- [ ] Listing copy reviewed against marketing-copy guardrails
  below

## In-app surfaces

- [ ] First-launch disclaimer screen *if* the app makes any
  claim users could rely on (verdicts, recommendations, scores)
- [ ] Persistent "About / Disclaimers" link in app settings
- [ ] Verdict / rating UX honest about uncertainty — don't
  collapse to a binary when the underlying data isn't binary

## Marketing copy guardrails

Never use, anywhere (App Store listing, marketing site, in-app
copy, screenshots, social):
- "guaranteed", "always", "100%"
- "safe for [allergy / condition]"
- Health, medical, or dietary-advice claims unless the app is
  actually registered as a medical device

## App-specific risk bright-lines

_(Fill in 1-3 bright lines specific to this app's risk surface.
What's the worst thing a user could believe based on the app's
output? Document the line and the marketing/UX rules that
prevent crossing it. If this app has no meaningful risk surface
(pure utility, no claims, no PII, no money), say so explicitly
and waive this section.)_

- _(...)_

## Sign-off

- [ ] All items above either checked or explicitly waived (with
  reason recorded inline)
- [ ] This file reviewed at the moment of TestFlight expansion
  / public listing
