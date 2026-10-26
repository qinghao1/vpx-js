// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { isDeferred } from './deferred-texture.js'

describe('isDeferred', () => {
	it('correctly prioritizes playfield and bake maps over large assets', () => {
		const table = { getPlayfieldMap: () => 'playfield_image.png' }

		// Exact playfield map is never deferred
		expect(isDeferred({ getName: () => 'playfield_image.png', width: 4096, height: 4096 }, table)).toBe(false)

		// Large bake/nestmap textures are never deferred
		expect(isDeferred({ getName: () => 'vlm_bake_01.png', width: 2048, height: 2048 }, table)).toBe(false)
		expect(isDeferred({ getName: () => 'nestmap_playfield.png', width: 2048, height: 2048 }, table)).toBe(false)

		// HDR/EXR textures are always deferred
		expect(isDeferred({ getName: () => 'env.hdr', szPath: 'env.hdr', width: 512, height: 256 }, table)).toBe(true)
		expect(isDeferred({ getName: () => 'env.exr', szPath: 'env.exr', width: 512, height: 256 }, table)).toBe(true)

		// Large non-bake textures (> 1MP) are deferred
		expect(isDeferred({ getName: () => 'plastic_artwork.png', width: 2048, height: 1024 }, table)).toBe(true)

		// Small textures (<= 1MP) are not deferred
		expect(isDeferred({ getName: () => 'button.png', width: 512, height: 512 }, table)).toBe(false)
	})
})
