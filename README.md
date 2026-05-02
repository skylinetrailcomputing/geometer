# geometer

> Geometric reasoning for STEM undergrads, in WebXR.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A free, open-source WebXR sandbox of geometry exhibits aimed at undergraduate students of calculus, linear algebra, and differential equations. The thesis: VR earns its keep on math where the bottleneck for the learner is *3D spatial intuition* — quadric surfaces, vector fields, eigenvectors and eigenspaces, ODE phase portraits in 3D.

**Status:** Pre-MVP. This commit is the scaffold; the first exhibit (a slider-driven quadric surfaces explorer) is next.

## Try it

> Coming soon. Once deployed, open this URL in a WebXR-capable browser (Quest browser, Chrome with WebXR enabled, etc.) and click **Enter VR**.

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

Issues and PRs welcome. Before opening a PR, run `pre-commit run --all-files` locally — the hooks check for accidental secret commits.

## License

MIT, copyright © 2026 Skyline Trail Computing LLC.

## Background

A 2026 reincarnation of an Unreal Engine VR-for-undergrad-calculus POC originally explored in 2016 — re-platformed to WebXR for friction-free distribution.
