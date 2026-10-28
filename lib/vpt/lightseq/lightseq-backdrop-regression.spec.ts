// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { LightSeqData } from './lightseq.js'

function record(tag: string, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(8 + payload.length)
	new DataView(out.buffer).setInt32(0, payload.length + 4, true)
	out.set(new TextEncoder().encode(tag), 4)
	out.set(payload, 8)
	return out
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

describe('LightSeq backdrop flag (upstream lightseq.cpp:284, 306)', () => {
	it('should parse the BGLS tag', async () => {
		const data = await LightSeqData.fromStorage(storageOf(intRecord('BGLS', 1), end), 'LightSeq1')
		expect(data.isBackglass).toBe(true)
	})

	it('should default to the playfield like upstream', async () => {
		const data = await LightSeqData.fromStorage(storageOf(end), 'LightSeq1')
		expect(data.isBackglass).toBe(false)
	})

	it('should ignore unknown tags', async () => {
		const data = await LightSeqData.fromStorage(
			storageOf(intRecord('BGLS', 1), record('ZZZZ', new Uint8Array([1, 2, 3, 4])), end),
			'LightSeq1',
		)
		expect(data.isBackglass).toBe(true)
	})
})
