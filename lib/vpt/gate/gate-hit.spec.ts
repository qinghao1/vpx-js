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

describe('The VPinball gate collision', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-gate.vpx')))
		player = new Player(table).init()
	})

	it('should block the ball on a one-way gate', () => {
		const ball = createBall(player, 530, 1340, 0, 0, 2)
		expect(ball.getState().pos.y).to.equal(1340)

		// gate hit!
		player.updatePhysics(370)
		expect(ball.getState().pos.y).to.be.within(1400, 1405)

		// still there?
		player.updatePhysics(600)
		expect(ball.getState().pos.y).to.be.within(1400, 1405)
	})

	it('should let the ball through a two-way gate', () => {
		const ball = createBall(player, 380, 1340, 0, 0, 2)
		expect(ball.getState().pos.y).to.equal(1340)

		// gate hit!
		player.updatePhysics(370)
		expect(ball.getState().pos.y).to.be.within(1400, 1405)

		// down there?
		player.updatePhysics(600)
		expect(ball.getState().pos.y).to.be.above(1440)
	})

	it('should let the ball through a one-way gate', () => {
		const ball = createBall(player, 530, 1500, 0, 0, -10)
		expect(ball.getState().pos.y).to.equal(1500)

		player.updatePhysics(500)
		expect(ball.getState().pos.y).to.be.below(1130)

		player.updatePhysics(1000)
		expect(ball.getState().pos.y).to.be.below(810)
	})
})
