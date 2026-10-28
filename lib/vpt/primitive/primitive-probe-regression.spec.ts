// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { PrimitiveData } from './primitive-data.js'

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

function floatRecord(tag: string, value: number): Uint8Array {
	const payload = new Uint8Array(4)
	new DataView(payload.buffer).setFloat32(0, value, true)
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

describe('Primitive reflection probes (upstream primitive.cpp:1309-1312, 1534-1537)', () => {
	it('should parse REFL/RSTR/REFR/RTHI tags', async () => {
		const data = await PrimitiveData.fromStorage(
			storageOf(
				stringRecord('REFL', 'playfield-reflection'),
				floatRecord('RSTR', 0.25),
				stringRecord('REFR', 'glass-refraction'),
				floatRecord('RTHI', 5),
				end,
			),
			'Prim1',
			true,
		)
		expect(data.szReflectionProbe).toBe('playfield-reflection')
		expect(data.reflectionStrength).toBe(0.25)
		expect(data.szRefractionProbe).toBe('glass-refraction')
		expect(data.refractionThickness).toBe(5)
	})

	it('should default probes like upstream', async () => {
		const data = await PrimitiveData.fromStorage(storageOf(end), 'Prim1', true)
		expect(data.szReflectionProbe).toBeUndefined()
		expect(data.reflectionStrength).toBe(1)
		expect(data.szRefractionProbe).toBeUndefined()
		expect(data.refractionThickness).toBe(10)
	})

	it('should ignore unknown tags', async () => {
		const data = await PrimitiveData.fromStorage(
			storageOf(stringRecord('REFL', 'probe'), record('ZZZZ', new Uint8Array([1, 2, 3, 4])), end),
			'Prim1',
			true,
		)
		expect(data.szReflectionProbe).toBe('probe')
	})
})
