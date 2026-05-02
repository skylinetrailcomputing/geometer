# Quest 3S setup + dev loop

> Quick guide for working on `geometer` with a Quest 3S in standalone
> mode. Assumes a stock 3S out of the box and a Mac for development.
> Quest 3 also fine — both share the same chip and software, the only
> differences are optics and lens type. Notes on price and tradeoffs
> are aimed at student-budget setups.

## What you need

- A **Quest 3S** with a charged battery. $299 retail for the 128 GB
  model as of 2026 — the most affordable WebXR-capable headset that
  isn't end-of-life. Quest 3 ($499, sharper optics) is also fine but
  not required.
- A **Meta account** associated with the headset (sign in once during
  setup; required by Meta as of 2024+).
- **Wi-Fi** the headset can join. The dev loop and the deployed Pages
  URL both need network access.
- A **Mac** with this repo cloned and the toolchain working
  (`npm run dev`, `npm run build`).
- ~2 m × 2 m of clear space for a Boundary / Guardian setup.

## One-time Quest setup

1. **Boot, pair, sign in** through the on-device flow with a Meta
   account.
2. **Set IPD.** Quest 3S has three physical detents (58 / 63 / 68
   mm). Use whichever feels sharpest when reading text at arm's
   length. If you're between sizes, try both adjacent positions
   before judging — small mismatch is usually fine for math-viz at
   our scale.
3. **Set up Boundary.** `geometer` is a stationary experience (no
   locomotion), so "Stationary" mode is fine. A small roomscale
   boundary works too if you want to take a step back from a surface.
4. **No developer mode required.** WebXR in the Quest Browser
   doesn't need developer mode or sideloading. Skip the developer
   setup flow unless you want to sideload APKs later for unrelated
   reasons.

## Daily dev loop — Pages-deploy workflow

The simplest possible dev loop, used by default until iteration speed
hurts:

1. **Edit code locally on your Mac.**
2. **Commit + push to `main`** on `skylinetrailcomputing/geometer`.
   Pre-commit hooks run gitleaks + standard fixers; CI runs gitleaks
   again as a backstop, then the `deploy-pages` workflow builds and
   deploys.
3. **In the Quest Browser, refresh** the deployed URL:
   <https://skylinetrailcomputing.github.io/geometer/>. Click **Enter
   VR**. You're in the new build.

Cycle time: roughly **30–60 s** from `git push` to "the headset sees
it." Fine for small UI tweaks, reading errors, and confirming a
deploy works. *Painful* if you're hot-tweaking shader code or
numerical constants.

To open the browser inside the headset: from the home view, hit the
apps grid → search or scroll for "Meta Browser" / "Quest Browser."
Bookmark the URL on the first visit so reopens are one tap.

## When to upgrade the dev loop

Switch to a local HTTPS dev server when the deploy loop is the
bottleneck — typically once you're iterating multiple times a minute
on shader / numerical / interaction code.

WebXR sessions require either `localhost` *or* HTTPS, so plain
`npm run dev` over your LAN won't work — the Quest Browser will load
the page but `navigator.xr.requestSession()` will refuse because
plain-HTTP-over-LAN isn't a secure context. Two workable patterns:

- **Cloudflared / ngrok tunnel.** Run `npm run dev` on your Mac,
  expose `http://localhost:5173` via the tunnel as a public HTTPS
  URL, open that URL in the Quest Browser. Sub-second feedback; mild
  tunnel latency. Free tiers are fine for solo dev.
- **`mkcert` + `vite-plugin-mkcert`.** Local cert authority on your
  Mac, install the root cert on the Quest once, then Vite serves
  HTTPS on your LAN. Fastest feedback, no third-party dependency.
  Slight one-time setup ceremony installing the cert on the headset.

Don't wire either pre-emptively. Start with the deploy loop and
upgrade only when the cadence actually hurts.

## Remote debugging from your Mac

When you need to see a console error from inside the headset:

1. **USB-C cable** between Quest and Mac.
2. On the Quest, accept the "Allow USB debugging" prompt the first
   time.
3. On Mac, open Chrome → `chrome://inspect` → enable "Discover USB
   devices" → your Quest appears with the open Browser tab listed
   under it.
4. Click **inspect** — you get full Chrome DevTools attached to the
   in-headset browser tab. Console, Sources, Network, all of it.

Overkill for most sessions; invaluable when WebXR silently fails or
a shader compile error leaves you staring at a black screen.

## Useful Quest tricks

- **Casting.** Mirror the headset view to a desktop or phone for
  pair-debugging or demo recording. The Meta Quest mobile app has a
  Cast button on its home screen — easiest path. There's also a
  desktop casting page (Meta moves the URL around between releases;
  search "Meta Quest casting" if the path in the mobile app doesn't
  obviously surface it).
- **Bookmarks.** The Quest Browser supports them like desktop Chrome.
  Pin the Pages URL on first visit; reopens are one tap thereafter.
- **Chromium-flavored.** WebXR, WebGL2, WebGPU (where exposed), Web
  Audio, Gamepad API — all work as on desktop Chrome.

## Comfort + safety, briefly

- Stationary scenes (no locomotion) are the easiest case for motion
  sickness — every `geometer` exhibit on the roadmap is in this
  category. You shouldn't get queasy. If you do, look at the floor
  for a few seconds and take a 10-minute break.
- Take a break every 30 min for the first few sessions while you
  acclimate.
- Stay hydrated. Easy to forget when you're heads-down debugging in
  VR.

## Controllers vs hand tracking

For now: **use the bundled Touch Plus controllers.** Sliders need
sub-mm precision and controllers deliver it more reliably than
hand-tracked pinch. Hand-tracking support is a v0.2 goal once the
slider exhibit is solid.

## What this guide doesn't cover

- **Sideloading APKs / native dev** — `geometer` is a pure WebXR
  app, no APK side. If you're here to do native Quest dev on
  something else, look up the Meta XR SDK documentation; this guide
  is browser-only.
- **Quest Link / Air Link to a Mac** — historically finicky, and
  you don't need it for WebXR (the page runs *in* the headset
  browser, on the Quest's GPU). Skip.
- **Multi-user testing** — if you ever want a second tester to try
  a build, just send them the Pages URL. No accounts, no install.
