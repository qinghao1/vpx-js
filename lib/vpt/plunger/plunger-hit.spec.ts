// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { createBall } from '../../../test/physics.helper'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { CollisionEvent } from '../../physics/collision-event.js'
import { Table } from '../table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball plunger collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-plunger.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should collide with the plunger', () => {
		// create ball
		const ball = createBall(player, 333, 1700, 0, 0, 2)

		// let it roll down to the plunger. The unfired tip rests at the park
		// position (no idle spring without a mech sensor), so the ball comes
		// to rest on the parked tip, lower than the old crept-to-end rest.
		player.updatePhysics(0)
		player.updatePhysics(2500)

		expect(ball.getState().pos.y).to.be.within(1830, 1833)
	})

	it('should collide with the side of the plunger', () => {
		// create ball
		const ball = createBall(player, 255, 1870, 0, 5, 5)

		player.updatePhysics(0)
		expect(ball.getState().pos.x).to.be.below(260)

		player.updatePhysics(40)
		expect(ball.getState().pos.x).to.be.above(270)

		player.updatePhysics(160)
		expect(ball.getState().pos.x).to.be.below(270)
	})

	it('should move down along with the plunger', () => {
		// create ball
		const ball = createBall(player, 333, 1700, 0, 0, 2)
		const plunger = table.plungers.ModernPlunger.getApi()

		// let it roll down to the plunger
		player.updatePhysics(0)
		player.updatePhysics(700)

		// pull down plunger
		plunger.PullBack()
		player.updatePhysics(1870)

		expect(ball.getState().pos.y).to.be.within(1894, 1898)
	})

	it('should fire the ball to the top', () => {
		// create ball
		const ball = createBall(player, 333, 1700, 0, 0, 2)
		const plunger = table.plungers.ModernPlunger.getApi()

		plunger.PullBack()

		// let it roll down to the pulled down plunger
		player.updatePhysics(0)
		player.updatePhysics(1500)

		expect(ball.getState().pos.y).to.be.within(1894, 1898)

		// fire!
		plunger.Fire()
		player.updatePhysics(2800)

		// FIX_PHYSICS: 100.64 (was 90.69), same margin.
		expect(ball.getState().pos.y).to.be.below(110)
	})

	it('should not stamp lastPlungerHit on a miss', () => {
		const physics = player.getPhysics()
		physics.timeMsec = 4242
		const hit = table.plungers.ModernPlunger.getHitShapes()[0]
		const ball = createBall(player, 100, 100, 0)

		const coll = CollisionEvent.claim(ball)
		const hitTime = hit.hitTest(ball, 1, coll, physics)
		CollisionEvent.release(coll)

		expect(hitTime).to.equal(-1)
		expect(physics.lastPlungerHit).to.equal(0)
	})

	it('should stamp lastPlungerHit when the ball hits the plunger', () => {
		createBall(player, 333, 1700, 0, 0, 2)

		// The static parked tip meets the falling ball later than the old
		// creeping tip did; the ball arrives after ~1500ms.
		player.updatePhysics(0)
		player.updatePhysics(2000)

		expect(player.getPhysics().lastPlungerHit).to.be.above(0)
	})
})
