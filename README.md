# geometer

> Geometric reasoning for STEM undergrads, in WebXR.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A free, open-source WebXR sandbox of geometry exhibits aimed at undergraduate students of calculus, linear algebra, and differential equations. The thesis: VR earns its keep on math where the bottleneck for the learner is *3D spatial intuition* — quadric surfaces, vector fields, eigenvectors and eigenspaces, ODE phase portraits in 3D.

**Status:** v0.1 — `quadrics` exhibit shipped. Slider-driven
`ax² + by² + cz² = d` explorer with live family classification,
per-slider value labels, and world-axis gridlines on the surface for
3D depth cues.

## Demo

<video src="https://github.com/user-attachments/assets/3689d8f2-9005-499c-b4af-eb5c29092146" autoplay loop muted playsinline width="720" aria-label="Quest 3S view of the quadrics exhibit: the surface morphs through ellipsoid, cone, and hyperboloid as the a/b/c/d sliders are dragged, with the family classification label updating in real time">
  Your browser does not support inline video.
</video>

Drag the `a`, `b`, `c`, `d` sliders to morph the surface; the family
label classifies the result in real time as you cross degeneracy
boundaries (Ellipsoid → Hyperboloid → Cone → ...).

## Try it

Live at <https://skylinetrailcomputing.github.io/geometer/>. Click **Enter VR** once the page loads.

Headset paths that work today:

- **Quest browser** (Quest 3, 3S, 2, Pro) — open the link directly on the headset. See [`DEV_QUEST_SETUP.md`](DEV_QUEST_SETUP.md) for first-run guidance.
- **Desktop Chrome with a tethered headset** — useful for development and inspection.

### Without a headset

WebXR emulator extensions (Meta's [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik); Mozilla's WebXR API Emulator) would in theory let a desktop browser drive the exhibit without hardware. As of v0.2 neither composes cleanly with our Three.js stack:

- Meta's emulator polyfills the WebXR API but Three.js's session setup hits an `XRWebGLBinding` type mismatch on Enter VR.
- Mozilla's emulator was removed from the Chrome Web Store in late 2025; it remains on Firefox Add-ons, but Firefox's own WebXR support has separate quirks.

Compatibility work is tracked in [#72](https://github.com/skylinetrailcomputing/geometer/issues/72). For now, a real Quest (3 / 3S / 2 / Pro) is the reliable path.

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
