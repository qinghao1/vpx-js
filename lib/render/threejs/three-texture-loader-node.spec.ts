import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import { ThreeTextureLoaderNode } from './three-texture-loader-node.js'

const CRC_TABLE: number[] = (() => {
	const table: number[] = new Array<number>(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	return table
})()

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff
	for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + payload.length)
	const view = new DataView(out.buffer)
	view.setUint32(0, payload.length)
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
	out.set(payload, 8)
	view.setUint32(8 + payload.length, crc32(out.subarray(4, 8 + payload.length)))
	return out
}

/** Minimal PNG builder: unfiltered rows, no ancillary chunks except optional tRNS. */
function buildPng(
	width: number,
	height: number,
	bitDepth: number,
	colorType: number,
	rows: number[][],
	transparency?: number[],
	idatPartSize?: number,
): Uint8Array {
	const ihdr = new Uint8Array(13)
	const view = new DataView(ihdr.buffer)
	view.setUint32(0, width)
	view.setUint32(4, height)
	ihdr[8] = bitDepth
	ihdr[9] = colorType
	const flat: number[] = []
	for (const row of rows) flat.push(0, ...row)
	const idatBytes = new Uint8Array(deflateSync(Buffer.from(flat)))
	const partSize = idatPartSize && idatPartSize > 0 ? idatPartSize : idatBytes.length
	const idatChunks: Buffer[] = []
	for (let i = 0; i < idatBytes.length; i += partSize) {
		idatChunks.push(Buffer.from(pngChunk('IDAT', idatBytes.subarray(i, i + partSize))))
	}
	const parts = [
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		Buffer.from(pngChunk('IHDR', ihdr)),
		...(transparency ? [Buffer.from(pngChunk('tRNS', new Uint8Array(transparency)))] : []),
		...idatChunks,
		Buffer.from(pngChunk('IEND', new Uint8Array(0))),
	]
	return new Uint8Array(Buffer.concat(parts))
}

function rgbaOf(tex: unknown): { width: number; height: number; data: Uint8Array } {
	const image = (tex as { image: { width: number; height: number; data: Uint8Array } }).image
	return { width: image.width, height: image.height, data: image.data }
}

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

	it('decodes 16-bit grayscale to the high byte of each sample', async () => {
		// Browser parity: createImageBitmap decodes 16-bit PNGs, so the Node
		// loader must not strand them as white placeholders. 0x1234 -> 0x12.
		const loader = new ThreeTextureLoaderNode()
		const png = buildPng(2, 1, 16, 0, [[0x12, 0x34, 0xab, 0xcd]])
		const { width, height, data } = rgbaOf(await loader.loadTexture('tex16gray', '.png', png))
		expect(width).toBe(2)
		expect(height).toBe(1)
		expect(Array.from(data)).toEqual([0x12, 0x12, 0x12, 255, 0xab, 0xab, 0xab, 255])
	})

	it('decodes 16-bit truecolor to the high byte of each channel', async () => {
		const loader = new ThreeTextureLoaderNode()
		// Pixel: R 0x1020, G 0x3040, B 0x5060 -> 0x10, 0x30, 0x50.
		const png = buildPng(1, 1, 16, 2, [[0x10, 0x20, 0x30, 0x40, 0x50, 0x60]])
		const { width, data } = rgbaOf(await loader.loadTexture('tex16rgb', '.png', png))
		expect(width).toBe(1)
		expect(Array.from(data)).toEqual([0x10, 0x30, 0x50, 255])
	})

	it('honors 16-bit tRNS transparency on the full sample value', async () => {
		const loader = new ThreeTextureLoaderNode()
		// Gray sample 0x1234 matches tRNS [0x12, 0x34] -> alpha 0; 0x1235 does not.
		const keyed = buildPng(1, 1, 16, 0, [[0x12, 0x34]], [0x12, 0x34])
		expect(Array.from(rgbaOf(await loader.loadTexture('tex16key', '.png', keyed)).data)[3]).toBe(0)
		const opaque = buildPng(1, 1, 16, 0, [[0x12, 0x35]], [0x12, 0x34])
		expect(Array.from(rgbaOf(await loader.loadTexture('tex16opaque', '.png', opaque)).data)[3]).toBe(255)
	})

	it('decodes split IDATs byte-for-byte identical to a single IDAT', async () => {
		const loader = new ThreeTextureLoaderNode()
		// 3-byte IDAT parts slice the zlib stream mid-symbol, so chunk order matters.
		const rows = [
			[255, 0, 0, 255, 0, 255, 0, 255],
			[0, 0, 255, 255, 255, 255, 255, 255],
		]
		const expected = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]
		const whole = rgbaOf(await loader.loadTexture('texWhole', '.png', buildPng(2, 2, 8, 6, rows)))
		expect(Array.from(whole.data)).toEqual(expected)
		const split = rgbaOf(await loader.loadTexture('texSplit', '.png', buildPng(2, 2, 8, 6, rows, undefined, 3)))
		expect(split.width).toBe(2)
		expect(split.height).toBe(2)
		expect(Array.from(split.data)).toEqual(expected)
	})

	it('still decodes 8-bit grayscale the established way', async () => {
		const loader = new ThreeTextureLoaderNode()
		const png = buildPng(1, 1, 8, 0, [[0x7f]])
		const { width, data } = rgbaOf(await loader.loadTexture('tex8gray', '.png', png))
		expect(width).toBe(1)
		expect(Array.from(data)).toEqual([0x7f, 0x7f, 0x7f, 255])
	})

	it('still returns a placeholder for sub-byte depths needing bit unpacking', async () => {
		const loader = new ThreeTextureLoaderNode()
		const png = buildPng(8, 1, 1, 0, [[0b10101010]])
		const { width, data } = rgbaOf(await loader.loadTexture('tex1bit', '.png', png))
		expect(width).toBe(1)
		expect(data.length).toBe(4)
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
