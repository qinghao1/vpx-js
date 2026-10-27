// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { MathUtils } from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import type { EventProxy } from '../../game/event-proxy.js'
import { Player } from '../../game/player.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Vertex2D } from '../../math/vector.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import { Table } from '../table/table.js'
import type { FlipperConfig } from './flipper.js'
import { FlipperMover } from './flipper-mover.js'
import type { FlipperState } from './flipper-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball flipper physics', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should move to the end when solenoid is on', async () => {
		const flipper = table.flippers.FlipperR
		const flipperState = flipper.getState()
		const endAngleRad = MathUtils.degToRad(flipper.getFlipperData().endAngle)

		flipper.getApi().RotateToEnd()
		player.simulateTime(100)

		expect(flipperState.angle).to.equal(endAngleRad)
	})

	it('should move to the start when solenoid is off again', async () => {
		const flipper = table.flippers.FlipperR
		const flipperState = flipper.getState()
		const startAngleRad = MathUtils.degToRad(flipper.getFlipperData().startAngle)

		// move up
		flipper.getApi().RotateToEnd()
		player.updatePhysics(52) // hit at 51ms

		// move down again
		flipper.getApi().RotateToStart()
		player.updatePhysics(300)

		expect(flipperState.angle).to.equal(startAngleRad)
	})

	it('should fire LimitEOS at the end and LimitBOS at the start', async () => {
		const flipper = table.flippers.FlipperR
		const api = flipper.getApi()
		let eosCount = 0
		let bosCount = 0
		api.on('LimitEOS', () => eosCount++)
		api.on('LimitBOS', () => bosCount++)

		api.RotateToEnd()
		player.simulateTime(100)
		expect(eosCount).to.equal(1)
		expect(bosCount).to.equal(0)

		api.RotateToStart()
		player.simulateTime(400)
		expect(eosCount).to.equal(1)
		expect(bosCount).to.equal(1)
	})

	it('should move back to end when pressed while moving', async () => {
		const flipper = table.flippers.FlipperR
		const flipperState = flipper.getState()
		const startAngleRad = MathUtils.degToRad(flipper.getFlipperData().startAngle)
		const endAngleRad = MathUtils.degToRad(flipper.getFlipperData().endAngle)

		// move up
		flipper.getApi().RotateToEnd()
		player.updatePhysics(52) // hit at 51ms
		expect(flipperState.angle).to.be.above(startAngleRad)

		// move down
		flipper.getApi().RotateToStart()
		player.updatePhysics(200)

		// assert it's in the middle
		expect(flipperState.angle).to.be.above(startAngleRad)
		expect(flipperState.angle).to.be.below(endAngleRad)

		// move up again
		flipper.getApi().RotateToEnd()
		player.updatePhysics(500)

		// assert it's back up in less than half the time
		expect(flipperState.angle).to.equal(endAngleRad)
	})

	it('should claim the angle in radians before setup', () => {
		const table = new TableBuilder().addFlipper('flipper').build()
		const flipper = table.flippers.flipper

		expect(flipper.getState().angle).to.equal(MathUtils.degToRad(flipper.getFlipperData().startAngle))
	})

	describe('flipper shape inertia (upstream FIX_PHYSICS port)', () => {
		// Tapered flipper: base 25, end 10, length 80, mass 1. Reference values are
		// upstream FlipperMoverObject::UpdateInertia (src/physics/hitflipper.cpp:85-176,
		// unconditional under FIX_PHYSICS per src/physics/physconst.h:114) evaluated in
		// double precision; upstream float32 rounds them at ~1e-6 relative, hence tolerances.
		const BASE = 25
		const END = 10
		const LENGTH = 80
		const INERTIA_SHAPE = 1645.42981
		const TORQUE_SCALE = 0.7712952

		function makeTaperedMover(): { mover: FlipperMover; state: FlipperState } {
			const built = new TableBuilder()
				.addFlipper('flipper', { mass: 1, strength: 2200, rampUp: 0, torqueDampingAngle: 0 })
				.build()
			const flipper = built.flippers.flipper
			const config: FlipperConfig = {
				center: new Vertex2D(0, 0),
				baseRadius: BASE,
				endRadius: END,
				flipperRadius: LENGTH,
				angleStart: 0,
				angleEnd: 1,
				zLow: 0,
				zHigh: 50,
			}
			const events = { fireVoidEventParm() {} } as unknown as EventProxy
			const mover = new FlipperMover(
				config,
				flipper.getFlipperData(),
				flipper.getState(),
				events,
				{} as unknown as PlayerPhysics,
				built.data!,
			)
			return { mover, state: flipper.getState() }
		}

		it('should compute the upstream shape-accurate inertia and torque scale', () => {
			const { mover } = makeTaperedMover()
			// the rod model would give flipr^2/3 = 2133.33; the tapered shape is lighter at the tip
			expect(mover.inertiaShape).to.be.closeTo(INERTIA_SHAPE, 0.05)
			expect(mover.torqueScale).to.be.closeTo(TORQUE_SCALE, 1e-4)
			expect(mover.inertia).to.be.closeTo(INERTIA_SHAPE, 0.05) // mass 1
			expect(mover.zeroAngNorm.x).to.be.closeTo(0.9822646, 1e-6)
			expect(mover.zeroAngNorm.y).to.be.closeTo(-0.1875, 1e-12)
			expect(mover.getMass()).to.be.closeTo(1, 1e-12)
			mover.setMass(2)
			expect(mover.inertia).to.be.closeTo(2 * INERTIA_SHAPE, 0.1)
			expect(mover.getMass()).to.be.closeTo(2, 1e-12)
		})

		it('should swing as fast as the rod model it was tuned against', () => {
			const { mover } = makeTaperedMover()
			mover.setSolenoidState(true)
			mover.updateVelocities()
			// one step: omega = PHYS_FACTOR * strength * torqueScale / inertia, which the
			// torque scaling (hitflipper.cpp:433,456) makes identical to the rod value
			// PHYS_FACTOR * strength / (flipr^2/3) = 0.103125
			expect(mover.angleSpeed).to.be.closeTo(0.103125, 1e-9)

			const { mover: swing, state } = makeTaperedMover()
			swing.setSolenoidState(true)
			let steps = 0
			while (state.angle < 1 && steps < 1000) {
				swing.updateVelocities()
				swing.updateDisplacements(PHYS_FACTOR)
				steps++
			}
			// discrete constant-acceleration swing over 1 rad at alpha = 1.03125 rad/VPT^2
			// reaches the end in 14 steps; the unscaled rod model gives the same count
			expect(state.angle).to.equal(1)
			expect(steps).to.be.within(12, 16)
		})

		it('should kick the ball with the upstream shape-inertia impulse', () => {
			const { mover } = makeTaperedMover()
			// upstream HitFlipper::Collide (src/physics/hitflipper.cpp:1001): impulse =
			// -(1+eps)*bnv/denom with denom = invMass + n.(cross(angResp/inertia, rF)).
			// Ball mass 1, eps 0.25, face hit at mid-flipper rF = (40, 0) with normal
			// (0, 1), so angResp.z = 40 and denom = 1 + 40*40/inertia.
			const denom = 1 + (40 * 40) / mover.inertia
			const kick = ((1 + 0.25) * 10) / denom
			// rod inertia (2133.33) would kick at 7.142857; the accurate tapered
			// inertia takes more angular momentum, so the ball leaves slower: 6.337488
			expect(kick).to.be.closeTo(6.337488, 1e-4)
			expect(kick).to.be.below(7.1428571 - 0.5)
		})
	})

	it('should return the proper state', () => {
		const flipper = table.flippers.FlipperR

		// move up
		flipper.getApi().RotateToEnd()
		player.simulateTime(25) // hit at 17.012061224193429107ms (at 1000fps)

		const flipperState = flipper.getState()
		const states = player.popStates()

		const poppedState = states.getState<FlipperState>('FlipperR')

		expect(flipperState.name).to.eql(poppedState.name)
		expect(flipperState.angle).to.eql(poppedState.angle)
		states.release()
	})
})
