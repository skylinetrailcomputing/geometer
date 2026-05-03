# geometer

> Geometric reasoning for STEM undergrads, in WebXR.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A free, open-source WebXR sandbox of geometry exhibits aimed at undergraduate students of calculus, linear algebra, and differential equations. The thesis: VR earns its keep on math where the bottleneck for the learner is *3D spatial intuition* — quadric surfaces, vector fields, eigenvectors and eigenspaces, ODE phase portraits in 3D.

**Status:** v0.1 — `quadrics` exhibit shipped. Slider-driven
`ax² + by² + cz² = d` explorer with live family classification,
per-slider value labels, and world-axis gridlines on the surface for
3D depth cues.

## Demo

![Quadric surfaces exhibit on Quest 3S — drag the four sliders (a, b, c, d) to morph the surface; the family label updates in real time across degeneracy boundaries](screenshots/quadrics.png)

Drag the `a`, `b`, `c`, `d` sliders to morph the surface; the family
label classifies the result in real time as you cross degeneracy
boundaries (Ellipsoid → Hyperboloid → Cone → ...).

## Try it

Live at <https://skylinetrailcomputing.github.io/geometer/>. Open in either:

- A **Quest browser** (Quest 3, 3S, 2, Pro) — see [`DEV_QUEST_SETUP.md`](DEV_QUEST_SETUP.md) for first-run guidance.
- **Desktop Chrome** with WebXR enabled — useful for inspection, but a connected headset is needed to enter a real VR session.

Click **Enter VR** once the page loads.

## Run locally

Requires Node 20+ and npm.

```bash
git clone https://github.com/skylinetrailcomputing/geometer.git
cd geometer
npm install
npm run dev
```

Then open the printed URL on `localhost`. WebXR sessions require either `localhost` or HTTPS — local dev with a tethered headset works on `localhost`. For over-the-network testing on a Quest, deploy to GitHub Pages or use an HTTPS tunnel (ngrok, etc.).

## Roadmap

- **MVP exhibit:** slider-driven quadric surfaces — `ax² + by² + cz² = d` with live family classification (Ellipsoid / Hyperboloid of two sheets / Cone / etc.) as parameters morph through degenerate cases.
- **Next:** linear algebra core — eigenvectors visualized on the unit-sphere → ellipsoid mapping, determinant as signed volume, matrix composition as physical chaining of transforms.
- **Later:** vector fields in 3D, ODE phase portraits, parametric surfaces (Möbius, Klein bottle).

## Contributing

Issues and PRs welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for workflow and conventions, and [`VISION.md`](VISION.md) for the project's thesis and what makes a topic a fit.

## License

MIT, copyright © 2026 Skyline Trail Computing LLC.

## Background

A 2026 reincarnation of an Unreal Engine VR-for-undergrad-calculus POC originally explored in 2016 — re-platformed to WebXR for friction-free distribution.
