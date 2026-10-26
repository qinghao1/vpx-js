// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Table } from '../table/table.js'
import { GateData } from './gate-data.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

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
})

describe('The gate angle correction', () => {
	it('should correct inverted angles at setupPlayer for a one-way gate', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-gate.vpx')))
		const gate = table.gates.WireRectangle
		gate.data.angleMax = 0.1
		gate.data.angleMin = 1.2
		new Player(table).init()
		expect(gate.data.angleMin).to.be.closeTo(0.1, 1e-6)
		expect(gate.data.angleMax).to.be.closeTo(1.2, 1e-6)
		expect(gate.getMover().angleMin).to.be.closeTo(0.1, 1e-6)
		expect(gate.getMover().angleMax).to.be.closeTo(1.2, 1e-6)
	})

	it('should correct inverted angles at setupPlayer for a two-way gate like upstream PhysicSetup', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-gate.vpx')))
		const gate = table.gates.Plate
		expect(gate.data.twoWay).to.equal(true)
		gate.data.angleMax = 0.1
		gate.data.angleMin = 1.2
		new Player(table).init()
		expect(gate.data.angleMin).to.be.closeTo(0.1, 1e-6)
		expect(gate.data.angleMax).to.be.closeTo(1.2, 1e-6)
	})
})

describe('The gate draw style setter', () => {
	it('should store out-of-range values raw like upstream put_DrawStyle', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-gate.vpx')))
		new Player(table).init()
		const api = table.gates.Plate.getApi()
		api.DrawStyle = 99
		expect(api.DrawStyle).to.equal(99)
	})
})
