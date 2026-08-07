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

describe('The VPinball ball collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-empty.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should hit the bottom of the playfield', async () => {
		const ball = createBall(player, 500, 2100, 0)

		player.updatePhysics(0)
		player.updatePhysics(2000)

		expect(Math.round(ball.getState().pos.y)).to.equal(2197)

		player.updatePhysics(3000)
		expect(Math.round(ball.getState().pos.y)).to.equal(2197)
	})

	it('should collide with two balls', async () => {
		const ball1 = createBall(player, 400, 1050, 0, 10, -10)
		const ball2 = createBall(player, 700, 1050, 0, -10, -10)

		player.updatePhysics(0)
		player.updatePhysics(110)
		expect(ball1.getState().pos.x).to.above(500)
		expect(ball2.getState().pos.x).to.below(600)

		player.updatePhysics(180)
		expect(ball1.getState().pos.x).to.below(500)
		expect(ball2.getState().pos.x).to.above(600)
	})
})
