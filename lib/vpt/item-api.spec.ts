import { expect } from 'chai'
import { ThreeHelper } from '../../test/three.helper'
import { Player } from '../game/player.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Table } from './table/table.js'

const three = new ThreeHelper()

describe('The VPinball item API', () => {
	let table: Table

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-gate.vpx')))
		new Player(table).init()
	})

	it('should resolve UserValue case-insensitively', () => {
		const gate = table.gates.Plate.getApi()
		gate.UserValue = 'qwerty'
		expect((gate as any).uservalue).to.equal('qwerty')
		expect((gate as any).USERVALUE).to.equal('qwerty')
	})

	it('should write UserValue case-insensitively', () => {
		const gate = table.gates.Plate.getApi()
		;(gate as any).uservalue = 'mixed'
		expect(gate.UserValue).to.equal('mixed')
	})
})
