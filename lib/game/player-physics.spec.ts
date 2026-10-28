// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as sinon from 'sinon'
import { TableBuilder } from '../../test/table-builder.js'
import { Vertex3D } from '../math/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { FlipperMover } from '../vpt/flipper/flipper-mover.js'
import { Player } from './player.js'

describe('PlayerPhysics flipper hit-time boundary', () => {
	function setup(): { player: Player; mover: FlipperMover } {
		const table = new TableBuilder().withTableScript('').addFlipper('LeftFlipper').build('Table1')
		const player = new Player(table).init({})
		const mover = (table.flippers.LeftFlipper.getApi() as unknown as { mover: FlipperMover }).mover
		return { player, mover }
	}

	it('should consume the full cycle when a flipper hit time lands exactly on the boundary', () => {
		const { player, mover } = setup()
		const hitTime = sinon.stub(mover, 'getHitTime').returns(1)
		const displacements = sinon.spy(mover, 'updateDisplacements')
		try {
			player.getPhysics().physicsSimulateCycle(1)
			expect(displacements.callCount).to.equal(1)
			expect(displacements.firstCall.args[0]).to.equal(1)
		} finally {
			displacements.restore()
			hitTime.restore()
		}
	})

	it('should split the cycle when a flipper hit time lands strictly inside', () => {
		const { player, mover } = setup()
		const hitTime = sinon.stub(mover, 'getHitTime').returns(0.5)
		const displacements = sinon.spy(mover, 'updateDisplacements')
		try {
			player.getPhysics().physicsSimulateCycle(1)
			expect(displacements.callCount).to.equal(2)
			expect(displacements.firstCall.args[0]).to.equal(0.5)
		} finally {
			displacements.restore()
			hitTime.restore()
		}
	})
})

describe('PlayerPhysics per-ball mirror skip', () => {
	function setupBalls(): { player: Player; a: Ball; b: Ball } {
		const table = new TableBuilder().build('Table1')
		const player = new Player(table).init({})
		const mkBall = (x: number): Ball =>
			player.createBall(
				{
					getBallCreationPosition: () => new Vertex3D(x, 0, 100),
					getBallCreationVelocity: () => new Vertex3D(0, 0, 0),
					onBallCreated: () => {},
				},
				25,
			)
		return { player, a: mkBall(0), b: mkBall(300) }
	}

	it('should skip only the mirrored movers', () => {
		const { player, a, b } = setupBalls()
		const physics = player.getPhysics()
		const skip = new Set([a.getMover()])
		const displacementsA = sinon.spy(a.getMover(), 'updateDisplacements')
		const displacementsB = sinon.spy(b.getMover(), 'updateDisplacements')
		const velocitiesA = sinon.spy(a.getMover(), 'updateVelocities')
		const velocitiesB = sinon.spy(b.getMover(), 'updateVelocities')
		try {
			physics.physicsSimulateCycle(0.016, skip)
			expect(displacementsA.callCount).to.equal(0)
			expect(displacementsB.callCount).to.be.greaterThan(0)
			physics.updateVelocities(skip)
			expect(velocitiesA.callCount).to.equal(0)
			expect(velocitiesB.callCount).to.equal(1)
		} finally {
			displacementsA.restore()
			displacementsB.restore()
			velocitiesA.restore()
			velocitiesB.restore()
		}
	})

	it('should keep the boolean whole-frame skip', () => {
		const { player, a, b } = setupBalls()
		const physics = player.getPhysics()
		const displacementsA = sinon.spy(a.getMover(), 'updateDisplacements')
		const displacementsB = sinon.spy(b.getMover(), 'updateDisplacements')
		try {
			physics.physicsSimulateCycle(0.016, true)
			expect(displacementsA.callCount).to.equal(0)
			expect(displacementsB.callCount).to.equal(0)
			physics.physicsSimulateCycle(0.016, false)
			expect(displacementsA.callCount).to.be.greaterThan(0)
			expect(displacementsB.callCount).to.be.greaterThan(0)
		} finally {
			displacementsA.restore()
			displacementsB.restore()
		}
	})
})
