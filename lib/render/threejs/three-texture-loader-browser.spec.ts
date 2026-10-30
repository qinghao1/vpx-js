// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { LinearFilter, LinearMipmapLinearFilter, RGBAFormat } from 'three'
import { describe, expect, it } from 'vitest'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import { ThreeTextureLoaderBrowser } from './three-texture-loader-browser.js'

describe('ThreeTextureLoaderBrowser float size bound', () => {
	it('rejects oversized non-playfield EXR/HDR payloads before worker decode', async () => {
		const loader = new ThreeTextureLoaderBrowser()
		const huge = new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)
		// Fail fast with 'too large' so the map generator skips on its debug path.
		await expect(loader.loadTexture('cabinet_env', '.exr', huge)).rejects.toThrow(/too large/)
		await expect(loader.loadTexture('cabinet_env', '.hdr', huge)).rejects.toThrow(/too large/)
	})
	it('routes oversized playfield/nestmap floats to the slow decode instead of failing fast', async () => {
		const loader = new ThreeTextureLoaderBrowser()
		const huge = new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)
		// Playfield lightmap bakes gate playfield brightness: the worker OOM
		// bound must not strand them mapless. Zero bytes are not an EXR, so the
		// slow main-thread fallback fails at parse — proving the guard let the
		// decode path through instead of failing fast with 'too large'.
		await expect(loader.loadTexture('vlm.nestmap1', '.exr', huge)).rejects.toThrow(/HDR\/EXR parse failed/)
		await expect(loader.loadTexture('vlm.nestmap1', '.hdr', huge)).rejects.toThrow(/HDR\/EXR parse failed/)
		// Small payloads still reach the worker path (node has none), proving no over-blocking.
		await expect(loader.loadTexture('nestmap', '.exr', new Uint8Array(1024))).rejects.toThrow(/no worker/)
	})
})

describe('ThreeTextureLoaderBrowser tuning', () => {
	const loader = new ThreeTextureLoaderBrowser()
	const raw = (name: string, w: number, h: number) =>
		loader.loadRawTexture(name, new Uint8Array(w * h * 4), w, h) as Promise<any>

	it('caps anisotropy at 8 (high tier requests 16)', async () => {
		const tex = await raw('some_wall', 512, 512)
		expect(tex.anisotropy).toBe(8)
	})

	it('keeps mipmaps on ordinary textures', async () => {
		const tex = await raw('some_wall', 512, 512)
		expect(tex.generateMipmaps).toBe(true)
		expect(tex.minFilter).toBe(LinearMipmapLinearFilter)
	})

	it('disables mipmaps for DMD maps (always magnified, never minified)', async () => {
		const tex = await raw('DMD_panel', 128, 32)
		expect(tex.generateMipmaps).toBe(false)
		expect(tex.minFilter).toBe(LinearFilter)
	})

	it('disables mipmaps for icon-class textures (longest edge <= 64)', async () => {
		const tex = await raw('screw', 32, 32)
		expect(tex.generateMipmaps).toBe(false)
		expect(tex.minFilter).toBe(LinearFilter)
	})

	it('keeps RGBAFormat for fully-opaque raw bitmaps (WebGPU has no RGB8)', async () => {
		const w = 16
		const h = 16
		const data = new Uint8Array(w * h * 4)
		for (let i = 0; i < data.length; i += 4) {
			data[i] = i & 0xff
			data[i + 1] = (i >> 2) & 0xff
			data[i + 2] = (i >> 4) & 0xff
			data[i + 3] = 0xff
		}
		const tex = (await loader.loadRawTexture('playfield_opaque', data, w, h)) as any
		expect(tex.format).toBe(RGBAFormat)
		expect(tex.image.data.byteLength).toBe(w * h * 4)
	})
})
