// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { SpinnerData } from './spinner-data.js'

chai.use((sinonChai as any).default ?? sinonChai)

async function loadWithAngles(angleMax: number, angleMin: number): Promise<SpinnerData> {
	const record = new Uint8Array(32)
	const view = new DataView(record.buffer)
	view.setInt32(0, 8, true)
	record.set([0x53, 0x4d, 0x41, 0x58], 4) // SMAX
	view.setFloat32(8, angleMax, true)
	view.setInt32(12, 8, true)
	record.set([0x53, 0x4d, 0x49, 0x4e], 16) // SMIN
	view.setFloat32(20, angleMin, true)
	view.setInt32(24, 4, true)
	record.set([0x45, 0x4e, 0x44, 0x42], 28) // ENDB
	const storage = {
		async streamFiltered(
			_name: string,
			_offset: number,
			next: (result: ReadResult) => Promise<number | null>,
		): Promise<void> {
			let pos = 0
			while (pos < record.length) {
				const consumed = await next({ data: record.subarray(pos), storageOffset: pos })
				if (consumed === null) break
				pos += consumed
			}
		},
	}
	return SpinnerData.fromStorage(storage as unknown as Storage, 'Spinner')
}

describe('The spinner angle tags', () => {
	it('should keep inverted angles raw at parse like upstream Load', async () => {
		const data = await loadWithAngles(-45, 45)
		expect(data.angleMax).to.equal(-45)
		expect(data.angleMin).to.equal(45)
	})

	it('should keep out-of-range angles raw at parse', async () => {
		const data = await loadWithAngles(720, -720)
		expect(data.angleMax).to.equal(720)
		expect(data.angleMin).to.equal(-720)
	})
})
