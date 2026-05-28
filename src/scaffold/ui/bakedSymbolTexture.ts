import * as THREE from 'three';

// Refcounted cache of `(symbol, color)` → `THREE.CanvasTexture` for
// the slider-thumb emblazon (#278). Each texture bakes the body
// color across the full quad PLUS the centered white glyph; the
// thumb sphere's `MeshStandardMaterial({ color: 0xffffff, map })`
// then samples the entire surface from the texture, leaving the
// emissive flip (hover/grab) as the dynamic affordance. Each unique
// `(symbol, color)` pair lives once in the cache; consumers acquire
// on construction and release on dispose. At refcount zero the
// underlying GL state + backing canvas are freed.

// Resolution chosen so the glyph never approaches the per-screen-
// pixel limit on Quest 3S at the smoke pose (plinth + arm's-length-
// forward ≈ 1.0 m, thumb 2.5 cm wide → ~32 px across the sphere
// diameter). Bracket [128, 512]: drop to 128 if smoke shows GL
// memory pressure (13 × 256² × 4 B = ~3.3 MB across the cluster —
// well under any realistic Quest 3S budget); bump to 512 only if
// glyph anti-aliasing reads as too coarse at oblique pancake camera
// angles. One dial per round per
// `feedback_binary_search_visual_constants`.
const TEXTURE_SIZE_PX = 256;

// Glyph height in texture pixels. Round 2 of binary search per
// `feedback_binary_search_visual_constants`: round 1 (160) read
// in Brad's pancake smoke as "wraps a full hemisphere of the
// slider" — too distorted on the sphere. Dropping to 112 (=
// 0.7 × 160) shrinks the glyph footprint so it drifts over less
// of the sphere surface. Bracket [80, 144]: if 112 still reads
// as wrapping too much, drop toward 96 / 80; if it's now too
// small for the narrower glyphs (e.g., `θ`), bump back toward
// 128 / 144. One dial per round.
const GLYPH_FONT_SIZE_PX = 112;

// `system-ui` resolves to the OS default UI font: San Francisco on
// macOS, Segoe UI on Windows, Roboto / Noto Sans on Android (incl.
// Quest 3S browser, which is Chromium-Meta). All of those ship
// complete coverage for the cluster symbol set (`x²` / `y²` / `z²`
// / `C` / `x` / `y` / `z` / `x₀` / `y₀` / `z₀` / `θ` / `φ` / `k`).
// Fallback to `sans-serif` covers the rare browser that doesn't
// recognize `system-ui`.
const GLYPH_FONT_FAMILY = 'system-ui, sans-serif';

// Empirical vertical-centering offset (pixels). `textBaseline:
// 'middle'` centers the font em box, which for symbols with
// superscripts (`x²`) sits above the visual ink-bbox centroid (the
// `²` shifts ink up but the em box stays centered). A small
// downward offset re-centers the visible ink. Bracket [-12, 12]:
// positive = shift down; tune in smoke per
// `feedback_binary_search_visual_constants` if `x²` / `x₀` read
// noticeably off-center on the sphere face.
const GLYPH_VERTICAL_OFFSET_PX = 4;

// White-on-tint contrast strategy, matches the established
// TapButton / Label precedent. Hard-coded; the §6 (c) escape in
// the #278 plan derives per-baseColor if the yellow d-slider
// washes out.
const GLYPH_FILL_STYLE = '#ffffff';

// Black outline width as a fraction of glyph font size, matches
// the 8% Troika outline convention.
const GLYPH_STROKE_WIDTH_PX = Math.round(GLYPH_FONT_SIZE_PX * 0.08);
const GLYPH_STROKE_STYLE = '#000000';

interface CacheEntry {
  texture: THREE.CanvasTexture;
  refCount: number;
}

const cache = new Map<string, CacheEntry>();

// Test-injectable canvas factory. Default is the browser's
// `document.createElement('canvas')`. Vitest tests inject a fake
// that returns a plain object with a stubbed `getContext` — avoids
// needing jsdom (Vitest in this project runs in Node; jsdom is not
// installed) and the global-prototype mutation that the original
// stub strategy would have required.
//
// The default factory checks for `document` at call time and
// throws a readable error if absent (Node / SSR / build-step
// accidentally triggering a bake from a non-browser environment).
// When tests inject a factory, the default never runs and no
// `document` access happens.
type CanvasFactory = () => HTMLCanvasElement;
const defaultCanvasFactory: CanvasFactory = () => {
  if (typeof document === 'undefined') {
    throw new Error(
      'bakedSymbolTexture: requires a browser environment ' +
        '(no `document` available — for tests, inject a factory ' +
        'via `_setCanvasFactoryForTests`).',
    );
  }
  return document.createElement('canvas');
};
let createCanvas: CanvasFactory = defaultCanvasFactory;

/**
 * Test-only: override the canvas factory. Pass `null` to reset to
 * the browser default.
 */
export function _setCanvasFactoryForTests(factory: CanvasFactory | null): void {
  createCanvas = factory ?? defaultCanvasFactory;
}

function cacheKey(symbol: string, color: number): string {
  // Pad to 6 hex digits for canonical formatting and grep-friendly
  // log lines. Padding doesn't prevent any genuine collision
  // (`0xff0000` and `0xff00` wouldn't collide unpadded either since
  // `"ff0000" !== "ff00"`); it's purely cosmetic / log readability.
  return `${symbol}|0x${color.toString(16).padStart(6, '0')}`;
}

function renderTexture(symbol: string, color: number): THREE.CanvasTexture {
  const canvas = createCanvas();
  canvas.width = TEXTURE_SIZE_PX;
  canvas.height = TEXTURE_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('bakedSymbolTexture: canvas 2D context unavailable');
  }
  // Body color across the whole quad. Resolves to baseColor when
  // sampled by the sphere material with `mat.color = 0xffffff`.
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, TEXTURE_SIZE_PX, TEXTURE_SIZE_PX);

  // Centered white glyph with a thin black stroke for contrast
  // against the yellow d-slider and any other light body color.
  ctx.font = `${GLYPH_FONT_SIZE_PX}px ${GLYPH_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = GLYPH_STROKE_WIDTH_PX;
  ctx.strokeStyle = GLYPH_STROKE_STYLE;
  ctx.lineJoin = 'round';
  const cx = TEXTURE_SIZE_PX / 2;
  const cy = TEXTURE_SIZE_PX / 2 + GLYPH_VERTICAL_OFFSET_PX;
  ctx.strokeText(symbol, cx, cy);
  ctx.fillStyle = GLYPH_FILL_STYLE;
  ctx.fillText(symbol, cx, cy);

  const texture = new THREE.CanvasTexture(canvas);
  // The canvas paints in sRGB space; tell Three.js so the shader
  // converts to linear before lighting and back to sRGB on output.
  // Without this the glyph + body read slightly off-saturation
  // against the rest of the cluster.
  texture.colorSpace = THREE.SRGBColorSpace;
  // `CanvasTexture` inherits `Texture`'s default `flipY = true`,
  // which combined with `SphereGeometry`'s V-axis convention (V=0
  // at north pole, V=1 at south) gives upright glyphs on the +Z
  // equator (V=0.5). Leaving as default; the #278 plan §4.3 smoke
  // checklist asserts upright rendering on `x²` and `x₀` where any
  // orientation regression would be most visible.
  //
  // Mipmaps on by default — a 256² high-contrast white-on-tint
  // glyph minified to ~32 px on Quest 3S during head motion is a
  // known shimmer pattern without mipmapping. Linear-mipmap-linear
  // gives smooth scaling between mip levels.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Acquire (or first-time create) the baked texture for a
 * `(symbol, color)` pair. Increments the refcount and returns the
 * shared texture instance. Consumers MUST call
 * `releaseBakedSymbolTexture` with the same key on disposal.
 */
export function acquireBakedSymbolTexture(
  symbol: string,
  color: number,
): THREE.CanvasTexture {
  const key = cacheKey(symbol, color);
  let entry = cache.get(key);
  if (!entry) {
    entry = { texture: renderTexture(symbol, color), refCount: 0 };
    cache.set(key, entry);
  }
  entry.refCount += 1;
  return entry.texture;
}

/**
 * Release a previously-acquired baked texture. Decrements the
 * refcount; at zero, disposes the GPU texture, clears the backing
 * canvas, and removes the cache entry.
 *
 * Soft semantics on missing / over-released keys: warns to console
 * and returns rather than throwing. The throw alternative
 * surfaced uncaught errors on legitimate lifecycle paths (HMR mid-
 * mount, scene-teardown error recovery, tests that accidentally
 * double-dispose) without giving the caller a meaningful recovery
 * option. Matches Three.js's own dispose conventions:
 * idempotent-friendly.
 */
export function releaseBakedSymbolTexture(
  symbol: string,
  color: number,
): void {
  const key = cacheKey(symbol, color);
  const entry = cache.get(key);
  if (!entry) {
    console.warn(
      `bakedSymbolTexture: release for unknown key ${key} ` +
        '(double-release or release-without-acquire — no-op).',
    );
    return;
  }
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    if (entry.refCount < 0) {
      // Belt-and-suspenders: the previous refcount→0 should have
      // deleted the entry, so this branch is reached only if
      // someone mutated the entry externally. Warn but still
      // dispose cleanly.
      console.warn(
        `bakedSymbolTexture: refCount went negative for ${key} ` +
          '(suggests external mutation — disposing anyway).',
      );
    }
    // Free GPU texture state.
    entry.texture.dispose();
    // Clear the backing canvas reference so the next gc pass
    // collects it. `texture.dispose()` frees the GL upload but
    // leaves `texture.image` pointing at the canvas; without this
    // clear, a stale slider material still holding `mat.map`
    // could pin the canvas in memory.
    const image = entry.texture.image as HTMLCanvasElement | undefined;
    if (image && 'width' in image) {
      image.width = 0;
      image.height = 0;
    }
    (entry.texture as { image: HTMLCanvasElement | null }).image = null;
    // `cache.delete(key)` intentionally last — the in-between
    // window (texture disposed but cache entry still present) is
    // safe in single-threaded JS, but the delete-last ordering
    // guards a future refactor from accidentally making a
    // synchronous re-acquire path return a disposed texture.
    cache.delete(key);
  }
}

/**
 * Test-only: read-only snapshot of cache size, keys, and per-key
 * refcounts without exposing the internal `Map`.
 */
export function _cacheStateForTests(): {
  size: number;
  keys: readonly string[];
  refCounts: Record<string, number>;
} {
  const refCounts: Record<string, number> = {};
  for (const [k, v] of cache.entries()) refCounts[k] = v.refCount;
  return {
    size: cache.size,
    keys: [...cache.keys()],
    refCounts,
  };
}

/**
 * Test-only: wipe the cache. Disposes every live texture, clears
 * every backing-store reference, and empties the map. Wired into
 * the `afterEach` blocks of `Slider.test.ts` +
 * `PointerMigration.test.ts` so the existing un-disposed
 * `makeSlider` callsites in those files don't pollute cache state
 * across tests.
 *
 * NOT exported as a production API. Calling this in a production
 * code path would silently break any Slider still holding a
 * `material.map` reference (the texture's GL state would be freed
 * but the material still points at a now-disposed texture).
 */
export function _clearCacheForTests(): void {
  for (const entry of cache.values()) {
    entry.texture.dispose();
    const image = entry.texture.image as HTMLCanvasElement | undefined;
    if (image && 'width' in image) {
      image.width = 0;
      image.height = 0;
    }
    (entry.texture as { image: HTMLCanvasElement | null }).image = null;
  }
  cache.clear();
}
