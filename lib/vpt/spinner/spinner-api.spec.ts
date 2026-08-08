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

describe('The VPinball spinner API', () => {
	let table: Table
	let _player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-spinner.vpx')))
		_player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const spinner = table.spinners.Spinner.getApi()

		spinner.Length = 23
		spinner.Rotation = 15
		spinner.Height = 819
		spinner.Damping = 0.4
		expect(spinner.Damping).to.be.closeTo(0.4, 0.0001)
		spinner.Damping = 2
		expect(spinner.Damping).to.equal(1)
		spinner.Damping = -1
		spinner.Material = 'material'
		spinner.Image = 'test_pattern'
		spinner.X = 223
		spinner.Y = 744
		spinner.Surface = 'surface'
		spinner.ShowBracket = false
		expect(spinner.ShowBracket).to.equal(false)
		spinner.ShowBracket = true
		spinner.AngleMax = 56
		expect(spinner.AngleMax).to.equal(56)
		spinner.AngleMax = 91
		expect(spinner.AngleMax).to.equal(90)
		spinner.AngleMax = -91
		expect(spinner.AngleMax).to.equal(90)
		expect(spinner.AngleMin).to.equal(-90)
		spinner.AngleMin = -45
		expect(spinner.AngleMin).to.equal(-45)
		spinner.AngleMin = -91
		expect(spinner.AngleMin).to.equal(-90)
		spinner.AngleMin = 91
		expect(spinner.AngleMin).to.equal(-90)
		expect(spinner.AngleMax).to.equal(90)
		spinner.Elasticity = 1.665
		spinner.Visible = false
		expect(spinner.Visible).to.equal(false)
		spinner.Visible = true
		spinner.ReflectionEnabled = false
		expect(spinner.ReflectionEnabled).to.equal(false)
		spinner.ReflectionEnabled = true

		expect(spinner.Length).to.equal(23)
		expect(spinner.Rotation).to.equal(15)
		expect(spinner.Height).to.equal(819)
		expect(spinner.Damping).to.equal(0)
		expect(spinner.Material).to.equal('material')
		expect(spinner.Image).to.equal('test_pattern')
		expect(spinner.X).to.equal(223)
		expect(spinner.Y).to.equal(744)
		expect(spinner.Surface).to.equal('surface')
		expect(spinner.ShowBracket).to.equal(true)
		expect(spinner.Elasticity).to.equal(1.665)
		expect(spinner.Visible).to.equal(true)
		expect(spinner.ReflectionEnabled).to.equal(true)
		expect(spinner.CurrentAngle).to.equal(0)
	})
})
