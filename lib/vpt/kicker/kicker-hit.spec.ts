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

describe('The VPinball kicker collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-kicker.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	describe('in legacy mode', () => {
		it('should collide with the ball and keep the ball', () => {
			// above kicker
			const ball = createBall(player, 128, 1200, 0, 0, 2)

			// let it roll down
			player.updatePhysics(0)
			player.updatePhysics(700)

			// make sure it's fixed
			expect(ball.getState().pos.x).to.be.above(127)
			expect(ball.getState().pos.x).to.be.below(128)
			expect(ball.getState().pos.y).to.be.above(1325)
			expect(ball.getState().pos.y).to.be.below(1326)
			expect(ball.getState().pos.z).to.be.above(0)

			// make sure it's still there
			player.updatePhysics(1000)
			expect(ball.getState().pos.x).to.be.above(127)
			expect(ball.getState().pos.x).to.be.below(128)
			expect(ball.getState().pos.y).to.be.above(1325)
			expect(ball.getState().pos.y).to.be.below(1326)
			expect(ball.getState().pos.z).to.be.above(0)
		})

		it('should collide with the ball and fall through', () => {
			// above fallthrough kicker (it's Cup2)
			const ball = createBall(player, 247, 1200, 0, 0, 2)

			// let it roll down
			player.updatePhysics(0)
			player.updatePhysics(700)

			// assert it fell through
			expect(ball.getState().pos.z).to.be.below(-100)
		})

		it('should collide with the ball and fall through', () => {
			// above fallthrough kicker (it's Cup2)
			const ball = createBall(player, 247, 1200, 0, 0, 2)

			// let it roll down
			player.updatePhysics(0)
			player.updatePhysics(700)

			// assert it fell through
			expect(ball.getState().pos.z).to.be.below(-100)
		})

		it('should let the ball roll over it not enabled', () => {
			// above disabled kicker (it's HoleSimple)
			const ball = createBall(player, 623, 1200, 0, 0, 2)

			// let it roll down
			player.updatePhysics(0)
			player.updatePhysics(2000)

			// make sure it's below the kicker
			expect(ball.getState().pos.y).to.be.above(1700)
			expect(ball.getState().pos.z).to.be.above(0)
		})
	})

	it('should collide with the ball and keep the ball', () => {
		const ballRelease = table.kickers.BallRelease.getApi()
		const ball = ballRelease.CreateBall()
		ballRelease.Kick(0, -2)

		// let it roll down
		player.updatePhysics(0)
		player.updatePhysics(635)

		// make sure it's fixed
		expect(ball.getState().pos.x).to.be.within(874, 875)
		expect(ball.getState().pos.y).to.be.within(1326, 1327)
		expect(ball.getState().pos.z).to.be.equal(25)

		// make sure it's still there
		player.updatePhysics(800)
		expect(ball.getState().pos.x).to.be.within(874, 875)
		expect(ball.getState().pos.y).to.be.within(1326, 1327)
		expect(ball.getState().pos.z).to.be.equal(25)
	})

	// add second ball
})
