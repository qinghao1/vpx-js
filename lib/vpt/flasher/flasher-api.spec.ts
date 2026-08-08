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

describe('The VPinball flasher API', () => {
	let table: Table
	let _player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flasher.vpx')))
		_player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const flasher = table.flashers.Flasher.getApi()

		flasher.X = 304
		flasher.Y = 1.8
		flasher.RotX = 554.7
		flasher.RotY = 943
		flasher.RotZ = 275
		flasher.Height = 52
		flasher.Color = 0x55ff9a
		flasher.ImageA = 'ImageA'
		flasher.ImageB = 'ImageB'
		flasher.Filter = 'Additive'
		expect(flasher.Filter).to.equal('Additive')
		flasher.Filter = 'Multiply'
		expect(flasher.Filter).to.equal('Multiply')
		flasher.Filter = 'Screen'
		expect(flasher.Filter).to.equal('Screen')
		flasher.Filter = 'None'
		expect(flasher.Filter).to.equal('None')
		flasher.Filter = 'invalid-so-none'
		flasher.Opacity = -5
		expect(flasher.Opacity).to.equal(0)
		flasher.Opacity = 0.9
		flasher.IntensityScale = 1.5
		flasher.ModulateVsAdd = 0.8
		flasher.Amount = -1
		expect(flasher.Amount).to.equal(0)
		flasher.Amount = 5
		flasher.Visible = true
		expect(flasher.Visible).to.equal(true)
		flasher.Visible = false
		flasher.DisplayTexture = true
		expect(flasher.DisplayTexture).to.equal(true)
		flasher.DisplayTexture = false
		flasher.AddBlend = true
		expect(flasher.AddBlend).to.equal(true)
		flasher.AddBlend = false
		flasher.DMD = true
		expect(flasher.DMD).to.equal(true)
		flasher.DMD = false
		flasher.DepthBias = 2.6
		flasher.ImageAlignment = Enums.ImageAlignment.ImageAlignTopLeft
		expect(flasher.ImageAlignment).to.equal(Enums.ImageAlignment.ImageAlignTopLeft)
		flasher.ImageAlignment = Enums.ImageAlignment.ImageAlignWorld

		expect(flasher.X).to.equal(304)
		expect(flasher.Y).to.be.closeTo(1.8, 0.0001)
		expect(flasher.RotX).to.equal(554.7)
		expect(flasher.RotY).to.equal(943)
		expect(flasher.RotZ).to.equal(275)
		expect(flasher.Height).to.equal(52)
		expect(flasher.Color).to.equal(0x55ff9a)
		expect(flasher.RotY).to.equal(943)
		expect(flasher.ImageA).to.equal('ImageA')
		expect(flasher.ImageB).to.equal('ImageB')
		expect(flasher.Filter).to.equal('None')
		expect(flasher.Opacity).to.equal(0.9)
		expect(flasher.IntensityScale).to.equal(1.5)
		expect(flasher.ModulateVsAdd).to.equal(0.8)
		expect(flasher.Amount).to.equal(5)
		expect(flasher.Visible).to.equal(false)
		expect(flasher.DisplayTexture).to.equal(false)
		expect(flasher.AddBlend).to.equal(false)
		expect(flasher.DMD).to.equal(false)
		expect(flasher.DepthBias).to.equal(2.6)
		expect(flasher.ImageAlignment).to.equal(Enums.ImageAlignment.ImageAlignWorld)
	})

	it('should not crash when executing unused APIs', () => {
		const flasher = table.flashers.Flasher.getApi()
		expect(flasher.InterfaceSupportsErrorInfo({})).to.equal(false)
	})
})
