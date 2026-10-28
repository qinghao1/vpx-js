// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { TriggerData } from './trigger-data.js'

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

describe('Trigger controller link (upstream trigger.cpp:529, 563)', () => {
	it('should parse the LINK tag', async () => {
		const data = await TriggerData.fromStorage(
			storageOf(stringRecord('LINK', 'ctrl://pinmame/state?group=10&mapping=11'), end),
			'Trig1',
		)
		expect(data.stateSrcLink).toBe('ctrl://pinmame/state?group=10&mapping=11')
	})

	it('should leave the link undefined when LINK is absent', async () => {
		const data = await TriggerData.fromStorage(storageOf(end), 'Trig1')
		expect(data.stateSrcLink).toBeUndefined()
	})
})
