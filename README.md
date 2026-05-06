# geometer

> Geometric reasoning for STEM undergrads, in WebXR.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A free, open-source WebXR sandbox of geometry exhibits aimed at undergraduate students of calculus, linear algebra, and differential equations. The thesis: VR earns its keep on math where the bottleneck for the learner is *3D spatial intuition* — quadric surfaces, vector fields, eigenvectors and eigenspaces, ODE phase portraits in 3D.

**Status:** v0.3 — `quadrics` exhibit shipped. Slider-driven
`ax² + by² + cz² = d` explorer with live family classification, live
equation readout, canonical-pose preset buttons with animated
family-transition tweens, parametric / world-axis gridlines on the
surface for depth cues, and a section-selector rack ready for
sibling sections (level-set slicing, linear terms) in future versions.

## Demo

<video src="https://github.com/user-attachments/assets/bdaa5f33-0cef-4eda-ab95-ed6e83a50165" autoplay loop muted playsinline width="720" aria-label="Quest 3S view of the quadrics exhibit: dragging sliders and tapping canonical-pose preset buttons morph the surface through ellipsoid, cone, and hyperboloid families, with the live family classification label updating across each transition">
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

WebXR emulator extensions (Meta's [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik); Mozilla's WebXR API Emulator) would in theory let a desktop browser drive the exhibit without hardware. As of v0.2 neither composes cleanly with our Three.js stack:

- Meta's emulator polyfills the WebXR API but Three.js's session setup hits an `XRWebGLBinding` type mismatch on Enter VR.
- Mozilla's emulator was removed from the Chrome Web Store in late 2025; it remains on Firefox Add-ons, but Firefox's own WebXR support has separate quirks.

Compatibility work is tracked in [#80](https://github.com/skylinetrailcomputing/geometer/issues/80). The Meta emulator's `XRWebGLBinding` mismatch is fixed upstream in Three.js [r185](https://github.com/mrdoob/three.js/issues/33414) (closed-completed, unreleased as of this writing — expected mid-2026 based on Three.js's recent ~2-month cadence); once it ships to npm we'll bump our pin and re-verify. For now, a real Quest (3 / 3S / 2 / Pro) is the reliable path.

Separately, [#105](https://github.com/skylinetrailcomputing/geometer/issues/105) is exploring a first-class **desktop interaction mode** (mouse + keyboard, WASD or orbit camera) — a real production path for visitors without a headset, not a developer workaround. Design discussion is open.

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

- **MVP exhibit:** slider-driven quadric surfaces — `ax² + by² + cz² = d` with live family classification (Ellipsoid / Hyperboloid of two sheets / Cone / etc.) as parameters morph through degenerate cases.
- **Next:** linear algebra core — eigenvectors visualized on the unit-sphere → ellipsoid mapping, determinant as signed volume, matrix composition as physical chaining of transforms.
- **Later:** vector fields in 3D, ODE phase portraits, parametric surfaces (Möbius, Klein bottle).

## Contributing

Issues and PRs welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for workflow and conventions, and [`VISION.md`](VISION.md) for the project's thesis and what makes a topic a fit.

## License

MIT, copyright © 2026 Skyline Trail Computing LLC.

## Background

A 2026 reincarnation of an Unreal Engine VR-for-undergrad-calculus POC originally explored in 2016 — re-platformed to WebXR for friction-free distribution.
