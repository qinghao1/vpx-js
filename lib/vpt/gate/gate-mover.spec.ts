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
import type { GateState } from './gate-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball gate mover', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-gate.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should make the two-way gate bracket move', () => {
		const gate = table.gates.Plate

		// create ball
		createBall(player, 380, 1340, 0, 0, 10)

		// assert initial position
		expect(gate.getState().angle).to.equal(0)

		player.updatePhysics(100)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(70, 76)
		player.updatePhysics(150)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(13, 18)
		player.updatePhysics(200)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(-80, -75)
		player.updatePhysics(300)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(30, 35)
		player.updatePhysics(600)
		// FIX_PHYSICS: -84.16 (was -79.18), same window width.
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(-87, -83)
		player.updatePhysics(1990)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(-32, -20)
	})

	it('should make the two-way gate bracket stand still', () => {
		const gate = table.gates.Plate

		// create ball
		createBall(player, 380, 1340, 0, 0, 2)

		// assert initial position
		expect(gate.getState().angle).to.equal(0)

		player.updatePhysics(500)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.above(40)
		player.updatePhysics(4090)
		expect(gate.getState().angle).to.be.closeTo(0, 0.01)
	})

	it('should make the gate one-way gate bracket move and stand still', () => {
		const gate = table.gates.WireRectangle

		// create ball
		createBall(player, 530, 1500, 0, 0, -10)

		// assert initial position
		expect(gate.getState().angle).to.equal(0)

		player.updatePhysics(100)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(69, 73)
		player.updatePhysics(150)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(60, 75)
		player.updatePhysics(200)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(60, 82)
		player.updatePhysics(1000)
		expect(MathUtils.radToDeg(gate.getState().angle)).to.be.within(15, 25)
		player.updatePhysics(1970)
		expect(gate.getState().angle).to.be.closeTo(0, 0.01)
	})

	it('should pull a swinging gate harder with GravityFactor 50 and stick it at rest', () => {
		const gate = table.gates.Plate
		const api = gate.getApi()
		const mover = gate.getMover()
		const physics = player.getPhysics()

		// Upstream clamps GravityFactor to [0,100] (gate.cpp put_GravityFactor).
		api.GravityFactor = 50
		expect(api.GravityFactor).to.equal(50)
		// ...while Friction saturates at 1 like upstream (gate.cpp put_Friction).
		api.Friction = 2
		expect(api.Friction).to.equal(1)

		// Same swing, with and without gravity: gravity must change the speed.
		gate.getState().angle = 0.5
		mover.angleSpeed = 0.1
		mover.updateVelocities(physics)
		const withGravity = mover.angleSpeed

		gate.getState().angle = 0.5
		mover.angleSpeed = 0.1
		mover.gravityFactor = 0
		mover.updateVelocities(physics)
		const withoutGravity = mover.angleSpeed
		expect(withGravity).to.not.be.closeTo(withoutGravity, 1e-9)
		expect(withGravity).to.be.below(withoutGravity)

		// Slow near the rest angle: the gate sticks exactly (upstream stops the
		// animation a bit early to avoid a nearly endless swing).
		mover.gravityFactor = 50
		gate.getState().angle = mover.angleMin + 0.005
		mover.angleSpeed = 0.005
		mover.updateVelocities(physics)
		expect(gate.getState().angle).to.equal(mover.angleMin)
		expect(mover.angleSpeed).to.equal(0)
	})

	it('should fire LimitEOS when a manual move reaches its angle', () => {
		const gate = table.gates.Plate
		const api = gate.getApi()
		let eosCount = 0
		api.on('LimitEOS', () => eosCount++)

		api.move(1, 1, 30)
		player.updatePhysics(500)

		expect(Math.round(MathUtils.radToDeg(gate.getState().angle))).to.equal(30)
		expect(eosCount).to.be.greaterThan(0)
	})

	it('should return the proper state', () => {
		const gate = table.gates.WireRectangle

		// create ball
		createBall(player, 530, 1500, 0, 0, -10)

		// assert initial position
		expect(gate.getState().angle).to.equal(0)

		player.updatePhysics(150)

		const gateState = gate.getState()
		const states = player.popStates()

		const poppedState = states.getState<GateState>('WireRectangle')

		expect(gateState.name).to.equal(poppedState.name)
		expect(gateState.angle).to.equal(poppedState.angle)
	})
})
