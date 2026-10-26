import { expect } from 'chai'
import { ThreeHelper } from '../../test/three.helper'
import { Player } from '../game/player.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Table } from './table/table.js'

const three = new ThreeHelper()

describe('The VPinball item API', () => {
	let table: Table

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-gate.vpx')))
		new Player(table).init()
	})

	it('should resolve UserValue case-insensitively', async () => {
		const gate = table.gates.Plate.getApi()
		gate.UserValue = 'qwerty'
		expect((gate as any).uservalue).to.equal('qwerty')
		expect((gate as any).USERVALUE).to.equal('qwerty')
	})

	it('should write UserValue case-insensitively', async () => {
		const gate = table.gates.Plate.getApi()
		;(gate as any).uservalue = 'mixed'
		expect(gate.UserValue).to.equal('mixed')
	})

	it('should map instance fields in _getPropertyName', async () => {
		const gate = table.gates.Plate.getApi()
		expect(gate._getPropertyName('uservalue')).to.equal('UserValue')
		expect(gate._getPropertyName('UserValue')).to.equal('UserValue')
	})

	it('should test property presence case-insensitively', async () => {
		const gate = table.gates.Plate.getApi()
		expect('uservalue' in gate).to.equal(true)
		expect('USERVALUE' in gate).to.equal(true)
		expect('timerinterval' in gate).to.equal(true)
		expect('NoSuchProperty' in gate).to.equal(false)
	})
})
