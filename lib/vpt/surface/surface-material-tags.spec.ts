// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { SurfaceData } from './surface.js'

function record(tag: string, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(8 + payload.length)
	new DataView(out.buffer).setInt32(0, payload.length + 4, true)
	out.set(new TextEncoder().encode(tag), 4)
	out.set(payload, 8)
	return out
}

function stringRecord(tag: string, value: string): Uint8Array {
	const text = new TextEncoder().encode(value)
	const payload = new Uint8Array(4 + text.length)
	new DataView(payload.buffer).setInt32(0, text.length, true)
	payload.set(text, 4)
	return record(tag, payload)
}

function boolRecord(tag: string, value: boolean): Uint8Array {
	const payload = new Uint8Array(4)
	new DataView(payload.buffer).setInt32(0, value ? 1 : 0, true)
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

describe('Surface material tags (upstream surface.cpp:968-970, 1019-1022)', () => {
	it('should parse SIMA/TOMA/SLMA like upstream instead of MATR/TMTR/SMAT', async () => {
		const data = await SurfaceData.fromStorage(
			storageOf(
				stringRecord('SIMA', 'side-mat'),
				stringRecord('TOMA', 'top-mat'),
				stringRecord('SLMA', 'sling-mat'),
				stringRecord('MAPH', 'physics-mat'),
				end,
			),
			'Wall',
		)
		expect(data.szSideMaterial).toBe('side-mat')
		expect(data.szTopMaterial).toBe('top-mat')
		expect(data.szSlingShotMaterial).toBe('sling-mat')
		expect(data.szPhysicsMaterial).toBe('physics-mat')
	})

	it('should consume the deprecated INNR tag without keeping a dead field', async () => {
		const data = await SurfaceData.fromStorage(storageOf(boolRecord('INNR', true), end), 'Wall')
		expect('inner' in data).toBe(false)
	})

	it('should ignore unknown tags', async () => {
		const data = await SurfaceData.fromStorage(
			storageOf(stringRecord('SIMA', 'side-mat'), record('ZZZZ', new Uint8Array([1, 2, 3, 4])), end),
			'Wall',
		)
		expect(data.szSideMaterial).toBe('side-mat')
	})
})
