// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as sinon from 'sinon'
import { TableBuilder } from '../../test/table-builder.js'
import { ThreeHelper } from '../../test/three.helper.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import type { FlipperMover } from '../vpt/flipper/flipper-mover.js'
import { Table } from '../vpt/table/table.js'
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

	it('should fire on time when a mid-loop Interval write shortens the timer', async () => {
		const three = new ThreeHelper()
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		const timer = table.timers.Timer1.getApi()
		timer.Enabled = true
		timer.Interval = 100
		const fires: number[] = []
		timer.on('Timer', () => fires.push(player.getGameTime()))

		// Mimics a Hit handler: the collide phase runs after the timer scan in
		// the same substep, so a reprogram here must take effect on the next substep.
		const physics = player.getPhysics()
		const orig = physics.updateVelocities.bind(physics)
		let reprogrammed = false
		const stub = sinon.stub(physics, 'updateVelocities').callsFake((): void => {
			orig()
			if (!reprogrammed) {
				reprogrammed = true
				timer.Interval = 5
			}
		})
		try {
			player.updatePhysics(100)
		} finally {
			stub.restore()
		}
		// Reprogrammed at game time 0 to a 5 ms interval.
		expect(fires.slice(0, 3)).to.deep.equal([5, 10, 15])
	})

	it('should step nudge dynamics per substep so movers read fresh acceleration', () => {
		const table = new TableBuilder().withTableScript('').build('Table1')
		const player = new Player(table).init({})
		player.nudge(0, 10)

		// Sample what BallMover sees: updateVelocities runs after the nudge
		// step in every substep, so the acceleration must evolve across them.
		const physics = player.getPhysics()
		const orig = physics.updateVelocities.bind(physics)
		const seen: number[] = []
		const stub = sinon.stub(physics, 'updateVelocities').callsFake((): void => {
			seen.push(physics.getCabinetAcceleration().y)
			orig()
		})
		try {
			expect(player.updatePhysics(10)).to.equal(10)
		} finally {
			stub.restore()
		}
		expect(seen.length).to.equal(10)
		expect(new Set(seen).size).to.be.above(1)
	})

	it('should fire staggered update timers on the same ticks', async () => {
		const three = new ThreeHelper()
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		const timer = table.timers.Timer1.getApi()
		timer.Enabled = true
		timer.Interval = 30
		const fires: number[] = []
		timer.on('Timer', () => fires.push(player.getGameTime()))
		expect(player.updatePhysics(100)).to.equal(100)
		expect(fires).to.deep.equal([30, 60, 90])
		timer.Enabled = false
		player.updatePhysics(150)
		timer.Enabled = true
		timer.Interval = 20
		const rearmed: number[] = []
		timer.on('Timer', () => rearmed.push(player.getGameTime()))
		player.updatePhysics(200)
		expect(rearmed).to.deep.equal([170, 190])
	})
})
