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

describe('The VPinball primitive collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-primitive.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('with a simple primitive make the ball bounce back on collision', () => {
		// create ball
		const kicker = table.kickers.BallRelease.getApi()
		const ball = kicker.CreateBall()
		kicker.Kick(0, -10)

		// let it roll down some
		player.updatePhysics(0)
		player.updatePhysics(100)

		// assert it's moving down
		expect(ball.getState().pos.y).to.be.above(1190)

		// let it hit and bounce back
		player.updatePhysics(550)

		// assert it bounced back
		expect(ball.getState().pos.y).to.be.below(1190)
	})

	it('with a 3D primitive make the ball bounce back on collision', async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-sink.vpx')))
		player = new Player(table).init()
		const kicker = table.kickers.BallRelease.getApi()

		// create ball
		const ball = kicker.CreateBall()
		kicker.Kick(-45, 4.5)

		// assert initial position
		expect(ball.getState().pos.x).to.equal(600)
		expect(ball.getState().pos.y).to.equal(1250)
		expect(ball.getState().pos.z).to.equal(25)

		// let it roll up left to the sink
		player.updatePhysics(0)
		player.updatePhysics(350)

		// assert it's moving up left
		expect(ball.getState().pos.x).to.be.below(520)
		expect(ball.getState().pos.y).to.be.below(1175)

		// let it collide and roll back to kicker
		player.updatePhysics(1500)

		// assert it's on its way back
		expect(ball.getState().pos.x).to.be.above(520)
		expect(ball.getState().pos.y).to.be.above(1175)

		// after some time it gets locked back into the kicker!
		player.updatePhysics(2100)
		expect(ball.getState().pos.x).to.equal(600)
		expect(ball.getState().pos.y).to.equal(1250)
		expect(ball.getState().pos.z).to.equal(25)
	})
})
