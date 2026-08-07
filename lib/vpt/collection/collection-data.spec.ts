// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
import type { CollectionData } from './collection-data.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball collection data', () => {
	it('should correctly read the data from the .vpx file', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-collection.vpx')))

		const dataA = (table.collections.CollectionA as any).data as CollectionData
		expect(table.collections.CollectionA).to.be.ok
		expect(dataA.fireEvents).to.equal(false)
		expect(dataA.stopSingleEvents).to.equal(false)
		expect(dataA.groupElements).to.equal(true)
		expect(dataA.itemNames).to.have.lengthOf(2)
		expect(dataA.itemNames[0]).to.equal('TimerA')
		expect(dataA.itemNames[1]).to.equal('TimerAB')

		const dataB = (table.collections.CollectionB as any).data as CollectionData
		expect(table.collections.CollectionB).to.be.ok
		expect(dataB.fireEvents).to.equal(true)
		expect(dataB.stopSingleEvents).to.equal(true)
		expect(dataB.groupElements).to.equal(false)
		expect(dataB.itemNames).to.have.lengthOf(2)
		expect(dataB.itemNames[0]).to.equal('TimerB')
		expect(dataB.itemNames[1]).to.equal('TimerAB')
	})
})
