// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { FlasherData } from './flasher-data.js'

function record(tag: string, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(8 + payload.length)
	new DataView(out.buffer).setInt32(0, payload.length + 4, true)
	out.set(new TextEncoder().encode(tag), 4)
	out.set(payload, 8)
	return out
}

function floatRecord(tag: string, value: number): Uint8Array {
	const payload = new Uint8Array(4)
	new DataView(payload.buffer).setFloat32(0, value, true)
	return record(tag, payload)
}

function intRecord(tag: string, value: number): Uint8Array {
	const payload = new Uint8Array(4)
	new DataView(payload.buffer).setInt32(0, value, true)
	return record(tag, payload)
}

function storageOf(...records: Uint8Array[]): Storage {
	return {
		streamFiltered: async (_name: string, _offset: number, next: (r: ReadResult) => Promise<number | null>) => {
			for (const data of records) {
				if ((await next({ data, storageOffset: 0 })) === null) break
			}
		},
	} as unknown as Storage
}

const end = record('ENDB', new Uint8Array(0))

describe('Flasher display tags (upstream flasher.cpp:224-234, 276-285)', () => {
	it('should parse RSTL, glass and BGLS tags', async () => {
		const data = await FlasherData.fromStorage(
			storageOf(
				intRecord('RSTL', 3),
				floatRecord('GRGH', 0.5),
				intRecord('GAMB', 7),
				floatRecord('GTOP', 1),
				floatRecord('GBOT', 2),
				floatRecord('GLFT', 3),
				floatRecord('GRHT', 4),
				intRecord('BGLS', 1),
				end,
			),
			'Flash1',
		)
		expect(data.renderStyle).toBe(3)
		expect(data.glassRoughness).toBe(0.5)
		expect(data.glassAmbient).toBe(7)
		expect(data.glassPadTop).toBe(1)
		expect(data.glassPadBottom).toBe(2)
		expect(data.glassPadLeft).toBe(3)
		expect(data.glassPadRight).toBe(4)
		expect(data.isBackglass).toBe(true)
	})

	it('should default display tags like upstream', async () => {
		const data = await FlasherData.fromStorage(storageOf(end), 'Flash1')
		expect(data.renderStyle).toBe(0)
		expect(data.glassRoughness).toBe(0)
		expect(data.glassAmbient).toBe(0)
		expect(data.glassPadTop).toBe(0)
		expect(data.glassPadBottom).toBe(0)
		expect(data.glassPadLeft).toBe(0)
		expect(data.glassPadRight).toBe(0)
		expect(data.isBackglass).toBe(false)
	})

	it('should ignore unknown tags', async () => {
		const data = await FlasherData.fromStorage(
			storageOf(intRecord('RSTL', 3), record('ZZZZ', new Uint8Array([1, 2, 3, 4])), end),
			'Flash1',
		)
		expect(data.renderStyle).toBe(3)
	})
})
