// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { createBall } from '../../../test/physics.helper'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball ramp collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-ramp.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should make the ball roll up and down a flat ramp', () => {
		const kicker = table.kickers.BallRelease.getApi()

		// create ball
		const ball = kicker.CreateBall()
		kicker.Kick(170, -20)
		expect(ball.getState().pos.y).to.equal(1163)

		// let it roll up
		player.updatePhysics(500)
		expect(ball.getState().pos.y).to.be.below(710)

		// let it roll down again
		player.updatePhysics(1000)
		expect(ball.getState().pos.y).to.be.above(1030)
	})

	it('should make the ball roll down a two-wire ramp', () => {
		// create ball
		const ball = createBall(player, 595, 571, 105)

		expect(ball.getState().pos.x).to.be.within(594, 596)
		expect(ball.getState().pos.y).to.be.within(570, 571)
		expect(ball.getState().pos.z).to.be.within(129, 130)

		player.updatePhysics(200)
		expect(ball.getState().pos.x).to.be.within(581, 583)
		expect(ball.getState().pos.y).to.be.within(599, 601)
		expect(ball.getState().pos.z).to.be.within(96, 98)

		player.updatePhysics(400)
		expect(ball.getState().pos.x).to.be.within(536, 538)
		expect(ball.getState().pos.y).to.be.within(694, 696)
		expect(ball.getState().pos.z).to.be.within(82, 84)

		player.updatePhysics(600)
		expect(ball.getState().pos.x).to.be.within(509, 511)
		expect(ball.getState().pos.y).to.be.within(844, 846)
		expect(ball.getState().pos.z).to.be.within(62, 64)

		player.updatePhysics(800)
		expect(ball.getState().pos.x).to.be.within(572, 574)
		expect(ball.getState().pos.y).to.be.within(1032, 1034)
		expect(ball.getState().pos.z).to.be.within(32, 35)
	})
})
