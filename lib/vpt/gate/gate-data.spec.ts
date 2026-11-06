// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { GateData } from './gate-data.js'

chai.use((sinonChai as any).default ?? sinonChai)

async function loadWithAngles(angleMax: number, angleMin: number): Promise<GateData> {
	const record = new Uint8Array(32)
	const view = new DataView(record.buffer)
	view.setInt32(0, 8, true)
	record.set([0x47, 0x41, 0x4d, 0x41], 4) // GAMA
	view.setFloat32(8, angleMax, true)
	view.setInt32(12, 8, true)
	record.set([0x47, 0x41, 0x4d, 0x49], 16) // GAMI
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
	return GateData.fromStorage(storage as unknown as Storage, 'Gate')
}

describe('The gate angle tags', () => {
	it('should keep inverted angles raw at parse like upstream Load', async () => {
		const data = await loadWithAngles(0.1, 1.2)
		expect(data.angleMax).to.be.closeTo(0.1, 1e-6)
		expect(data.angleMin).to.be.closeTo(1.2, 1e-6)
	})

	it('should default to one-way like upstream, not two-way', () => {
		expect(new GateData('Gate').twoWay).to.equal(false)
	})
})
