// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball light sequence API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-lightseq.vpx')))
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const lightSeq = table.lightSeqs.LightSeq001.getApi()

		lightSeq.Collection = 'Collection'
		lightSeq.CenterX = 145
		lightSeq.CenterY = 546
		lightSeq.UpdateInterval = 122

		expect(lightSeq.Collection).to.equal('Collection')
		expect(lightSeq.CenterX).to.equal(145)
		expect(lightSeq.CenterY).to.equal(546)
		expect(lightSeq.UpdateInterval).to.equal(122)
	})
})
