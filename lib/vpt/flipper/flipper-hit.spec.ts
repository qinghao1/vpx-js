// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { MathUtils } from 'three'
import { createBall } from '../../../test/physics.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Vertex3D } from '../../math/vector.js'
import { CollisionEvent } from '../../physics/collision-event.js'
import { C_CONTACTVEL, C_PRECISION } from '../../physics/constants.js'
import { Table } from '../table/table.js'
import type { FlipperHit } from './flipper-hit.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball flipper collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should collide with the ball when hitting on the face', () => {
		// put ball on top of flipper face
		const ball = createBall(player, 350, 1600, 0)

		player.updatePhysics(0)
		player.updatePhysics(2000)

		expect(ball.getState().pos.x).to.be.above(420) // diverted to the right
		expect(ball.getState().pos.y).to.be.above(1650) // but still below
	})

	it('should collide with the ball when hitting on the end', () => {
		// put ball on top of flipper end
		const ball = createBall(player, 420, 1645, 0)

		player.updatePhysics(0)
		player.updatePhysics(2000)

		expect(ball.getState().pos.x).to.be.above(460) // diverted to the right
		expect(ball.getState().pos.y).to.be.above(1670) // but still below
	})

	it('should roll on the flipper', () => {
		// put ball on top of flipper
		const ball = createBall(player, 310, 1590, 0)

		player.updatePhysics(0)
		player.updatePhysics(2000)

		// assert it's on flipper's bottom
		expect(ball.getState().pos.x).to.be.within(393, 401)
		expect(ball.getState().pos.y).to.be.within(1647, 1651)
	})

	it('should move the ball up', () => {
		const flipper = table.flippers.DefaultFlipper.getApi()

		// put ball on top of flipper
		const ball = createBall(player, 310, 1590, 0)

		// let it roll a bit
		player.updatePhysics(0)
		player.updatePhysics(1500)

		// now, flip
		flipper.RotateToEnd()
		player.updatePhysics(1550)

		// should be moving top right
		expect(ball.getState().pos.x).to.be.above(380)
		expect(ball.getState().pos.y).to.be.below(1550)
	})

	it('should push the coil down when hit with high speed', () => {
		const flipper = table.flippers.DefaultFlipper
		createBall(player, 395, 1547, 0, 0, 20)

		// assert initial flipper position
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.equal(121)

		// let it collide
		player.updatePhysics(0)
		player.updatePhysics(100)

		expect(MathUtils.radToDeg(flipper.getState().angle)).to.be.below(115)
	})

	it('should move when hit at the same time', () => {
		const flipper = table.flippers.DefaultFlipper.getApi()

		// shoot ball onto flipper and flip at the same time
		const ball = createBall(player, 420, 1550, 0, 0, 5)
		flipper.RotateToEnd()

		player.updatePhysics(0)
		player.updatePhysics(280)

		// should be moving up. With the shape-accurate inertia the flipper takes more
		// angular momentum, so the active-flip kick is ~8% weaker than the old rod model
		// (y 882.6 vs 827.0 for this 21.5/13/130 flipper, I_new/I_rod = 0.897).
		expect(ball.getState().pos.y).to.be.within(850, 920)

		// now, flip
		flipper.RotateToEnd()
		player.updatePhysics(1550)
	})

	it('should slide on the flipper', () => {
		// shoot ball parallel onto flipper
		const ball = createBall(player, 214, 1520, 0, 10, 7.1)

		player.updatePhysics(0)
		expect(ball.getState().pos.x).to.equal(214)
		expect(ball.getState().pos.y).to.equal(1520)

		player.updatePhysics(50)
		expect(ball.getState().pos.x).to.be.within(259, 263)
		expect(ball.getState().pos.y).to.be.within(1552, 1556)

		player.updatePhysics(100)
		expect(ball.getState().pos.x).to.be.within(306, 310)
		expect(ball.getState().pos.y).to.be.within(1586, 1590)

		player.updatePhysics(150)
		expect(ball.getState().pos.x).to.be.within(350, 354)
		expect(ball.getState().pos.y).to.be.within(1617, 1621)
	})

	it('should lengthen a degenerate flipper whose circles swallow each other', () => {
		// Upstream Flipper::PhysicSetup lengthens the flipper when one circle
		// sits inside the other (no tangent faces: NaN normals/inertia).
		const brokenTable = new TableBuilder()
			.addFlipper('Broken', { baseRadius: 10, endRadius: 25, flipperRadiusMax: 5 })
			.build()
		new Player(brokenTable).init()
		const hit = brokenTable.flippers.Broken.getHitShapes()[0] as FlipperHit
		expect(hit.getMoverObject().flipperRadius).to.be.closeTo(15.05, 1e-9)
	})

	it('should apply upstream static friction in flipper contact', () => {
		// Ball at rest against a tilted contact normal: zero slip velocity but nonzero
		// tangential slip acceleration (gravity), i.e. the static-friction regime of
		// upstream HitFlipper::Contact (src/physics/hitflipper.cpp).
		const flipperHit = table.flippers.DefaultFlipper.getHitShapes()[0] as FlipperHit
		const mover = flipperHit.getMoverObject()
		const baseCenter = mover.hitCircleBase.center
		const ball = createBall(player, baseCenter.x + 70, baseCenter.y + 10, 25)
		ball.hit.vel.set(0, 0, 0)
		ball.hit.angularVelocity.set(0, 0, 0)
		ball.hit.angularMomentum.set(0, 0, 0)
		const physics = player.getPhysics()
		const normal = new Vertex3D(0, -0.35, 1).normalize()
		const stepTime = 0.001
		const ballArm = normal.clone().multiplyScalar(-ball.data.radius)
		const pivotPoint = new Vertex3D(baseCenter.x, baseCenter.y, ball.getState().pos.z)
		const flipperArm = ball.getState().pos.clone().add(ballArm).sub(pivotPoint)
		const relVel = ball.hit.surfaceVelocity(ballArm).sub(mover.surfaceVelocity(flipperArm))
		const normalVel = relVel.dot(normal)
		const slip = relVel.clone().sub(normal.clone().multiplyScalar(normalVel))
		const relAcc = ball.hit.surfaceAcceleration(ballArm, physics).sub(mover.surfaceAcceleration(flipperArm))
		const normalDeriv = Vertex3D.crossZ(mover.angleSpeed, normal)
		const normalAcc = relAcc.dot(normal) + 2 * normalDeriv.dot(relVel)
		const slipAcc = relAcc.clone().sub(normal.clone().multiplyScalar(relAcc.dot(normal)))
		expect(normalVel).to.be.below(C_CONTACTVEL)
		expect(slip.length()).to.be.below(C_PRECISION)
		expect(slipAcc.lengthSq()).to.be.above(1e-6)
		expect(normalAcc).to.be.below(0)
		// Upstream normal impulse.
		const normalResponse = Vertex3D.crossProduct(flipperArm, normal.clone().multiplyScalar(-1))
		const flipperContactAcc = Vertex3D.crossProduct(normalResponse.clone().divideScalar(mover.inertia), flipperArm)
		const contactAcc = normal.dot(normal.clone().multiplyScalar(ball.hit.invMass).sub(flipperContactAcc))
		const normalImpulse = contactAcc > 1e-7 ? -normalAcc / contactAcc : 0
		// Upstream static friction: flipper inertia enters with a positive sign.
		const slipDir = slipAcc.clone().normalize()
		const numer = -slipDir.dot(relAcc)
		const frictionArmFlipper = Vertex3D.crossProduct(flipperArm, slipDir)
		const denomFlipper = slipDir.dot(
			Vertex3D.crossProduct(frictionArmFlipper.clone().divideScalar(mover.inertia), flipperArm),
		)
		const frictionArmBall = Vertex3D.crossProduct(ballArm, slipDir)
		const denomBall =
			ball.hit.invMass +
			slipDir.dot(Vertex3D.crossProduct(frictionArmBall.clone().divideScalar(ball.hit.inertia), ballArm))
		const maxFriction = Math.abs(normalImpulse * flipperHit.friction)
		const friction =
			denomBall + denomFlipper > 1e-7
				? MathUtils.clamp(numer / (denomBall + denomFlipper), -maxFriction, maxFriction)
				: 0
		const expectedVel = normal
			.clone()
			.multiplyScalar(normalImpulse * stepTime * ball.hit.invMass)
			.add(slipDir.clone().multiplyScalar(stepTime * friction * ball.hit.invMass))
		const expectedFlipperSpeed =
			(normalResponse.z * normalImpulse * stepTime - frictionArmFlipper.z * stepTime * friction) / mover.inertia

		const coll = new CollisionEvent(ball)
		coll.hitNormal.set(normal.x, normal.y, normal.z)
		coll.hitDistance = 0
		coll.hitOrgNormalVelocity = 0
		flipperHit.contact(coll, stepTime, physics)

		expect(ball.hit.vel.x).to.be.closeTo(expectedVel.x, 1e-9)
		expect(ball.hit.vel.y).to.be.closeTo(expectedVel.y, 1e-9)
		expect(ball.hit.vel.z).to.be.closeTo(expectedVel.z, 1e-9)
		expect(mover.angleSpeed).to.be.closeTo(expectedFlipperSpeed, 1e-9)
	})

	it('should move the flipper up when hit from below', () => {
		const flipper = table.flippers.DefaultFlipper

		// shoot ball from below onto flipper
		createBall(player, 374, 1766, 0, 0, -10)

		player.updatePhysics(0)
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.equal(121)

		player.updatePhysics(50)
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.be.below(121)

		player.updatePhysics(100)
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.be.below(110)

		player.updatePhysics(150)
		// The shape-accurate inertia (I_new/I_rod = 0.897 for this 21.5/13/130 flipper)
		// recoils deeper, so the return runs ~50 ms behind the old rod model (109.2 vs 111.7).
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.be.within(108, 111)

		player.updatePhysics(200)
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.be.above(115)

		// ...but it still settles back fully, one step later.
		player.updatePhysics(250)
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.equal(121)
	})
})
