// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { DispReelData } from './dispreel.js'

const tagBytes = (tag: string): number[] => [...tag].map(char => char.charCodeAt(0))

function record(tag: string, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(8 + payload.length)
	new DataView(out.buffer).setInt32(0, 4 + payload.length, true)
	out.set(tagBytes(tag), 4)
	out.set(payload, 8)
	return out
}

const floats = (...values: number[]): Uint8Array => new Uint8Array(new Float32Array(values).buffer)
const int32 = (value: number): Uint8Array => new Uint8Array(new Int32Array([value]).buffer)
const text = (value: string): Uint8Array => Uint8Array.from([...int32(value.length), ...tagBytes(value)])
const wideText = (value: string): Uint8Array =>
	Uint8Array.from([...int32(value.length * 2), ...new Uint8Array(new Uint16Array(tagBytes(value)).buffer)])

async function load(...records: Uint8Array[]): Promise<DispReelData> {
	const stream = Uint8Array.from([...records.flatMap(rec => [...rec]), ...record('ENDB', new Uint8Array(0))])
	const storage = {
		async streamFiltered(
			_name: string,
			_offset: number,
			next: (result: ReadResult) => Promise<number | null>,
		): Promise<void> {
			let pos = 0
			while (pos < stream.length) {
				const consumed = await next({ data: stream.subarray(pos), storageOffset: pos })
				if (consumed === null) break
				pos += consumed
			}
		},
	}
	return DispReelData.fromStorage(storage as unknown as Storage, 'Reel1')
}

describe('DispReelData BIFF tags', () => {
	it('keeps the defaults without tags', async () => {
		const data = await load()
		expect(data.reelCount).toBe(5)
		expect(data.digitRange).toBe(9)
		expect(data.isVisible).toBe(true)
		expect(data.useImageGrid).toBe(false)
	})

	it('reads layout floats, vertex, flags, image grid and strings', async () => {
		const data = await load(
			record('VER1', floats(120, 340)),
			record('WDTH', floats(31.5)),
			record('HIGH', floats(42.25)),
			record('RSPC', floats(6)),
			record('GIPR', int32(4)),
			record('UGRD', int32(1)),
			record('VISI', int32(0)),
			record('IMAG', text('reels')),
			record('NAME', wideText('Reel1')),
		)
		expect(data.v1.x).toBe(120)
		expect(data.v1.y).toBe(340)
		expect(data.width).toBe(31.5)
		expect(data.height).toBe(42.25)
		expect(data.reelSpacing).toBe(6)
		expect(data.imagesPerGridRow).toBe(4)
		expect(data.useImageGrid).toBe(true)
		expect(data.isVisible).toBe(false)
		expect(data.szImage).toBe('reels')
		expect(data.name).toBe('Reel1')
	})

	it('stores reel count and range as floats and truncates them to ints', async () => {
		const whole = await load(record('RCNT', floats(5)), record('RANG', floats(9)))
		expect(whole.reelCount).toBe(5)
		expect(whole.digitRange).toBe(9)
		const fractional = await load(record('RCNT', floats(6.9)), record('RANG', floats(9.7)))
		expect(fractional.reelCount).toBe(6)
		expect(fractional.digitRange).toBe(9)
	})
})
