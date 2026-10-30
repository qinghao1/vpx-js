import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import { expandAndBoxAverage, expandToRgba } from './png-resample.js'
import { downscaleArray } from './texture-downscale.js'
import { ThreeTextureLoaderNode, unfilterScanlines } from './three-texture-loader-node.js'

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

/** PNG builder for pre-filtered rows: each row already starts with its filter byte. */
function buildFilteredPng(
	width: number,
	height: number,
	bitDepth: number,
	colorType: number,
	rows: number[][],
	transparency?: number[],
): Uint8Array {
	const ihdr = new Uint8Array(13)
	const view = new DataView(ihdr.buffer)
	view.setUint32(0, width)
	view.setUint32(4, height)
	ihdr[8] = bitDepth
	ihdr[9] = colorType
	const flat: number[] = []
	for (const row of rows) flat.push(...row)
	const idatBytes = new Uint8Array(deflateSync(Buffer.from(flat)))
	const parts = [
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		Buffer.from(pngChunk('IHDR', ihdr)),
		...(transparency ? [Buffer.from(pngChunk('tRNS', new Uint8Array(transparency)))] : []),
		Buffer.from(pngChunk('IDAT', idatBytes)),
		Buffer.from(pngChunk('IEND', new Uint8Array(0))),
	]
	return new Uint8Array(Buffer.concat(parts))
}

/** Deterministic PRNG for test pixels (LCG, fixed seeds). */
function lcg(seed: number): () => number {
	let s = seed >>> 0
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0
		return s / 4294967296
	}
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

	it('returns the 1x1 placeholder for corrupt IDAT data instead of throwing', async () => {
		const loader = new ThreeTextureLoaderNode()
		const rows = [
			[255, 0, 0, 255, 0, 255, 0, 255],
			[0, 0, 255, 255, 255, 255, 255, 255],
		]
		const png = buildPng(2, 2, 8, 6, rows)
		// Flip a byte mid-payload of the first IDAT chunk (no CRC check on
		// parse): the corrupt bytes must fail inflate soft, not throw.
		let offset = 8
		const view = new DataView(png.buffer)
		while (offset + 8 <= png.length) {
			const length = view.getUint32(offset)
			const type = String.fromCharCode(png[offset + 4]!, png[offset + 5]!, png[offset + 6]!, png[offset + 7]!)
			if (type === 'IDAT') {
				png[offset + 8 + (length >> 1)]! ^= 0xff
				break
			}
			offset += 12 + length
		}
		const { width, data } = rgbaOf(await loader.loadTexture('texCorrupt', '.png', png))
		expect(width).toBe(1)
		expect(data.length).toBe(4)
	})

	it('returns the 1x1 placeholder when the IDAT payload is not zlib data at all', async () => {
		const loader = new ThreeTextureLoaderNode()
		// Garbage bytes fail node:zlib and pako alike: inflate must fall
		// through to null and resolve the placeholder instead of throwing.
		const ihdr = new Uint8Array(13)
		const view = new DataView(ihdr.buffer)
		view.setUint32(0, 2)
		view.setUint32(4, 2)
		ihdr[8] = 8
		ihdr[9] = 6
		const png = new Uint8Array(
			Buffer.concat([
				Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
				Buffer.from(pngChunk('IHDR', ihdr)),
				Buffer.from(pngChunk('IDAT', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))),
				Buffer.from(pngChunk('IEND', new Uint8Array(0))),
			]),
		)
		const { width, data } = rgbaOf(await loader.loadTexture('texGarbage', '.png', png))
		expect(width).toBe(1)
		expect(data.length).toBe(4)
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

	it('reconstructs Sub/Up/Average/Paeth rows byte-identically (specialized unfilter loops)', async () => {
		const loader = new ThreeTextureLoaderNode()
		// Hand-filtered rows (filter byte + filtered bytes); the expected
		// RGBA below is the hand-computed reconstruction, pinning the
		// per-filter loops without sharing code with them.
		const png = buildFilteredPng(2, 4, 8, 6, [
			[1, 10, 20, 30, 40, 40, 40, 40, 40],
			[2, 2, 2, 1, 4, 5, 0, 0, 0],
			[3, 14, 19, 25, 28, 23, 25, 25, 25],
			[4, 5, 5, 5, 5, 5, 5, 5, 5],
		])
		const { width, height, data } = rgbaOf(await loader.loadTexture('texFilters', '.png', png))
		expect(width).toBe(2)
		expect(height).toBe(4)
		expect(Array.from(data)).toEqual([
			10, 20, 30, 40, 50, 60, 70, 80, 12, 22, 31, 44, 55, 60, 70, 80, 20, 30, 40, 50, 60, 70, 80, 90, 25, 35, 45,
			55, 65, 75, 85, 95,
		])
	})

	it('passes unknown filter types through untouched', async () => {
		const loader = new ThreeTextureLoaderNode()
		// Filter type 7 is undefined per spec; the row bytes must reach
		// expansion as-is, matching the old recon=0 path.
		const png = buildFilteredPng(1, 1, 8, 6, [[7, 11, 22, 33, 44]])
		const { width, data } = rgbaOf(await loader.loadTexture('texUnknownFilter', '.png', png))
		expect(width).toBe(1)
		expect(Array.from(data)).toEqual([11, 22, 33, 44])
	})

	it('unfilter tolerates empty frames (zero-row fast path)', () => {
		expect(() => unfilterScanlines(new Uint8Array(0), 10, 0, 4)).not.toThrow()
		expect(() => unfilterScanlines(new Uint8Array(0), 0, 5, 4)).not.toThrow()
	})

	it('warmup kicks the HDR pool without throwing', () => {
		expect(() => new ThreeTextureLoaderNode().warmup()).not.toThrow()
	})

	it('fuses the playfield downscale end-to-end (byte-identical to unfused)', async () => {
		const loader = new ThreeTextureLoaderNode()
		const width = 8192
		const height = 2
		const bytesPerPixel = 4
		// Sub-filtered rows: the inverse of Sub reconstruction, so the fused
		// path exercises inflate + unfilter + fuse together.
		const rand = lcg(1234)
		const raws: number[][] = []
		const rows: number[][] = []
		for (let r = 0; r < height; r++) {
			const raw: number[] = []
			for (let i = 0; i < width * bytesPerPixel; i++) raw.push(Math.floor(rand() * 256))
			raws.push(raw)
			const filt = [1]
			for (let i = 0; i < raw.length; i++) {
				const cur = raw[i] ?? 0
				const left = i >= bytesPerPixel ? (raw[i - bytesPerPixel] ?? 0) : 0
				filt.push((cur - left + 256) & 0xff)
			}
			rows.push(filt)
		}
		const {
			width: nw,
			height: nh,
			data,
		} = rgbaOf(await loader.loadTexture('playfield_e2e', '.png', buildFilteredPng(width, height, 8, 6, rows)))
		// Unfused reference over the same samples: full expand, then the
		// shared box-average kernel.
		const stride = width * bytesPerPixel
		const scan = new Uint8Array(height * (stride + 1))
		raws.forEach((row, r) => {
			for (let i = 0; i < row.length; i++) scan[r * (stride + 1) + 1 + i] = row[i] ?? 0
		})
		const ref = downscaleArray(
			expandToRgba(scan, width, height, bytesPerPixel, 6, null, null, 8),
			width,
			height,
			4096,
			'playfield_e2e',
		)
		expect(nw).toBe(4096)
		expect(nw).toBe(ref.width)
		expect(nh).toBe(ref.height)
		expect(Array.from(data)).toEqual(Array.from(ref.data))
	})
})

describe('expandAndBoxAverage fused≡unfused', () => {
	function makeRaw(
		width: number,
		height: number,
		bytesPerPixel: number,
		rand: () => number,
		mask: number,
	): Uint8Array {
		const stride = width * bytesPerPixel
		const raw = new Uint8Array(height * (stride + 1))
		for (let row = 0; row < height; row++) {
			for (let col = 0; col < stride; col++) raw[row * (stride + 1) + 1 + col] = Math.floor(rand() * 256) & mask
		}
		return raw
	}

	/** Local Paeth predictor mirroring the loader, for forward-filtering test rows. */
	function paeth(left: number, up: number, upLeft: number): number {
		const base = left + up - upLeft
		const distLeft = Math.abs(base - left)
		const distUp = Math.abs(base - up)
		const distUpLeft = Math.abs(base - upLeft)
		if (distLeft <= distUp && distLeft <= distUpLeft) return left
		return distUp <= distUpLeft ? up : upLeft
	}

	/**
	 * Forward-applies PNG filters to filter-0 scanlines in place, cycling
	 * Sub/Paeth/Up/Average/None across rows so the matrix below exercises
	 * non-zero filter bytes for every colorType — not just filter-0 rows.
	 * Every case is at least 4 rows tall, so all of Sub/Paeth/Up/Average
	 * are always covered.
	 */
	function forwardFilter(raw: Uint8Array, width: number, height: number, bytesPerPixel: number): void {
		const filters = [1, 4, 2, 3, 0]
		const stride = width * bytesPerPixel
		const prev = new Uint8Array(stride)
		for (let row = 0; row < height; row++) {
			const filter = filters[row % filters.length] ?? 0
			raw[row * (stride + 1)] = filter
			const cur = row * (stride + 1) + 1
			const orig = raw.slice(cur, cur + stride)
			if (filter === 0) {
				prev.set(orig)
				continue
			}
			for (let col = 0; col < stride; col++) {
				const left = col >= bytesPerPixel ? (orig[col - bytesPerPixel] ?? 0) : 0
				const up = prev[col] ?? 0
				let pred: number
				if (filter === 1) pred = left
				else if (filter === 2) pred = up
				else if (filter === 3) pred = (left + up) >> 1
				else pred = paeth(left, up, col >= bytesPerPixel ? (prev[col - bytesPerPixel] ?? 0) : 0)
				raw[cur + col] = ((orig[col] ?? 0) - pred) & 0xff
			}
			prev.set(orig)
		}
	}

	const cases: Array<{
		name: string
		width: number
		height: number
		bytesPerPixel: number
		colorType: number
		palette: Uint8Array | null
		transparency: Uint8Array | null
		bitDepth: number
		max: number
		mask: number
	}> = [
		{
			name: 'rgba exact box',
			width: 8,
			height: 4,
			bytesPerPixel: 4,
			colorType: 6,
			palette: null,
			transparency: null,
			bitDepth: 8,
			max: 4,
			mask: 0xff,
		},
		{
			name: 'rgba generic windows',
			width: 10,
			height: 6,
			bytesPerPixel: 4,
			colorType: 6,
			palette: null,
			transparency: null,
			bitDepth: 8,
			max: 6,
			mask: 0xff,
		},
		{
			name: 'gray + tRNS',
			width: 9,
			height: 5,
			bytesPerPixel: 1,
			colorType: 0,
			palette: null,
			transparency: new Uint8Array([0, 0x7f]),
			bitDepth: 8,
			max: 4,
			mask: 0xff,
		},
		{
			name: 'gray-alpha',
			width: 7,
			height: 5,
			bytesPerPixel: 2,
			colorType: 4,
			palette: null,
			transparency: null,
			bitDepth: 8,
			max: 4,
			mask: 0xff,
		},
		{
			name: 'rgb + tRNS',
			width: 9,
			height: 5,
			bytesPerPixel: 3,
			colorType: 2,
			palette: null,
			transparency: new Uint8Array([0, 10, 0, 20, 0, 30]),
			bitDepth: 8,
			max: 4,
			mask: 0xff,
		},
		{
			name: 'palette + tRNS',
			width: 9,
			height: 5,
			bytesPerPixel: 1,
			colorType: 3,
			palette: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
			transparency: new Uint8Array([255, 0, 255, 128]),
			bitDepth: 8,
			max: 4,
			mask: 0x07,
		},
		{
			name: 'gray 16-bit',
			width: 9,
			height: 5,
			bytesPerPixel: 2,
			colorType: 0,
			palette: null,
			transparency: null,
			bitDepth: 16,
			max: 4,
			mask: 0xff,
		},
		{
			name: 'rgb 16-bit + tRNS',
			width: 7,
			height: 5,
			bytesPerPixel: 6,
			colorType: 2,
			palette: null,
			transparency: new Uint8Array([0x12, 0x34, 0, 0, 0, 0]),
			bitDepth: 16,
			max: 4,
			mask: 0xff,
		},
	]

	for (const c of cases) {
		it(`${c.name}: fused bytes equal unfused expand + box average (filtered rows)`, () => {
			const rand = lcg(c.width * 1000 + c.height)
			const raw = makeRaw(c.width, c.height, c.bytesPerPixel, rand, c.mask)
			// Filter-encode the scanlines first: both paths below run the
			// shared unfilter over Sub/Paeth/Up/Average/None rows, so the
			// equivalence covers filtered inputs, not just filter-0 rows.
			forwardFilter(raw, c.width, c.height, c.bytesPerPixel)
			const unfusedScan = raw.slice()
			unfilterScanlines(unfusedScan, c.width, c.height, c.bytesPerPixel)
			const ref = downscaleArray(
				expandToRgba(
					unfusedScan,
					c.width,
					c.height,
					c.bytesPerPixel,
					c.colorType,
					c.palette,
					c.transparency,
					c.bitDepth,
				),
				c.width,
				c.height,
				c.max,
				'playfield_case',
			)
			const fusedScan = raw.slice()
			unfilterScanlines(fusedScan, c.width, c.height, c.bytesPerPixel)
			const fused = expandAndBoxAverage(
				fusedScan,
				c.width,
				c.height,
				c.bytesPerPixel,
				c.colorType,
				c.palette,
				c.transparency,
				c.bitDepth,
				c.max,
			)
			expect(fused.width).toBe(ref.width)
			expect(fused.height).toBe(ref.height)
			expect(Array.from(fused.data)).toEqual(Array.from(ref.data))
		})
	}
})
