// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball decal API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-decal.vpx')))
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const decal = table.decals.Decal001.getApi()

		decal.Rotation = 128
		decal.Image = 'test_pattern'
		decal.Width = 1685
		decal.Height = 115
		decal.X = 304
		decal.Y = 1.8
		decal.Surface = 'surface'
		decal.Type = Enums.DecalType.DecalImage
		expect(decal.Type).to.equal(Enums.DecalType.DecalImage)
		decal.Type = Enums.DecalType.DecalText
		decal.Text = 'Text'
		decal.SizingType = Enums.SizingType.AutoSize
		expect(decal.SizingType).to.equal(Enums.SizingType.AutoSize)
		decal.SizingType = Enums.SizingType.AutoWidth
		decal.FontColor = 0x913a8d
		decal.Material = 'Material'
		decal.Font = 'Font'
		decal.HasVerticalText = true
		expect(decal.HasVerticalText).to.equal(true)
		decal.HasVerticalText = false

		expect(decal.Rotation).to.equal(128)
		expect(decal.Image).to.equal('test_pattern')
		expect(decal.Width).to.equal(1685)
		expect(decal.Height).to.equal(115)
		expect(decal.X).to.equal(304)
		expect(decal.Y).to.be.closeTo(1.8, 0.0001)
		expect(decal.Surface).to.equal('surface')
		expect(decal.Type).to.equal(Enums.DecalType.DecalText)
		expect(decal.Text).to.equal('Text')
		expect(decal.SizingType).to.equal(Enums.SizingType.AutoWidth)
		expect(decal.FontColor).to.equal(0x913a8d)
		expect(decal.Material).to.equal('Material')
		expect(decal.Font).to.equal('Font')
		expect(decal.HasVerticalText).to.equal(false)
	})
})
