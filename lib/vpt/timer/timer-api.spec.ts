// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball timer API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const timer = table.timers.Timer1.getApi()

		timer.Name = 'timername'
		expect(timer.Name).to.equal('timername')
		timer.Interval = 99
		expect(timer.Interval).to.equal(99)
		timer.Enabled = false
		expect(timer.Enabled).to.equal(false)
		timer.Enabled = true
		expect(timer.Enabled).to.equal(true)
		timer.UserValue = '1'
		expect(timer.UserValue).to.equal('1')
		timer.X = 2345
		expect(timer.X).to.equal(2345)
		timer.Y = 6354
		expect(timer.Y).to.equal(6354)
	})

	it('should execute the timer until disabled', async () => {
		const timer = table.timers.Timer1.getApi()

		timer.Enabled = true
		timer.Interval = 150
		const eventSpy = sinon.spy()
		timer.on('Timer', eventSpy)

		player.updatePhysics(120)
		expect(eventSpy).to.have.been.not.called

		player.updatePhysics(151)
		expect(eventSpy).to.have.been.calledOnce

		player.updatePhysics(451)
		expect(eventSpy).to.have.been.calledThrice

		timer.Enabled = false
		player.updatePhysics(601)
		expect(eventSpy).to.have.been.calledThrice // still 3x
	})

	it('should not exectue a disabled timer', () => {
		const timer = table.timers.TimerDisabled.getApi()
		const eventSpy = sinon.spy()
		timer.on('Timer', eventSpy)
		player.updatePhysics(120)
		expect(eventSpy).to.have.been.not.called
	})
})
