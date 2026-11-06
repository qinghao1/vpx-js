import { describe, expect, it } from 'vitest'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { LightData } from './light.js'

function stringRecord(tag: string, value: string): Uint8Array {
	const text = new TextEncoder().encode(value)
	const payload = new Uint8Array(4 + text.length)
	new DataView(payload.buffer).setInt32(0, text.length, true)
	payload.set(text, 4)
	const record = new Uint8Array(8 + payload.length)
	new DataView(record.buffer).setInt32(0, payload.length + 4, true)
	record.set(new TextEncoder().encode(tag), 4)
	record.set(payload, 8)
	return record
}

function endRecord(): Uint8Array {
	const record = new Uint8Array(8)
	new DataView(record.buffer).setInt32(0, 4, true)
	record.set(new TextEncoder().encode('ENDB'), 4)
	return record
}

function storageFromRecords(records: Uint8Array[]): Storage {
	return {
		streamFiltered: async (_name: string, _offset: number, next: (r: ReadResult) => Promise<number | null>) => {
			for (const data of records) {
				if ((await next({ data, storageOffset: 0 })) === null) break
			}
		},
	} as unknown as Storage
}

describe('The VPinball light controller link', () => {
	it('should parse the LINK tag into stateSrcLink', async () => {
		const link = 'ctrl://pinmame/state?group=10&mapping=11'
		const data = await LightData.fromStorage(
			storageFromRecords([stringRecord('LINK', link), endRecord()]),
			'Light1',
		)
		expect(data.stateSrcLink).toBe(link)
	})
})
