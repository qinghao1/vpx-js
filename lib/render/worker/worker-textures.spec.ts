// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { FloatType, HalfFloatType } from 'three'
import { describe, expect, it } from 'vitest'
import { getEffectiveCaps } from '../../util/quality.js'
import { ThreeTextureLoaderWorker } from './worker-textures.js'

/** Minimal flat-color Radiance HDR with RLE scanlines (three HDRLoader parses RLE). */
function makeRleHdr(
	width: number,
	height: number,
	rgbe: [number, number, number, number] = [128, 128, 128, 128],
): Uint8Array {
	const head = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nEXPOSURE=1.0\n\n-Y ${height} +X ${width}\n`
	const enc = new TextEncoder().encode(head)
	const out: number[] = []
	const pushRun = (value: number, count: number) => {
		let left = count
		while (left > 0) {
			const n = Math.min(left, 127)
			out.push(128 + n, value)
			left -= n
		}
	}
	for (let y = 0; y < height; y++) {
		out.push(0x02, 0x02, (width >> 8) & 0xff, width & 0xff)
		for (let c = 0; c < 4; c++) pushRun(rgbe[c] ?? 0, width)
	}
	const blob = new Uint8Array(enc.length + out.length)
	blob.set(enc, 0)
	blob.set(out, enc.length)
	return blob
}

const bytesPerPixel = (tex: any): number => {
	const t = tex?.type
	// RGBA: HalfFloatType = 8B/px, FloatType = 16B/px, else 4 (UnsignedByte).
	if (t === FloatType) return 16
	if (t === HalfFloatType) return 8
	return 4
}

describe('ThreeTextureLoaderWorker upload caps', () => {
	it('caps oversized raw frames to the name cap', async () => {
		const caps = getEffectiveCaps()
		const loader = new ThreeTextureLoaderWorker()
		const w = caps.other + 1
		const h = 16
		const tex: any = await loader.loadRawTexture('test_other', new Uint8Array(w * h * 4).fill(200), w, h)
		expect(tex.image.width).toBe(caps.other)
		expect(tex.image.height).toBeLessThan(h)
		expect(tex.image.width * tex.image.height * 4).toBeLessThanOrEqual(256 * 1024 * 1024)
	})

	it('caps oversized playfield raw frames to the playfield cap', async () => {
		const caps = getEffectiveCaps()
		const loader = new ThreeTextureLoaderWorker()
		const w = caps.playfield + 1
		const h = 16
		const tex: any = await loader.loadRawTexture('test_playfield', new Uint8Array(w * h * 4).fill(200), w, h)
		expect(tex.image.width).toBe(caps.playfield)
		expect(tex.image.height).toBeLessThan(h)
	})

	it('caps oversized HDR decodes before upload', async () => {
		const caps = getEffectiveCaps()
		const loader = new ThreeTextureLoaderWorker()
		const w = caps.other + 1
		const h = 16
		const tex: any = await loader.loadTexture('test_other.hdr', '.hdr', makeRleHdr(w, h))
		expect(tex.image.width).toBe(caps.other)
		expect(tex.image.height).toBeLessThan(h)
		expect(tex.image.width * tex.image.height * bytesPerPixel(tex)).toBeLessThanOrEqual(256 * 1024 * 1024)
	})

	it('leaves small textures untouched', async () => {
		const loader = new ThreeTextureLoaderWorker()
		const tex: any = await loader.loadRawTexture('test_other', new Uint8Array(64 * 64 * 4).fill(200), 64, 64)
		expect(tex.image.width).toBe(64)
		expect(tex.image.height).toBe(64)
	})
})
