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

describe('The VPinball rubber collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-rubber.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should make the ball bounce off', () => {
		const kicker = table.kickers.BallRelease.getApi()

		// create ball
		const ball = kicker.CreateBall()
		kicker.Kick(-45, -5)

		// let it roll down some
		player.updatePhysics(0)
		player.updatePhysics(700)

		// assert it's moving down right
		expect(ball.getState().pos.x).to.be.above(400)
		expect(ball.getState().pos.y).to.be.above(400)

		// let it hit and bounce back
		player.updatePhysics(1200)

		// assert it bounced back
		expect(ball.getState().pos.x).to.be.below(400)
		expect(ball.getState().pos.y).to.be.below(400)
	})
})
