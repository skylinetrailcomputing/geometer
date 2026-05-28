import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  _cacheStateForTests,
  _clearCacheForTests,
  _setCanvasFactoryForTests,
  acquireBakedSymbolTexture,
  releaseBakedSymbolTexture,
} from '@/scaffold/ui/bakedSymbolTexture';

// Vitest unit coverage for `bakedSymbolTexture` (#278). Cache
// mechanics + refcount lifecycle + soft release semantics. Pixel-
// level rendering correctness is a Cloudflare-PR-preview smoke
// concern; this file covers what jsdom-less Vitest can prove.
//
// The module's production path calls `document.createElement('canvas')`.
// Node's Vitest environment has no `document`; inject a stub canvas
// factory that returns a plain object with a stubbed 2D context.

function makeStubCanvas(): HTMLCanvasElement {
  const ctx = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    set lineWidth(_v: number) {},
    set lineJoin(_v: string) {},
  };
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  _setCanvasFactoryForTests(makeStubCanvas);
});

afterEach(() => {
  // Assert cleanup BEFORE draining, so a leaking test surfaces as
  // a Vitest failure. Then drain via `_clearCacheForTests` so the
  // next test starts from a clean state — without this, one
  // leaking test's pollution cascades into all subsequent test
  // failures, which obscures the root cause.
  const state = _cacheStateForTests();
  _clearCacheForTests();
  _setCanvasFactoryForTests(null);
  expect(state.size).toBe(0);
});

describe('bakedSymbolTexture cache', () => {
  it('acquire creates a new entry; matching release disposes it', () => {
    acquireBakedSymbolTexture('θ', 0xaaaaaa);
    expect(_cacheStateForTests().size).toBe(1);
    expect(_cacheStateForTests().refCounts['θ|0xaaaaaa']).toBe(1);
    expect(_cacheStateForTests().keys).toEqual(['θ|0xaaaaaa']);

    releaseBakedSymbolTexture('θ', 0xaaaaaa);
    expect(_cacheStateForTests().size).toBe(0);
  });

  it('repeated acquire reuses the same texture instance; refcount ladders', () => {
    const t1 = acquireBakedSymbolTexture('θ', 0xaaaaaa);
    const t2 = acquireBakedSymbolTexture('θ', 0xaaaaaa);
    const t3 = acquireBakedSymbolTexture('θ', 0xaaaaaa);

    expect(t1).toBe(t2);
    expect(t2).toBe(t3);
    expect(_cacheStateForTests().refCounts['θ|0xaaaaaa']).toBe(3);
    expect(_cacheStateForTests().size).toBe(1);

    releaseBakedSymbolTexture('θ', 0xaaaaaa);
    expect(_cacheStateForTests().size).toBe(1);
    releaseBakedSymbolTexture('θ', 0xaaaaaa);
    expect(_cacheStateForTests().size).toBe(1);
    releaseBakedSymbolTexture('θ', 0xaaaaaa);
    expect(_cacheStateForTests().size).toBe(0);
  });

  it('different (symbol, color) pairs key separately', () => {
    const a = acquireBakedSymbolTexture('θ', 0xaaaaaa);
    const b = acquireBakedSymbolTexture('φ', 0xaaaaaa);
    const c = acquireBakedSymbolTexture('θ', 0xff0000);

    expect(_cacheStateForTests().size).toBe(3);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);

    releaseBakedSymbolTexture('θ', 0xaaaaaa);
    releaseBakedSymbolTexture('φ', 0xaaaaaa);
    releaseBakedSymbolTexture('θ', 0xff0000);
    expect(_cacheStateForTests().size).toBe(0);
  });

  it('cache keys are zero-padded to 6 hex digits for canonical formatting', () => {
    acquireBakedSymbolTexture('θ', 0xaa); // color < 0x010000
    expect(_cacheStateForTests().keys).toEqual(['θ|0x0000aa']);
    releaseBakedSymbolTexture('θ', 0xaa);
  });

  it('soft release: missing-key release warns + no-ops (does not throw)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Release without a prior acquire.
    expect(() => releaseBakedSymbolTexture('θ', 0xaaaaaa)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/θ\|0xaaaaaa/);
    expect(_cacheStateForTests().size).toBe(0);

    // Acquire once, release twice. Second release is the over-
    // release case; should also warn + no-op rather than throw.
    acquireBakedSymbolTexture('θ', 0xaaaaaa);
    releaseBakedSymbolTexture('θ', 0xaaaaaa); // brings refcount to 0, entry deleted
    warnSpy.mockClear();
    expect(() => releaseBakedSymbolTexture('θ', 0xaaaaaa)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('texture.dispose is called once at refcount→0; backing canvas is cleared', () => {
    const texture = acquireBakedSymbolTexture('k', 0xaaaaaa);
    const disposeSpy = vi.spyOn(texture, 'dispose');

    // Second acquire — refcount goes to 2.
    acquireBakedSymbolTexture('k', 0xaaaaaa);
    releaseBakedSymbolTexture('k', 0xaaaaaa); // refcount → 1
    expect(disposeSpy).not.toHaveBeenCalled();

    releaseBakedSymbolTexture('k', 0xaaaaaa); // refcount → 0
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(texture.image).toBeNull();
  });

  it('texture defaults: sRGB color space + mipmapped minification', () => {
    const texture = acquireBakedSymbolTexture('θ', 0xaaaaaa);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    releaseBakedSymbolTexture('θ', 0xaaaaaa);
  });
});
