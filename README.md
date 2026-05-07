# geometer

> Geometric reasoning for STEM undergrads, in WebXR.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A free, open-source WebXR sandbox of geometry exhibits aimed at undergraduate students of calculus, linear algebra, and differential equations. The thesis: VR earns its keep on math where the bottleneck for the learner is *3D spatial intuition* — quadric surfaces, vector fields, eigenvectors and eigenspaces, ODE phase portraits in 3D.

**Status:** v0.4 — `quadrics` exhibit shipped. Slider-driven
`ax² + by² + cz² = d` explorer with live family classification, a
two-line equation readout, a canonical-pose preset grid with
animated family-transition tweens, parametric / world-axis
gridlines for depth cues, and a section rack covering cross-sections
(a sliding intersection plane that traces a glowing curve through
the surface) and linear terms (`u`, `v`, `w` sliders that translate
the surface off-center).

## Demo

<video src="https://github.com/user-attachments/assets/1b445e07-f5fd-4c77-a23d-d0cc45765b55" autoplay loop muted playsinline width="720" aria-label="Quest 3S view of the quadrics exhibit: dragging coefficient sliders to morph the implicit surface, sweeping a horizontal slicing plane through it to trace a glowing intersection ring, and tapping canonical-pose preset buttons, with the live family classifier updating in step">
  Your browser does not support inline video.
</video>

Drag the `a`, `b`, `c`, `d` sliders to morph the surface, or tap a
canonical-pose preset button (Sphere, Cone, H 1-sheet, …) for an
animated transition between named family members. The family label
classifies the result in real time as parameters cross degeneracy
boundaries (Ellipsoid → Hyperboloid → Cone → ...).

## Try it

Live at <https://skylinetrailcomputing.github.io/geometer/>. Click **Enter VR** once the page loads.

Headset paths that work today:

- **Quest browser** (Quest 3, 3S, 2, Pro) — open the link directly on the headset. See [`DEV_QUEST_SETUP.md`](DEV_QUEST_SETUP.md) for first-run guidance.
- **Desktop Chrome with a tethered headset** — useful for development and inspection.

### Without a headset

A first-class **native pancake build** — desktop (mouse + keyboard, WASD or orbit) and mobile (touch), designed from the ground up for non-VR rather than emulating headset controllers — is on the roadmap. Tracked in [#105](https://github.com/skylinetrailcomputing/geometer/issues/105).

WebXR emulator extensions (Meta's Immersive Web Emulator, Mozilla's WebXR API Emulator) are **not a supported path**. As discussed in [#80](https://github.com/skylinetrailcomputing/geometer/issues/80), Meta's IWE structurally can't render Three.js content in current Chromium because it doesn't polyfill the WebXR Layers API — Chromium ≥147 forces Three.js down the `XRWebGLBinding` path regardless of the `'layers'` feature flag, and there's no three.js-side fix. Even when emulators do work mechanically, headset-controller emulation isn't an intuitive desktop UX. For now, a real Quest (3 / 3S / 2 / Pro) is the headset path.

## Run locally

Requires Node 20+ and npm.

```bash
git clone https://github.com/skylinetrailcomputing/geometer.git
cd geometer
npm install
npm run dev
```

Then open the printed URL on `localhost`. WebXR sessions require either `localhost` or HTTPS — local dev with a tethered headset works on `localhost`. For over-the-network testing on a Quest, deploy to GitHub Pages or use an HTTPS tunnel (ngrok, etc.).

`npm test` runs the unit suite (vitest) — currently scoped to pure-logic modules (classifier, future slider/routing math). Most of the exhibit's behavior is verified manually in headset; the unit suite covers what's silently breakable between sessions.

## Roadmap

The roadmap sequences exhibits around specific undergraduate courses where 3D spatial intuition is the rate-limiting step, rather than as a generic feature list. The first targeted course is [**APPM 2350**](https://www.colorado.edu/amath/media/6142): *Calculus 3 for Engineers* at CU Boulder.

### Now → v1.0: APPM 2350 quadrics cluster (target: fall 2026)

v1.0 ships a cluster of programmatically separate scenes — each focused on a distinct early-course stuck-point — that share infrastructure (camera, design language, scene navigation):

- **Quadrics manipulator** *(shipped through v0.5)* — slider-driven implicit-surface explorer with live family classification, cross-sections, and linear-term translation. §10.6.
- **Tangent planes** *(v0.6)* — moving tangent plane attached to the surface, sliding the contact point continuously. §11.4.
- **Gradient / level surfaces** *(v0.7)* — §11.6.
- **Saddle / extrema** *(v0.8)* — §11.7–11.8.
- **Basic pancake build** *(v0.9)* — desktop + mobile non-VR scaffolded alongside the Quest experience.

### Beyond v1.0 (still APPM 2350)

Higher-impact pedagogy, but architecturally novel scene shapes; sequenced after the v1.0 cluster ships:

- **Stokes' / Green's / Gauss' coalescence** — tiny curl- and divergence-integrals on surface and volume elements coalescing into the boundary path or surface integral. §13.E–G.
- **Path integral unrolling** — bending a 1D Calc 1/2 integral into a 2D arc and back. §13.A.

### Later: APPM 2360 (Differential Equations with Linear Algebra)

Targeting spring or summer 2027. Eigenvectors visualized as the unit-sphere → ellipsoid mapping, determinants as signed volume, ODE phase portraits in 2D and 3D, vector fields as flow.

### Reach (form factors)

- **Headset** — Quest 3, 3S, 2, Pro. Current default.
- **Native pancake build** ([#105](https://github.com/skylinetrailcomputing/geometer/issues/105)) — desktop + mobile, scaffolded in v0.9 for v1.0 and polished post-1.0.

## Contributing

Issues and PRs welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for workflow and conventions, and [`VISION.md`](VISION.md) for the project's thesis and what makes a topic a fit.

## License

MIT, copyright © 2026 Skyline Trail Computing LLC.

## Background

A 2026 reincarnation of an Unreal Engine VR-for-undergrad-calculus POC originally explored in 2016 — re-platformed to WebXR for friction-free distribution.
