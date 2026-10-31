// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { createBall } from '../../../test/physics.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Vertex2D, Vertex3D } from '../../math/vector.js'
import { CollisionEvent } from '../../physics/collision-event.js'
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

	describe('bevel deflection', () => {
		it('should deflect a fast ball rolling over the bevel without capturing it', () => {
			const kicker = table.kickers.Williams
			expect(kicker.data.legacyMode).to.equal(false)
			// z=25 stays above the grab height so the ball skims the bevel.
			const ball = createBall(player, kicker.data.center.x, kicker.data.center.y, 25, 5, 0, 0)
			kicker.getHit().doCollide(player.getPhysics(), ball, new Vertex3D(1, 0, 0), false, false)
			expect(kicker.getHit().ball).to.be.undefined
			expect(ball.hit.vel.x).to.be.below(5)
			expect(ball.hit.vel.y).to.not.equal(0)
			expect(ball.oldVel.x).to.be.closeTo(ball.hit.vel.x, 1e-12)
		})

		it('should keep the last good velocity when the ball slows below 0.2 on the bevel', () => {
			// Upstream "ugly hack": friction misbehaves at the bevel, so a ball
			// dropping under 0.2 keeps its last good velocity (kicker.cpp).
			const kicker = table.kickers.Williams
			const ball = createBall(player, kicker.data.center.x, kicker.data.center.y, 25, 0.1, 0, 0)
			ball.oldVel.set(3, 0.5, 0)
			kicker.getHit().doCollide(player.getPhysics(), ball, new Vertex3D(1, 0, 0), false, false)
			expect(kicker.getHit().ball).to.be.undefined
			expect(ball.hit.vel.x).to.equal(3)
			expect(ball.hit.vel.y).to.equal(0.5)
		})
	})

	describe('volume gating', () => {
		it('should capture on Hit-outside-volume and release on UnHit-inside-volume only', () => {
			// Upstream: if (newBall || ((!hitbit) == (i < 0))) — KickerHitCircle::DoCollide.
			const gated = new TableBuilder()
				.addKicker('enter', {})
				.addKicker('exit', {})
				.addKicker('noopHit', {})
				.addKicker('noopUnhit', {})
				.build()
			const gatedPlayer = new Player(gated).init()
			const physics = gatedPlayer.getPhysics()
			const normal = new Vertex3D(1, 0, 0)

			// Hit while outside the volume -> capture.
			const enter = gated.kickers.enter
			const entering = createBall(gatedPlayer, enter.data.center.x, enter.data.center.y, 25)
			enter.getHit().doCollide(physics, entering, normal, false, false)
			expect(enter.getHit().ball).to.equal(entering)
			expect(entering.state.isFrozen).to.equal(true)
			expect(entering.hit.vpVolObjs).to.include(enter.getHit().obj)

			// UnHit while inside the volume -> leave the volume without capturing.
			const exit = gated.kickers.exit
			const leaving = createBall(gatedPlayer, exit.data.center.x, exit.data.center.y, 25)
			leaving.hit.vpVolObjs.push(exit.getHit().obj)
			exit.getHit().doCollide(physics, leaving, normal, true, false)
			expect(exit.getHit().ball).to.be.undefined
			expect(leaving.hit.vpVolObjs).to.not.include(exit.getHit().obj)

			// UnHit while outside the volume -> ignore.
			const noopUnhit = gated.kickers.noopUnhit
			const outside = createBall(gatedPlayer, noopUnhit.data.center.x, noopUnhit.data.center.y, 25)
			noopUnhit.getHit().doCollide(physics, outside, normal, true, false)
			expect(noopUnhit.getHit().ball).to.be.undefined
			expect(outside.hit.vpVolObjs).to.be.empty

			// Hit while inside the volume -> ignore.
			const noopHit = gated.kickers.noopHit
			const inside = createBall(gatedPlayer, noopHit.data.center.x, noopHit.data.center.y, 25)
			inside.hit.vpVolObjs.push(noopHit.getHit().obj)
			noopHit.getHit().doCollide(physics, inside, normal, false, false)
			expect(noopHit.getHit().ball).to.be.undefined
			expect(inside.hit.vpVolObjs).to.include(noopHit.getHit().obj)
		})
	})

	describe('capture radius', () => {
		it('should shrink the capture radius of legacy kickers to 60%', () => {
			const kicker = table.kickers.Cup
			expect(kicker.data.legacyMode).to.equal(true)
			expect(kicker.data.fallThrough).to.equal(false)
			expect(kicker.getHit().radius).to.be.closeTo(kicker.data.radius * 0.6, 1e-6)
		})

		it('should shrink the capture radius of legacy fall-through kickers to 75%', () => {
			const kicker = table.kickers.Cup2
			expect(kicker.data.legacyMode).to.equal(true)
			expect(kicker.data.fallThrough).to.equal(true)
			expect(kicker.getHit().radius).to.be.closeTo(kicker.data.radius * 0.75, 1e-6)
		})

		it('should keep the full capture radius of modern kickers', () => {
			const kicker = table.kickers.Williams
			expect(kicker.data.legacyMode).to.equal(false)
			expect(kicker.getHit().radius).to.be.closeTo(kicker.data.radius, 1e-6)
		})
	})

	describe('capture height parity', () => {
		it('should capture a ball resting inside a healthy kicker volume', () => {
			// Upstream 2D branch (HitTestBasicRadius, collide.cpp): the ball rolls
			// below the cylinder top, so inside (!in-vol) reports Hit at time 0 and
			// DoCollide freezes it at the center (KickerHitCircle, kicker.cpp).
			const built = new TableBuilder()
				.addKicker('hole', {
					center: new Vertex2D(500, 500),
					radius: 25,
					hitHeight: 40,
					legacyMode: true,
				})
				.build()
			const builtPlayer = new Player(built).init()
			const kicker = built.kickers.hole
			const ball = createBall(builtPlayer, 510, 500, 0, 0, 0, 0)
			const hitTime = kicker.getHit().hitTest(ball, 1, new CollisionEvent(ball))
			expect(hitTime).to.be.at.least(0)
			kicker.getHit().doCollide(builtPlayer.getPhysics(), ball, new Vertex3D(1, 0, 0), false, false)
			expect(ball.state.isFrozen).to.equal(true)
			expect(ball.state.pos.x).to.be.closeTo(500, 1e-6)
			expect(ball.state.pos.y).to.be.closeTo(500, 1e-6)
		})

		it('should never fire for a roller over a cylinder top below ball rest height', () => {
			// Upstream capsule branch (HitTestBasicRadius, collide.cpp): the ball
			// rides above the cylinder top, and the capsule sphere around the buried
			// center never meets the playfield plane, so no Hit fires at any speed.
			const built = new TableBuilder()
				.addKicker('shallow', {
					center: new Vertex2D(500, 500),
					radius: 22,
					hitHeight: 20,
					legacyMode: true,
				})
				.build()
			const builtPlayer = new Player(built).init()
			const kicker = built.kickers.shallow
			expect(kicker.getHit().radius).to.be.closeTo(13.2, 1e-6)
			for (const offset of [-30, -10, 10, 30]) {
				for (const speed of [0.5, 30]) {
					const vx = offset > 0 ? -speed : speed
					const ball = createBall(builtPlayer, 500 + offset, 500, 0, vx, 0, 0)
					const hitTime = kicker.getHit().hitTest(ball, 1, new CollisionEvent(ball))
					expect(hitTime, `offset ${offset} speed ${speed}`).to.be.below(0)
					expect(ball.state.isFrozen).to.equal(false)
					builtPlayer.destroyBall(ball)
				}
			}
		})
	})

	// add second ball
})
