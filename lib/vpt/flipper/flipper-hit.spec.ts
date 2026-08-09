// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { MathUtils } from 'three'
import { createBall } from '../../../test/physics.helper'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'

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

		// should be moving up
		expect(ball.getState().pos.y).to.be.below(830)

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
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.be.above(110)

		player.updatePhysics(200)
		expect(MathUtils.radToDeg(flipper.getState().angle)).to.equal(121)
	})
})
