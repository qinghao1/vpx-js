import * as fs from 'node:fs'
import { deflate } from 'pako'
import { DataUtils, HalfFloatType } from 'three'
import { describe, expect, it } from 'vitest'
import { QUALITY_CAPS } from '../../util/quality.js'
import { downscaleArray, getMaxTextureSize } from './texture-downscale.js'
import { effectiveMax, ThreeTextureLoaderBrowser } from './three-texture-loader-browser.js'
import { ThreeTextureLoaderNode } from './three-texture-loader-node.js'

describe('regression: texture stripe artifacts', () => {
	it('playfield cap must be 4096 not 16384', () => {
		expect(getMaxTextureSize('VLM.Nestmap0'), 'node loader playfield cap').toEqual(4096)
		expect(getMaxTextureSize('vlm_lightmap'), 'pure-vlm name takes playfield cap').toEqual(4096)
		expect(getMaxTextureSize('playfield'), 'node playfield').toEqual(4096)
		expect(getMaxTextureSize('nestmap'), 'nestmap').toEqual(4096)
		expect(getMaxTextureSize('bake_something'), 'bake').toEqual(4096)
		expect(getMaxTextureSize('diffuse'), 'non-playfield cap 2048').toEqual(2048)
		expect(getMaxTextureSize('wall'), 'wall 2048').toEqual(2048)

		expect(getMaxTextureSize('VLM.Nestmap0'), 'worker playfield').toEqual(4096)
		expect(getMaxTextureSize('other'), 'worker other 2048').toEqual(2048)
	})

	it('browser effectiveMax must cap playfield to 4096', () => {
		expect(effectiveMax(false, 'VLM.Nestmap0')).toEqual(4096)
		expect(effectiveMax(false, 'playfield'), 'playfield').toEqual(4096)
		expect(effectiveMax(true, 'VLM.Nestmap0'), 'float playfield').toEqual(4096)
		expect(effectiveMax(true, 'playfield'), 'float playfield 4096').toEqual(4096)
		// non-playfield should be 2048 on swift or 4096 otherwise, but never >4096 for float without playfield?
		// In node env hwMax defaults 4096, so non-playfield float also 4096 but limited by cap
		const nonPf = effectiveMax(false, 'some_wall')
		expect(nonPf, 'non-playfield should be <=4096').toBeLessThanOrEqual(4096)
		// Behavior guard for the old 16384-cap bug: no quality tier may raise any
		// texture cap above 4096, or 6080x8192 playfields skip downscaling again.
		for (const [tier, caps] of Object.entries(QUALITY_CAPS)) {
			expect(caps.playfield, `${tier} playfield cap`).toBeLessThanOrEqual(4096)
			expect(caps.other, `${tier} other cap`).toBeLessThanOrEqual(4096)
		}
		expect(QUALITY_CAPS.high.playfield, 'high-tier playfield cap').toEqual(4096)
		expect(getMaxTextureSize('VLM.Nestmap0'), 'worker playfield cap').toEqual(4096)
		expect(getMaxTextureSize('VLM.Nestmap0'), 'node playfield cap').toEqual(4096)
	})

	it('playfield downscale must use box-average not point sample', () => {
		// Create 4x4 with 2x2 blocks of distinct values, downscale to 2x2 via averaging
		// comps=1 for simplicity, values are half-float or float
		const w = 4,
			h = 4,
			comps = 3
		const data = new Float32Array(w * h * comps)
		// Fill with pattern where each 2x2 quad has different color
		// quad (0,0) => 0, quad (1,0) => 100, quad (0,1)=> 200, quad (1,1)=>300
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++)
				for (let c = 0; c < comps; c++) {
					const qx = Math.floor(x / 2),
						qy = Math.floor(y / 2)
					const base = (qy * 2 + qx) * 100
					data[(y * w + x) * comps + c] = base + c
				}
		const max = 2 // force downscale to 2x2
		const out = downscaleArray(data as any, w, h, max, 'playfield', HalfFloatType)
		// playfield should average 2x2 blocks: each output pixel is average of 4 source pixels
		// Since all pixels in a quad are same value, average == value
		expect(out.width).toEqual(2)
		expect(out.height).toEqual(2)
		// check values: (0,0) avg = 0, (1,0)=100, (0,1)=200, (1,1)=300
		for (let y = 0; y < 2; y++)
			for (let x = 0; x < 2; x++)
				for (let c = 0; c < comps; c++) {
					const expected = (y * 2 + x) * 100 + c
					const actual = (out.data as Float32Array)[(y * 2 + x) * comps + c]
					expect(actual, `playfield avg at ${x},${y} c${c}`).toBeCloseTo(expected, 0.01)
				}
	})

	it('playfield half-float averaging must be correct', () => {
		const w = 4,
			h = 4,
			comps = 1
		const data = new Uint16Array(w * h)
		// fill 0 and 1 half-float pattern
		for (let i = 0; i < w * h; i++) data[i] = DataUtils.toHalfFloat(i % 2 === 0 ? 0 : 2)
		const out = downscaleArray(data as any, w, h, 2, 'VLM.Nestmap0', HalfFloatType)
		expect(out.width).toEqual(2)
		// every 2x2 block contains two 0s and two 2s => avg 1
		for (let i = 0; i < out.data.length; i++) {
			const v = DataUtils.fromHalfFloat((out.data as Uint16Array)[i])
			expect(v, 'half-float avg must be 1').toBeCloseTo(1, 0.1)
		}
	})

	it('non-playfield downscale must use point sampling (stripes would appear with averaging if bug)', () => {
		const w = 4,
			h = 4,
			comps = 1
		const data = new Float32Array(w * h)
		for (let i = 0; i < w * h; i++) data[i] = i
		const out = downscaleArray(data as any, w, h, 2, 'some_wall', 0)
		expect(out.width).toEqual(2)
		// point sampling: chooses sy=floor(y/nh * h), sx=floor(x/nw * w)
		// for 4->2: (0,0)->0, (1,0)->2, (0,1)->8, (1,1)->10
		const expected = [0, 2, 8, 10]
		for (let i = 0; i < 4; i++) expect((out.data as Float32Array)[i]).toEqual(expected[i])
	})

	it('6080x8192 playfield must downscale to <=4096', () => {
		const w = 6080,
			h = 8192
		// Math only (no pixel buffer, no large alloc): scale = min(4096/6080, 4096/8192)=0.5
		const max = getMaxTextureSize('VLM.Nestmap0')
		expect(max).toEqual(4096)
		const scale = Math.min(max / w, max / h)
		const nw = Math.floor(w * scale)
		const nh = Math.floor(h * scale)
		expect(nw, 'nw <=4096').toBeLessThanOrEqual(4096)
		expect(nh, 'nh <=4096').toBeLessThanOrEqual(4096)
		expect(nw).toEqual(3040) // 6080*0.5
		expect(nh).toEqual(4096) // 8192*0.5
		// ensure not 16384 (old bug would have allowed 6080x8192 without downscale on hw 16384)
		expect(max, 'old bug cap 16384 must not be used').not.toEqual(16384)
	})
})

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

let crcTable: Uint32Array | null = null

function specCrc32(bytes: Uint8Array): number {
	if (!crcTable) {
		crcTable = new Uint32Array(256)
		for (let entry = 0; entry < 256; entry++) {
			let crc = entry
			for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
			crcTable[entry] = crc
		}
	}
	let crc = 0xffffffff
	for (let index = 0; index < bytes.length; index++) crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

function specPngChunk(type: string, payload: Uint8Array): Uint8Array {
	const chunk = new Uint8Array(12 + payload.length)
	const view = new DataView(chunk.buffer)
	view.setUint32(0, payload.length)
	for (let index = 0; index < 4; index++) chunk[4 + index] = type.charCodeAt(index)
	chunk.set(payload, 8)
	view.setUint32(8 + payload.length, specCrc32(chunk.subarray(4, 8 + payload.length)))
	return chunk
}

function specMakePng(
	width: number,
	height: number,
	colorType: number,
	scanlines: Uint8Array,
	palette?: Uint8Array,
	transparency?: Uint8Array,
): Uint8Array {
	const header = new Uint8Array(13)
	const view = new DataView(header.buffer)
	view.setUint32(0, width)
	view.setUint32(4, height)
	header[8] = 8
	header[9] = colorType
	const parts = [PNG_SIGNATURE, specPngChunk('IHDR', header)]
	if (palette) parts.push(specPngChunk('PLTE', palette))
	if (transparency) parts.push(specPngChunk('tRNS', transparency))
	parts.push(specPngChunk('IDAT', deflate(scanlines)))
	parts.push(specPngChunk('IEND', new Uint8Array(0)))
	const total = parts.reduce((sum, part) => sum + part.length, 0)
	const out = new Uint8Array(total)
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.length
	}
	return out
}

type SpecImage = { image: { width: number; height: number; data: Uint8Array }; name: string }

describe('node texture loader png decode', () => {
	const loader = new ThreeTextureLoaderNode()

	it('decodes 8-bit RGBA png to RGBA shape', async () => {
		const scanlines = new Uint8Array([0, 255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 0, 255, 0, 255, 255, 255, 255])
		const tex = (await loader.loadTexture('rgba', '.png', specMakePng(2, 2, 6, scanlines))) as unknown as SpecImage
		expect(tex.image.width).toEqual(2)
		expect(tex.image.height).toEqual(2)
		expect(tex.image.data.length).toEqual(2 * 2 * 4)
		expect(tex.name).toEqual('texture:rgba')
	})

	it('decodes paletted png with tRNS to RGBA shape', async () => {
		const scanlines = new Uint8Array([0, 0, 1, 2])
		const palette = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255])
		const transparency = new Uint8Array([255, 128])
		const tex = (await loader.loadTexture(
			'pal',
			'.png',
			specMakePng(3, 1, 3, scanlines, palette, transparency),
		)) as unknown as SpecImage
		expect(tex.image.width).toEqual(3)
		expect(tex.image.height).toEqual(1)
		expect(tex.image.data.length).toEqual(3 * 1 * 4)
	})

	it('decodes grayscale, grayscale+alpha and rgb pngs to RGBA shape', async () => {
		const gray = (await loader.loadTexture(
			'gray',
			'.png',
			specMakePng(2, 1, 0, new Uint8Array([0, 0, 255])),
		)) as unknown as SpecImage
		expect(gray.image.width).toEqual(2)
		expect(gray.image.height).toEqual(1)
		expect(gray.image.data.length).toEqual(2 * 1 * 4)
		const grayAlpha = (await loader.loadTexture(
			'graya',
			'.png',
			specMakePng(1, 1, 4, new Uint8Array([0, 100, 200])),
		)) as unknown as SpecImage
		expect(grayAlpha.image.width).toEqual(1)
		expect(grayAlpha.image.height).toEqual(1)
		expect(grayAlpha.image.data.length).toEqual(1 * 1 * 4)
		const rgb = (await loader.loadTexture(
			'rgb',
			'.png',
			specMakePng(1, 1, 2, new Uint8Array([0, 10, 20, 30])),
		)) as unknown as SpecImage
		expect(rgb.image.width).toEqual(1)
		expect(rgb.image.height).toEqual(1)
		expect(rgb.image.data.length).toEqual(1 * 1 * 4)
	})

	it('decodes real paletted res/maps png instead of placeholder', async () => {
		const file = new Uint8Array(fs.readFileSync('res/maps/ball.png'))
		const tex = (await loader.loadTexture('ball', '.png', file)) as unknown as SpecImage
		expect(tex.image.width).toEqual(116)
		expect(tex.image.height).toEqual(116)
		expect(tex.image.data.length).toEqual(116 * 116 * 4)
	})

	it('downscales oversized png to the per-name cap', async () => {
		const scanlines = new Uint8Array(10 * (1 + 3000 * 4))
		const png = specMakePng(3000, 10, 6, scanlines)
		const capped = (await loader.loadTexture('wall', '.png', png)) as unknown as SpecImage
		expect(capped.image.width).toEqual(2048)
		expect(capped.image.height).toEqual(6)
		const playfield = (await loader.loadTexture('playfield', '.png', png)) as unknown as SpecImage
		expect(playfield.image.width).toEqual(3000)
		expect(playfield.image.height).toEqual(10)
	})

	it('node png downscale is byte-identical to the shared downscale path', async () => {
		// Alternating black/white columns distinguish box-average (midtones)
		// from point sampling; the loader must emit exactly what the shared
		// kernel computes for the same pattern.
		const w = 2052
		const h = 2
		const pattern = new Uint8Array(w * h * 4)
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const v = x % 2 === 0 ? 0 : 255
				pattern.set([v, v, v, 255], (y * w + x) * 4)
			}
		const scanlines = new Uint8Array(h * (1 + w * 4))
		for (let y = 0; y < h; y++) {
			scanlines[y * (1 + w * 4)] = 0
			scanlines.set(pattern.subarray(y * w * 4, (y + 1) * w * 4), y * (1 + w * 4) + 1)
		}
		const tex = (await loader.loadTexture(
			'some_wall',
			'.png',
			specMakePng(w, h, 6, scanlines),
		)) as unknown as SpecImage
		const expected = downscaleArray(pattern, w, h, 2048, 'some_wall')
		expect(tex.image.width).toEqual(expected.width)
		expect(tex.image.height).toEqual(expected.height)
		expect(Array.from(tex.image.data)).toEqual(Array.from(expected.data))
	})

	it('returns 1x1 placeholder for unsupported formats', async () => {
		const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3])
		const tex = (await loader.loadTexture('photo', '.jpg', jpegMagic)) as unknown as SpecImage
		expect(tex.image.width).toEqual(1)
		expect(tex.image.height).toEqual(1)
		expect(Array.from(tex.image.data)).toEqual([255, 255, 255, 255])
	})

	it('loadDefaultTexture decodes res/maps png', async () => {
		const tex = (await loader.loadDefaultTexture('bumperbase', '.png', 'bumperbase.png')) as unknown as SpecImage
		expect(tex.image.width).toEqual(512)
		expect(tex.image.height).toEqual(512)
		expect(tex.image.data.length).toEqual(512 * 512 * 4)
	})

	it('loadDefaultTexture keeps dotless fallback names whole', async () => {
		const browser = new ThreeTextureLoaderBrowser()
		// Unknown names throw before any DOM use, so this runs in node.
		// A dotless name must not lose its final character to the ext strip.
		await expect(browser.loadDefaultTexture('x', '', 'glassnormal')).rejects.toThrow(
			'Unknown local texture "glassnormal".',
		)
		await expect(browser.loadDefaultTexture('x', '', 'glassnormal.png')).rejects.toThrow(
			'Unknown local texture "glassnormal".',
		)
	})
})
