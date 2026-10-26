// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { vi } from 'vitest'
import { createBall } from '../../../test/physics.helper'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Vertex3D } from '../../math/vector.js'
import { CollisionEvent } from '../../physics/collision-event.js'
import { Table } from '../table/table.js'
import { BallHit } from './ball-hit.js'

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

	it('should aim the grazing ball-ball normal along the line of centers at contact', async () => {
		const target = createBall(player, 0, 0, 25)
		const mover = createBall(player, 60, 20, 25, -100, 0, 0)

		const coll = new CollisionEvent(mover)
		const hitTime = target.hit.hitTest(mover, 10, coll)
		expect(hitTime).to.be.above(0)

		// Independent oracle: both centers advanced to the contact time.
		const targetPos = target.getState().pos
		const moverPos = mover.getState().pos
		const lineX = moverPos.x + mover.hit.vel.x * hitTime - (targetPos.x + target.hit.vel.x * hitTime)
		const lineY = moverPos.y + mover.hit.vel.y * hitTime - (targetPos.y + target.hit.vel.y * hitTime)
		const lineLength = Math.hypot(lineX, lineY)
		expect(coll.hitNormal.x).to.be.closeTo(lineX / lineLength, 1e-9)
		expect(coll.hitNormal.y).to.be.closeTo(lineY / lineLength, 1e-9)
		expect(coll.hitNormal.z).to.be.closeTo(0, 1e-9)
	})
})

describe('FIX_PHYSICS ball contacts', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-empty.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should report a slow ball-ball touch as a contact at time 0', async () => {
		const target = createBall(player, 0, 0, 0)
		const mover = createBall(player, 50.02, 0, 0)
		const coll = new CollisionEvent(mover)
		expect(target.hit.hitTest(mover, 1, coll)).to.equal(0)
		expect(coll.isContact).to.equal(true)
		expect(coll.hitOrgNormalVelocity).to.be.closeTo(0, 1e-9)
	})

	it('should treat deep ball-ball overlap as a collision, not a contact', async () => {
		const target = createBall(player, 0, 0, 0)
		const mover = createBall(player, 49.4, 0, 0)
		const coll = new CollisionEvent(mover)
		expect(target.hit.hitTest(mover, 1, coll)).to.equal(0)
		expect(coll.isContact).to.equal(false)
	})

	it('should keep a resting-scale ball-ball impact inelastic', async () => {
		const target = createBall(player, 1000, 0, 0)
		const mover = createBall(player, 1050, 0, 0, -0.2, 0, 0)
		const coll = new CollisionEvent(mover)
		coll.hitNormal.set(1, 0, 0)
		coll.hitDistance = 0
		target.hit.collide(coll, player.getPhysics())
		expect(mover.hit.vel.x - target.hit.vel.x).to.be.closeTo(0, 1e-9)
	})

	it('should keep restitution 0.8 for a real ball-ball impact', async () => {
		const target = createBall(player, 1000, 0, 0)
		const mover = createBall(player, 1050, 0, 0, -1, 0, 0)
		const coll = new CollisionEvent(mover)
		coll.hitNormal.set(1, 0, 0)
		coll.hitDistance = 0
		target.hit.collide(coll, player.getPhysics())
		expect(mover.hit.vel.x - target.hit.vel.x).to.be.closeTo(0.8, 1e-9)
	})

	it('should skip the displacement pop for a resting-scale impact on shallow overlap', async () => {
		const target = createBall(player, 1000, 0, 0)
		const mover = createBall(player, 1049.9, 0, 0, -0.2, 0, 0)
		const coll = new CollisionEvent(mover)
		coll.hitNormal.set(1, 0, 0)
		coll.hitDistance = -0.1
		target.hit.collide(coll, player.getPhysics())
		expect(mover.getState().pos.x).to.be.closeTo(1049.9, 1e-9)
		expect(target.getState().pos.x).to.be.closeTo(1000, 1e-9)
	})

	it('should resolve a contact against its supporting ball, not a static surface', async () => {
		const support = createBall(player, 2000, 0, 0)
		const ball = createBall(player, 2050, 0, 0, 0.05, 0, 0)
		const physics = player.getPhysics()
		const gravity = physics.gravity.clone()
		physics.gravity.set(0, 0, 0)
		try {
			const spy = vi.spyOn(ball.hit, 'handleStaticContact')
			try {
				const coll = new CollisionEvent(ball)
				coll.hitNormal.set(1, 0, 0)
				coll.hitDistance = 0
				coll.hitOrgNormalVelocity = -0.02
				support.hit.contact(coll, 1, physics)
				expect(spy.mock.calls).to.have.length(1)
				expect(spy.mock.calls[0][4]).to.equal(support.hit)
				// Separating from the support: no stale hit-test impulse, no push-out.
				expect(ball.hit.vel.x).to.be.closeTo(0.05, 1e-9)
				expect(ball.getState().pos.x).to.be.closeTo(2050, 1e-9)
			} finally {
				spy.mockRestore()
			}
		} finally {
			physics.gravity.set(gravity.x, gravity.y, gravity.z)
		}
	})

	it('should bound wall sliding friction by the contact impulse, not gravity', async () => {
		const ball = createBall(player, 3000, 0, 0, 0, 5, 0)
		ball.hit.applyFriction(new Vertex3D(1, 0, 0), 1, 0.3, player.getPhysics(), 0.1)
		// Coulomb bound 0.3 * 1 * 0.1 removes 0.03 of the 5 slip; legacy applies nothing.
		expect(ball.hit.vel.y).to.be.closeTo(4.97, 1e-9)
		expect(ball.hit.vel.z).to.be.closeTo(0, 1e-9)
	})

	it('should not scale sliding friction with the step length', async () => {
		const slow = createBall(player, 3100, 0, 0, 2, 0, 0.05)
		const fast = createBall(player, 3200, 0, 0, 2, 0, 0.05)
		const physics = player.getPhysics()
		const normal = new Vertex3D(0, 0, 1)
		slow.hit.applyFriction(normal, 1, 0.3, physics, 0.1)
		fast.hit.applyFriction(normal, 0.001, 0.3, physics, 0.1)
		expect(slow.hit.vel.x).to.be.closeTo(fast.hit.vel.x, 1e-9)
		expect(slow.hit.vel.x).to.be.closeTo(1.97, 1e-9)
	})

	it('should resolve a resting contact identically for Mass 1 and Mass 2', async () => {
		const physics = player.getPhysics()
		const deltas: number[] = []
		for (const mass of [1, 2]) {
			const ball = createBall(player, 4000 + mass * 100, 0, 25)
			ball.getApi().Mass = mass
			expect(ball.hit.invMass).to.be.closeTo(1 / mass, 1e-12)
			const coll = new CollisionEvent(ball)
			coll.hitNormal.set(0, 0, 1)
			coll.hitDistance = 0
			coll.hitOrgNormalVelocity = -0.01
			const before = ball.hit.vel.z
			ball.hit.handleStaticContact(coll, 0.3, 1, physics)
			deltas.push(ball.hit.vel.z - before)
		}
		// Raw gravity per step plus the recorded approach velocity, with no mass
		// factor: contact constraints cancel acceleration, unlike upstream's
		// legacy mass-scaled normal force (hitball.cpp HandleStaticContact).
		const gdot = physics.gravity.z
		const [delta1, delta2] = deltas
		expect(delta1).to.be.closeTo(-(gdot * 1 + -0.01), 1e-9)
		expect(delta2).to.be.closeTo(delta1 ?? NaN, 1e-9)
	})

	it('should pool the surface acceleration vector when asked', async () => {
		const ball = createBall(player, 500, 500, 25)
		const arm = new Vertex3D(10, 0, 0)
		const physics = player.getPhysics()
		const expected = ball.hit.surfaceAcceleration(arm, physics)
		const spy = vi.spyOn(Vertex3D, 'claim')
		try {
			const pooled = ball.hit.surfaceAcceleration(arm, physics, true)
			expect(spy.mock.calls).to.have.length(1)
			expect([pooled.x, pooled.y, pooled.z]).to.deep.equal([expected.x, expected.y, expected.z])
			Vertex3D.release(pooled)
		} finally {
			spy.mockRestore()
		}
	})

	it('should resolve ball-ball contacts before static contacts', async () => {
		createBall(player, 500, 1050, 0)
		createBall(player, 550, 1050, 0)
		const spy = vi.spyOn(BallHit.prototype, 'handleStaticContact')
		try {
			player.getPhysics().physicsSimulateCycle(1)
			const others: number[] = []
			const statics: number[] = []
			spy.mock.calls.forEach((call, index) => {
				;(call[4] === undefined ? statics : others).push(index)
			})
			expect(others.length).to.be.above(0)
			expect(statics.length).to.be.above(0)
			expect(Math.max(...others)).to.be.below(Math.min(...statics))
		} finally {
			spy.mockRestore()
		}
	})
})
