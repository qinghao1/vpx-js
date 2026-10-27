import { describe, expect, it } from 'vitest'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import { ThreeTextureLoaderNode } from './three-texture-loader-node.js'

describe('ThreeTextureLoaderNode float size bound', () => {
	it('rejects oversized non-playfield HDR/EXR payloads before worker decode', async () => {
		const loader = new ThreeTextureLoaderNode()
		const huge = new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)
		// Fail fast with 'too large' so the map generator skips on its debug path.
		await expect(loader.loadTexture('cabinet_env', '.hdr', huge)).rejects.toThrow(/too large/)
		await expect(loader.loadTexture('cabinet_env', '.exr', huge)).rejects.toThrow(/too large/)
	})

	it('routes oversized playfield floats to the slow decode instead of failing fast', async () => {
		const loader = new ThreeTextureLoaderNode()
		const huge = new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)
		// Playfield lightmaps gate playfield brightness: the bound must not
		// strand them mapless. Zero bytes are not HDR/EXR, so the slow
		// main-thread fallback fails at parse — proving the fallback path ran
		// instead of failing fast with 'too large'.
		await expect(loader.loadTexture('vlm.nestmap1', '.hdr', huge)).rejects.toThrow(/HDR\/EXR parse failed/)
		await expect(loader.loadTexture('vlm.nestmap1', '.exr', huge)).rejects.toThrow(/HDR\/EXR parse failed/)
	})

	it('falls back to main-thread decode when the worker fails', async () => {
		const loader = new ThreeTextureLoaderNode()
		// Small garbage reaches the worker, fails there, and the main-thread
		// fallback fails at parse — proving the fallback ran (raw worker
		// errors never leak).
		await expect(loader.loadTexture('cabinet_env', '.hdr', new Uint8Array(1024))).rejects.toThrow(
			/HDR\/EXR parse failed/,
		)
		await expect(loader.loadTexture('cabinet_env', '.exr', new Uint8Array(1024))).rejects.toThrow(
			/HDR\/EXR parse failed/,
		)
	})
})
